import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import { HttpError } from '../../common/utils/httpError';
import type { Role } from '../../generated/prisma/enums';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  clinicId: string | null;
  // Branch a DOCTOR / RECEPTIONIST is pinned to (null for clinic-wide admins).
  branchId: string | null;
}

export type ActionTokenType = 'reset' | 'invite';

function verify<T>(token: string, secret: string): T {
  try {
    return jwt.verify(token, secret) as T;
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtlSeconds,
    jwtid: randomUUID(),
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtlSeconds,
    jwtid: randomUUID(),
  });
}

/** Signs a short-lived reset or invite token. `type` guards against cross-use. */
export function signActionToken(userId: string, type: ActionTokenType): string {
  const ttl = type === 'reset' ? env.jwt.resetTtlSeconds : env.jwt.inviteTtlSeconds;
  return jwt.sign({ sub: userId, type }, env.jwt.actionSecret, {
    expiresIn: ttl,
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verify<AccessTokenPayload>(token, env.jwt.accessSecret);
}

export function verifyRefreshToken(token: string): { sub: string } {
  return verify<{ sub: string }>(token, env.jwt.refreshSecret);
}

export function verifyActionToken(token: string, expectedType: ActionTokenType): { sub: string } {
  const payload = verify<{ sub: string; type: ActionTokenType }>(token, env.jwt.actionSecret);
  if (payload.type !== expectedType) {
    throw new HttpError(401, 'Invalid or expired token');
  }
  return payload;
}
