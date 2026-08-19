import { randomInt } from 'node:crypto';

/** Generates a cryptographically-random 6-digit OTP as a zero-padded string. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
