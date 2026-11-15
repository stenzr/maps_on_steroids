import { createHash, timingSafeEqual } from 'node:crypto';

export const SECRET_HEADER = 'x-app-secret';

const digest = (s: string): Buffer => createHash('sha256').update(s, 'utf8').digest();

/** Constant-time comparison (hashing first makes lengths equal). */
export function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}
