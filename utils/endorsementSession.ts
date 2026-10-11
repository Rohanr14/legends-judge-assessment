import { sign, verifySigned } from './signing';

// The judge's browser holds a signed, httpOnly cookie naming their application, so a refresh
// (or reopening the tab) picks up exactly where they were, timers included.
export const SESSION_COOKIE = 'endorsementSession';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookie(applicationId: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${applicationId}.${sign(applicationId)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

export function readSessionId(cookies: Partial<Record<string, string>>): string | null {
  const value = cookies[SESSION_COOKIE];
  return value ? verifySigned(value) : null;
}
