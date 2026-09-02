import { randomInt } from 'node:crypto';

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Character pools for temporary passwords. Ambiguous characters (0/O, 1/l/I)
// are omitted so a password read off a screen or email is transcribed cleanly.
const TEMP_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const TEMP_DIGIT = '23456789';
const TEMP_SPECIAL = '!@#$%*?';
const TEMP_ALL = TEMP_UPPER + TEMP_LOWER + TEMP_DIGIT + TEMP_SPECIAL;

function pick(pool: string): string {
  return pool[randomInt(pool.length)];
}

/**
 * A random 12-character temporary password issued to newly-created accounts.
 * Guaranteed to satisfy the app's password policy (upper, lower, digit,
 * special, length ≥ 8) so the account can still log in if the policy ever
 * gets enforced at login. The user is forced to replace it on first login.
 */
export function generateTempPassword(): string {
  const required = [pick(TEMP_UPPER), pick(TEMP_LOWER), pick(TEMP_DIGIT), pick(TEMP_SPECIAL)];
  const rest = Array.from({ length: 8 }, () => pick(TEMP_ALL));
  const chars = [...required, ...rest];
  // Fisher–Yates shuffle so the guaranteed characters aren't always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
