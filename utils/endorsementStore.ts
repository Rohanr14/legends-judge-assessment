import type { EndorsementApplication, EndorsementSettings } from '../types/types';
import { DEFAULT_ENDORSEMENT_SETTINGS, normalizeEndorsementSettings } from './endorsement';
import { assertRedisConfigured, redis } from './redis';

// Redis layout:
//   endorsementSettings          admin settings for the endorsement application
//   endorsement:app:<id>         one judge's application
//   endorsement:apps             sorted set of application ids, scored by creation time
//   endorsement:email:<email>    application id for an email, so each judge applies once
//   endorsement:lock:<name>      short-lived locks
const SETTINGS_KEY = 'endorsementSettings';
const APPS_KEY = 'endorsement:apps';
const appKey = (id: string) => `endorsement:app:${id}`;
const emailKey = (email: string) => `endorsement:email:${email.trim().toLowerCase()}`;
const lockKey = (name: string) => `endorsement:lock:${name}`;

// Without Redis (local development) everything is kept in memory until the dev server restarts.
type DevStore = {
  settings?: EndorsementSettings;
  apps: Map<string, EndorsementApplication>;
  emails: Map<string, string>;
  locks: Map<string, number>;
};
const devGlobal = globalThis as typeof globalThis & { __legendsEndorsement?: DevStore };
const dev: DevStore = (devGlobal.__legendsEndorsement ??= { apps: new Map(), emails: new Map(), locks: new Map() });

// Dev copies are cloned so callers can't mutate stored state without saving, matching Redis.
const clone = <T>(value: T): T => structuredClone(value);

export async function getEndorsementSettings(): Promise<EndorsementSettings> {
  assertRedisConfigured();
  const stored = redis ? await redis.get(SETTINGS_KEY) : dev.settings;
  return normalizeEndorsementSettings(stored ?? DEFAULT_ENDORSEMENT_SETTINGS);
}

export async function saveEndorsementSettings(settings: EndorsementSettings): Promise<void> {
  assertRedisConfigured();
  if (redis) {
    await redis.set(SETTINGS_KEY, settings);
  } else {
    dev.settings = clone(settings);
  }
}

/** Returns the id of the existing application if this email has already applied. */
export async function findApplicationIdByEmail(email: string): Promise<string | null> {
  assertRedisConfigured();
  return redis ? await redis.get<string>(emailKey(email)) : dev.emails.get(emailKey(email)) ?? null;
}

/** Saves a new application. Returns false (and saves nothing) if the judge's email has already been used. */
export async function createApplication(app: EndorsementApplication): Promise<boolean> {
  assertRedisConfigured();
  if (redis) {
    const claimed = await redis.set(emailKey(app.judge.email), app.id, { nx: true });
    if (claimed !== 'OK') return false;
    await redis.set(appKey(app.id), app);
    await redis.zadd(APPS_KEY, { score: app.createdAt, member: app.id });
    return true;
  }
  if (dev.emails.has(emailKey(app.judge.email))) return false;
  dev.emails.set(emailKey(app.judge.email), app.id);
  dev.apps.set(app.id, clone(app));
  return true;
}

export async function getApplication(id: string): Promise<EndorsementApplication | null> {
  assertRedisConfigured();
  if (redis) return redis.get<EndorsementApplication>(appKey(id));
  const app = dev.apps.get(id);
  return app ? clone(app) : null;
}

export async function saveApplication(app: EndorsementApplication): Promise<void> {
  assertRedisConfigured();
  if (redis) {
    await redis.set(appKey(app.id), app);
  } else {
    dev.apps.set(app.id, clone(app));
  }
}

/** All applications, newest first. */
export async function listApplications(): Promise<EndorsementApplication[]> {
  assertRedisConfigured();
  if (!redis) {
    return [...dev.apps.values()].sort((a, b) => b.createdAt - a.createdAt).map(clone);
  }
  const ids = await redis.zrange<string[]>(APPS_KEY, 0, -1, { rev: true });
  if (ids.length === 0) return [];
  const apps = await redis.mget<(EndorsementApplication | null)[]>(...ids.map(appKey));
  return apps.filter((app): app is EndorsementApplication => app !== null);
}

/** Deletes an application and frees the judge's email so they can apply again. */
export async function deleteApplication(app: EndorsementApplication): Promise<void> {
  assertRedisConfigured();
  if (redis) {
    await redis.del(appKey(app.id), emailKey(app.judge.email));
    await redis.zrem(APPS_KEY, app.id);
    return;
  }
  dev.apps.delete(app.id);
  dev.emails.delete(emailKey(app.judge.email));
}

/** A best-effort lock that expires on its own, so a crashed request can't hold it forever. */
export async function acquireLock(name: string, seconds: number): Promise<boolean> {
  assertRedisConfigured();
  if (redis) {
    return (await redis.set(lockKey(name), 1, { nx: true, ex: seconds })) === 'OK';
  }
  const expires = dev.locks.get(name);
  if (expires && expires > Date.now()) return false;
  dev.locks.set(name, Date.now() + seconds * 1000);
  return true;
}

export async function releaseLock(name: string): Promise<void> {
  if (redis) {
    await redis.del(lockKey(name));
  } else {
    dev.locks.delete(name);
  }
}
