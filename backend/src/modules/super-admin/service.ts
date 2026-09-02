import { sendTemporaryPasswordEmail } from '../../common/email/accountEmails';
import { HttpError } from '../../common/utils/httpError';
import { generateTempPassword, hashPassword } from '../../common/utils/password.util';
import type { Role } from '../../generated/prisma/enums';
import { superAdminRepository } from './repository';
import type {
  AccountType,
  CreateAccountInput,
  CreateBranchInput,
  CreateClinicWithBranchesInput,
  UpdateAccountInput,
  UpdateBranchInput,
  UpdateClinicInput,
} from './schema';

const ROLE_BY_ACCOUNT_TYPE: Record<AccountType, Role> = {
  ADMIN: 'CLIENT_ADMIN',
  DOCTOR: 'DOCTOR',
  RECEPTIONIST: 'RECEPTIONIST',
};

async function ensureClinicExists(id: string) {
  const clinic = await superAdminRepository.findClinicById(id);
  if (!clinic) {
    throw new HttpError(404, 'Clinic not found');
  }
  return clinic;
}

type BranchRecord = NonNullable<Awaited<ReturnType<typeof superAdminRepository.findBranchById>>>;
type UserRecord = NonNullable<Awaited<ReturnType<typeof superAdminRepository.findUserById>>>;

/** Public shape for a staff account (never exposes the password hash). */
function toAccountSummary(user: UserRecord) {
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

/** Flatten a branch + PIC into the summary shape the UI lists use. */
function toBranchSummary(branch: BranchRecord) {
  const picUserName = branch.pic
    ? [branch.pic.firstName, branch.pic.lastName].filter(Boolean).join(' ').trim() || null
    : null;
  return {
    id: branch.id,
    clinicId: branch.clinicId,
    code: branch.code,
    name: branch.name,
    picName: branch.picName ?? picUserName,
    contact: branch.contact ?? branch.pic?.phone ?? null,
  };
}

export const superAdminService = {
  listClinics: async () => {
    const clinics = await superAdminRepository.findClinics();
    return clinics.map(({ users, ...clinic }) => {
      const admin = users[0];
      const picName = admin
        ? [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim() || null
        : null;
      return { ...clinic, picName, contact: admin?.phone ?? null };
    });
  },

  listBranches: async () => {
    const branches = await superAdminRepository.findBranches();
    return branches.map(toBranchSummary);
  },

  updateBranch: async (id: string, input: UpdateBranchInput) => {
    const existing = await superAdminRepository.findBranchById(id);
    if (!existing) {
      throw new HttpError(404, 'Branch not found');
    }
    const data: { name?: string; picName?: string | null; contact?: string | null } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.picName !== undefined) data.picName = input.picName.trim() || null;
    if (input.contact !== undefined) data.contact = input.contact.trim() || null;
    const branch = await superAdminRepository.updateBranch(id, data);
    return toBranchSummary(branch);
  },

  removeBranch: async (id: string) => {
    const existing = await superAdminRepository.findBranchById(id);
    if (!existing) {
      throw new HttpError(404, 'Branch not found');
    }
    await superAdminRepository.deleteBranch(id);
  },

  getClinic: (id: string) => ensureClinicExists(id),

  createClinic: async ({ branches, ...clinic }: CreateClinicWithBranchesInput) => {
    const { clinic: created, branches: createdBranches } =
      await superAdminRepository.createClinicWithBranches(clinic, branches);
    return {
      ...created,
      branches: createdBranches.map((b) => ({
        id: b.id,
        clinicId: b.clinicId,
        code: b.code,
        name: b.name,
        picName: b.picName,
        contact: b.contact,
      })),
    };
  },

  /** Add a branch to an existing clinic. */
  addBranch: async (input: CreateBranchInput) => {
    await ensureClinicExists(input.clinicId);
    const branch = await superAdminRepository.createBranch(input.clinicId, {
      name: input.name,
      picName: input.picName,
      contact: input.contact,
    });
    return toBranchSummary(branch);
  },

  createAccount: async (input: CreateAccountInput) => {
    await ensureClinicExists(input.clinicId);
    const existing = await superAdminRepository.findUserByEmail(input.email);
    if (existing) {
      throw new HttpError(409, 'Email already in use');
    }
    const role = ROLE_BY_ACCOUNT_TYPE[input.accountType];
    // Admins are clinic-wide (no branch); doctors + receptionists are pinned to
    // the selected branch.
    const branchId = role === 'CLIENT_ADMIN' ? null : input.branchId ?? null;
    // Issue a temporary password and return the plaintext ONCE so the super
    // admin can pass it to the new user. It's never stored in plaintext or
    // retrievable again; the user must replace it on first login.
    const temporaryPassword = generateTempPassword();
    const user = await superAdminRepository.createAccount({
      clinicId: input.clinicId,
      branchId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title,
      phone: input.phone,
      role,
      passwordHash: await hashPassword(temporaryPassword),
      withDoctorProfile: role === 'DOCTOR',
    });

    // Email the temporary password to the new user. The account already exists,
    // so a mail failure must NOT fail the request — the password is still
    // returned in the response as a fallback the super admin can share.
    const clinic = await superAdminRepository.findClinicById(input.clinicId);
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

  /** Staff accounts under a clinic (for the super-admin "Manage Accounts" popup). */
  listAccounts: async (clinicId: string) => {
    await ensureClinicExists(clinicId);
    const users = await superAdminRepository.findUsersByClinic(clinicId);
    return users.map(toAccountSummary);
  },

  updateAccount: async (id: string, input: UpdateAccountInput) => {
    const user = await superAdminRepository.findUserById(id);
    if (!user || user.role === 'SUPER_ADMIN') {
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

  removeAccount: async (id: string) => {
    const user = await superAdminRepository.findUserById(id);
    if (!user || user.role === 'SUPER_ADMIN') {
      throw new HttpError(404, 'Account not found');
    }
    await superAdminRepository.deleteAccount(id);
  },

  updateClinic: async (id: string, data: UpdateClinicInput) => {
    await ensureClinicExists(id);
    return superAdminRepository.updateClinic(id, data);
  },

  removeClinic: async (id: string) => {
    await ensureClinicExists(id);
    await superAdminRepository.removeClinic(id);
  },
};
