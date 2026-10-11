import type { AdminSettings } from '../types/types';
import { assertRedisConfigured, redis } from './redis';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

const SETTINGS_KEY = 'siteSettings';

// Without Redis (local development) settings are kept in memory until the dev server restarts.
const devStore = globalThis as typeof globalThis & { __legendsSettings?: AdminSettings };

export async function getSettings(): Promise<AdminSettings> {
  assertRedisConfigured();
  const stored = redis ? await redis.get(SETTINGS_KEY) : devStore.__legendsSettings;
  return normalizeSettings(stored ?? DEFAULT_SETTINGS);
}

export async function saveSettings(settings: AdminSettings): Promise<void> {
  assertRedisConfigured();
  if (redis) {
    await redis.set(SETTINGS_KEY, settings);
  } else {
    devStore.__legendsSettings = settings;
  }
}
