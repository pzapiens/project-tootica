import { prisma } from '../../common/db/prisma';

// The staff roles a clinic admin is allowed to MUTATE (edit / suspend / delete)
// via this endpoint — never other admins or super admins.
const STAFF_ROLES = ['DOCTOR', 'GUEST_DOCTOR', 'RECEPTIONIST'] as const;

// Roles LISTED on the clinic Accounts page — the clinic's admins plus its staff.
// Super admins aren't clinic members, so a clinic-scoped query never returns them.
const LISTED_ROLES = ['CLIENT_ADMIN', ...STAFF_ROLES] as const;

const withBranch = { branch: { select: { id: true, code: true, name: true } } } as const;

export const accountRepository = {
  /** Every account under a clinic (admins + doctors + receptionists) for the
   *  Accounts Management list. */
  findAccountsByClinic: (clinicId: string) =>
    prisma.user.findMany({
      where: { clinicId, role: { in: [...LISTED_ROLES] } },
      orderBy: [{ createdAt: 'asc' }],
      include: withBranch,
    }),

  /** A single manageable account (admin or staff) within this clinic — the guard
   *  that keeps a manager from touching another tenant's account or a super
   *  admin. */
  findManageableById: (clinicId: string, id: string) =>
    prisma.user.findFirst({
      where: { id, clinicId, role: { in: [...LISTED_ROLES] } },
      include: withBranch,
    }),

  /** Active CLIENT_ADMIN accounts in a clinic — used to keep a clinic from ever
   *  losing its last active admin via a disable / delete. */
  countActiveClinicAdmins: (clinicId: string) =>
    prisma.user.count({ where: { clinicId, role: 'CLIENT_ADMIN', status: 'ACTIVE' } }),

  /** Confirms a branch belongs to this clinic before pinning new staff to it. */
  findClinicBranch: (clinicId: string, branchId: string) =>
    prisma.branch.findFirst({ where: { id: branchId, clinicId }, select: { id: true } }),

  /** Set a new password hash for an account (admin-driven password reset). */
  updatePassword: (id: string, passwordHash: string) =>
    prisma.user.update({ where: { id }, data: { passwordHash } }),
};
