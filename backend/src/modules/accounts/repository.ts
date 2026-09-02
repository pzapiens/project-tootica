import { prisma } from '../../common/db/prisma';

// The staff roles a clinic admin is allowed to manage — never other admins or
// super admins.
const STAFF_ROLES = ['DOCTOR', 'GUEST_DOCTOR', 'RECEPTIONIST'] as const;

const withBranch = { branch: { select: { id: true, code: true, name: true } } } as const;

export const accountRepository = {
  /** Doctors + receptionists under a clinic (admins/super-admins excluded). */
  findStaffByClinic: (clinicId: string) =>
    prisma.user.findMany({
      where: { clinicId, role: { in: [...STAFF_ROLES] } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: withBranch,
    }),

  /** A single staff account, but only if it belongs to this clinic — the guard
   *  that keeps a clinic admin from touching another tenant's (or an admin's)
   *  account. */
  findStaffById: (clinicId: string, id: string) =>
    prisma.user.findFirst({
      where: { id, clinicId, role: { in: [...STAFF_ROLES] } },
      include: withBranch,
    }),

  /** Confirms a branch belongs to this clinic before pinning new staff to it. */
  findClinicBranch: (clinicId: string, branchId: string) =>
    prisma.branch.findFirst({ where: { id: branchId, clinicId }, select: { id: true } }),
};
