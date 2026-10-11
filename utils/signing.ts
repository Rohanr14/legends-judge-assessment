import { createHmac, timingSafeEqual } from 'crypto';

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET must be set in production.');
  }
  return 'local-development-only';
}

export const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

/** Returns the payload of a `<payload>.<signature>` string if the signature is ours, otherwise null. */
export function verifySigned(value: string): string | null {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return payload;
}
