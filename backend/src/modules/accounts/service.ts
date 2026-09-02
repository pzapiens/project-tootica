import { sendTemporaryPasswordEmail } from '../../common/email/accountEmails';
import { HttpError } from '../../common/utils/httpError';
import { generateTempPassword, hashPassword } from '../../common/utils/password.util';
// The account create/update/delete DB work is shared with the super-admin flow;
// scope is enforced here first via the clinic-scoped lookups below.
import { superAdminRepository } from '../super-admin/repository';
import type { UpdateAccountInput } from '../super-admin/schema';
import { accountRepository } from './repository';
import type { CreateStaffInput } from './schema';

type UserRow = Awaited<ReturnType<typeof accountRepository.findStaffByClinic>>[number];

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
  /** A clinic's doctors + receptionists (for the clinic-admin manage popup). */
  list: async (clinicId: string) => {
    const users = await accountRepository.findStaffByClinic(clinicId);
    return users.map(toAccountSummary);
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
    const user = await superAdminRepository.createAccount({
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
    });

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

  update: async (clinicId: string, id: string, input: UpdateAccountInput) => {
    // Confirm the target is a staff member of THIS clinic before mutating.
    const existing = await accountRepository.findStaffById(clinicId, id);
    if (!existing) {
      throw new HttpError(404, 'Account not found');
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

  remove: async (clinicId: string, id: string) => {
    const existing = await accountRepository.findStaffById(clinicId, id);
    if (!existing) {
      throw new HttpError(404, 'Account not found');
    }
    await superAdminRepository.deleteAccount(id);
  },
};
