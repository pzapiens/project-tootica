import type { Request, RequestHandler } from 'express';

import { HttpError } from '../utils/httpError';

/**
 * Derives the tenant from the authenticated user and attaches `req.clinicId`.
 * Must run after `authenticate`. Not mounted on Super Admin routes (a super
 * admin has no single clinic).
 */
export const requireTenant: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new HttpError(401, 'Authentication required');
  }
  if (!req.user.clinicId) {
    throw new HttpError(403, 'No clinic is associated with this account');
  }
  req.clinicId = req.user.clinicId;
  next();
};

/** Reads the resolved clinic id or throws if tenant context is missing. */
export function requireClinicId(req: Request): string {
  if (!req.clinicId) {
    throw new HttpError(400, 'Missing clinic context');
  }
  return req.clinicId;
}
