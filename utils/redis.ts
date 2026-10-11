import { Redis } from '@upstash/redis';

// KV_REST_API_URL / KV_REST_API_TOKEN are added automatically when an Upstash Redis
// store is connected to the Vercel project. Without them (local development) callers
// fall back to in-memory storage that lasts until the dev server restarts.
export const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
    : null;

export function assertRedisConfigured() {
  if (!redis && process.env.NODE_ENV === 'production') {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set in production.');
  }
}
