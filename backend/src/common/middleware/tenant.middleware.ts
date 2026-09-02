import type { Request, RequestHandler } from 'express';

import { prisma } from '../db/prisma';
import { HttpError } from '../utils/httpError';

/** Header a super admin uses to target a specific clinic on tenant routes. */
export const CLINIC_HEADER = 'x-clinic-id';

/**
 * Derives the tenant and attaches `req.clinicId`. Must run after `authenticate`.
 *
 * A regular user is bound to their own `clinicId` from the token. A super admin
 * has no clinic of their own, so they select one explicitly per request via the
 * `X-Clinic-Id` header — letting them drill into any clinic's tenant-scoped data
 * (patients, appointments, analytics, …). The clinic is validated to exist so an
 * unknown id fails fast rather than silently returning empty results.
 */
export const requireTenant: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new HttpError(401, 'Authentication required');
  }

  if (req.user.role === 'SUPER_ADMIN') {
    const clinicId = req.header(CLINIC_HEADER);
    if (!clinicId) {
      throw new HttpError(400, `Super admin must select a clinic via the ${CLINIC_HEADER} header`);
    }
    prisma.clinic
      .findUnique({ where: { id: clinicId }, select: { id: true } })
      .then((clinic) => {
        if (!clinic) {
          next(new HttpError(404, 'Clinic not found'));
          return;
        }
        req.clinicId = clinic.id;
        next();
      })
      .catch(next);
    return;
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

// Roles pinned to a single branch. A clinic admin is branch-wide (picks the
// branch via the header); a super admin never hits tenant-scoped routes.
const BRANCH_SCOPED_ROLES = new Set(['DOCTOR', 'GUEST_DOCTOR', 'RECEPTIONIST']);

/**
 * Resolves the active branch (within the tenant). Branch-scoped staff (doctors
 * / receptionists) are pinned to their own branch from the token and cannot
 * view another by changing the request. Clinic admins pick the branch via the
 * `X-Branch-Code` header — the `[code]` route segment they're viewing. Sets
 * `req.branchId`; leaves it undefined (clinic-wide) when no/unknown code is
 * sent. Must run after `requireTenant`.
 */
export const resolveBranch: RequestHandler = (req, _res, next) => {
  // Staff can only ever see their assigned branch — never trust the header.
  if (req.user && BRANCH_SCOPED_ROLES.has(req.user.role)) {
    req.branchId = req.user.branchId ?? undefined;
    next();
    return;
  }
  const code = req.header('x-branch-code');
  if (!code) {
    next();
    return;
  }
  const clinicId = requireClinicId(req);
  // The `[code]` route segment is usually the branch code, but can fall back to
  // the branch id — match either, scoped to the caller's clinic.
  prisma.branch
    .findFirst({ where: { clinicId, OR: [{ code }, { id: code }] }, select: { id: true } })
    .then((branch) => {
      req.branchId = branch?.id;
      next();
    })
    .catch(next);
};

/** The active branch id, or undefined when the view is clinic-wide. */
export function getBranchId(req: Request): string | undefined {
  return req.branchId;
}
