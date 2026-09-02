import type { RequestHandler } from 'express';

import { ACCESS_COOKIE } from '../../modules/auth/cookies';
import { verifyAccessToken } from '../../modules/auth/jwt.util';
import { HttpError } from '../utils/httpError';
import type { Role } from '../../generated/prisma/enums';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  clinicId: string | null;
  // Branch a DOCTOR / RECEPTIONIST is pinned to (null for clinic-wide admins).
  branchId: string | null;
}

/** Verifies the access-token cookie and attaches `req.user`. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) {
    throw new HttpError(401, 'Authentication required');
  }

  const payload = verifyAccessToken(token);
  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    clinicId: payload.clinicId,
    branchId: payload.branchId ?? null,
  };
  next();
};

/** Guards a route to the given roles. Must run after `authenticate`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new HttpError(401, 'Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, 'Insufficient permissions');
    }
    next();
  };
}

export const requireSuperAdmin = requireRole('SUPER_ADMIN');
