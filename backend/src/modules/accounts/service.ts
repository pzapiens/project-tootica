import { sendTemporaryPasswordEmail } from '../../common/email/accountEmails';
import { HttpError } from '../../common/utils/httpError';
import { generateTempPassword, hashPassword } from '../../common/utils/password.util';
import { rethrowUserUniqueViolation } from '../../common/utils/prismaErrors';
// The account create/update/delete DB work is shared with the super-admin flow;
// scope is enforced here first via the clinic-scoped lookups below.
import { superAdminRepository } from '../super-admin/repository';
import type { UpdateAccountInput } from '../super-admin/schema';
import { accountRepository } from './repository';
import type { CreateStaffInput } from './schema';

type UserRow = Awaited<ReturnType<typeof accountRepository.findAccountsByClinic>>[number];

// Display order for the Accounts list: admins first, then doctors, then
// receptionists (each group already sorted oldest-first by the query).
const ROLE_ORDER: Record<string, number> = {
  CLIENT_ADMIN: 0,
  DOCTOR: 1,
  GUEST_DOCTOR: 1,
  RECEPTIONIST: 2,
};

/** Public shape for a staff account (never exposes the password hash). */
function toAccountSummary(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    title: user.title,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    branchCode: user.branch?.code ?? null,
    createdAt: user.createdAt,
  };
}

export const accountService = {
  /** A clinic's accounts — admins + doctors + receptionists — for the Accounts
   *  Management page (admins first, then staff). */
  list: async (clinicId: string) => {
    const users = await accountRepository.findAccountsByClinic(clinicId);
    return [...users]
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
      .map(toAccountSummary);
  },

  /** Create a doctor / receptionist at one of the clinic's own branches. */
  create: async (clinicId: string, input: CreateStaffInput) => {
    const branch = await accountRepository.findClinicBranch(clinicId, input.branchId);
    if (!branch) {
      throw new HttpError(404, 'Branch not found');
    }
    const existing = await superAdminRepository.findUserByEmail(input.email);
    if (existing) {
      throw new HttpError(409, 'Email already in use');
    }
    const role = input.accountType === 'DOCTOR' ? 'DOCTOR' : 'RECEPTIONIST';
    // Temporary password returned ONCE so the admin can pass it to the new user;
    // it's never stored in plaintext and the user must replace it on first login.
    const temporaryPassword = generateTempPassword();
    const user = await superAdminRepository
      .createAccount({
        clinicId,
        branchId: input.branchId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        title: input.title,
        phone: input.phone,
        role,
        passwordHash: await hashPassword(temporaryPassword),
        withDoctorProfile: role === 'DOCTOR',
      })
      .catch(rethrowUserUniqueViolation);

    // Email the temp password; a mail failure must NOT fail the request — it's
    // still returned so the admin can share it manually.
    const clinic = await superAdminRepository.findClinicById(clinicId);
    let emailSent = false;
    try {
      await sendTemporaryPasswordEmail({
        to: user.email,
        firstName: user.firstName,
        temporaryPassword,
        clinicName: clinic?.name ?? null,
      });
      emailSent = true;
    } catch (err) {
      console.error(`Failed to email temporary password to ${user.email}:`, err);
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      phone: user.phone,
      role: user.role,
      clinicId: user.clinicId,
      status: user.status,
      temporaryPassword,
      emailSent,
    };
  },

  update: async (clinicId: string, id: string, callerId: string, input: UpdateAccountInput) => {
    // Confirm the target is a manageable account (admin/staff) of THIS clinic.
    const existing = await accountRepository.findManageableById(clinicId, id);
    if (!existing) {
      throw new HttpError(404, 'Account not found');
    }
    if (id === callerId) {
      throw new HttpError(403, 'You can’t manage your own account here — use Profile settings');
    }
    // Never let a clinic lose its last active admin by suspending one.
    if (
      existing.role === 'CLIENT_ADMIN' &&
      existing.status === 'ACTIVE' &&
      input.status === 'SUSPENDED'
    ) {
      await ensureNotLastActiveAdmin(clinicId);
    }
    const data: {
      title?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      status?: 'ACTIVE' | 'SUSPENDED';
    } = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.title !== undefined) data.title = input.title;
    if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
    if (input.status !== undefined) data.status = input.status;
    const updated = await superAdminRepository.updateAccount(id, data);
    return toAccountSummary(updated);
  },

  remove: async (clinicId: string, id: string, callerId: string) => {
    const existing = await accountRepository.findManageableById(clinicId, id);
    if (!existing) {
      throw new HttpError(404, 'Account not found');
    }
    if (id === callerId) {
      throw new HttpError(403, 'You can’t delete your own account here — use Profile settings');
    }
    if (existing.role === 'CLIENT_ADMIN' && existing.status === 'ACTIVE') {
      await ensureNotLastActiveAdmin(clinicId);
    }
    await superAdminRepository.deleteAccount(id);
  },

  /** Set a new password for a clinic account (admin / super admin only). */
  resetPassword: async (clinicId: string, id: string, callerId: string, password: string) => {
    const existing = await accountRepository.findManageableById(clinicId, id);
    if (!existing) {
      throw new HttpError(404, 'Account not found');
    }
    if (id === callerId) {
      throw new HttpError(403, 'You can’t reset your own password here — use Profile settings');
    }
    await accountRepository.updatePassword(id, await hashPassword(password));
  },
};

/** Throws when a clinic has only one active admin left (blocking a disable/delete
 *  that would leave it with none). */
async function ensureNotLastActiveAdmin(clinicId: string): Promise<void> {
  const activeAdmins = await accountRepository.countActiveClinicAdmins(clinicId);
  if (activeAdmins <= 1) {
    throw new HttpError(409, 'A clinic must keep at least one active admin');
  }
}
