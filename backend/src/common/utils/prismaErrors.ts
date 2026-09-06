import { HttpError } from './httpError';

/** Shape of a Prisma known-request error we care about (unique violations). */
interface UniqueViolation {
  code?: string;
  meta?: { target?: string[] | string };
}

/**
 * Translate a Prisma unique-constraint violation (P2002) on a user field into a
 * friendly 409, so the API returns "…already in use" instead of a 500. Any other
 * error is rethrown unchanged. Call from a catch around a user create/update.
 */
export function rethrowUserUniqueViolation(err: unknown): never {
  const e = err as UniqueViolation;
  if (e?.code === 'P2002') {
    const target = Array.isArray(e.meta?.target)
      ? e.meta?.target.join(',')
      : e.meta?.target ?? '';
    if (target.includes('phone')) {
      throw new HttpError(409, 'Phone number already in use');
    }
    if (target.includes('email')) {
      throw new HttpError(409, 'Email already in use');
    }
    throw new HttpError(409, 'That value is already in use');
  }
  throw err;
}
