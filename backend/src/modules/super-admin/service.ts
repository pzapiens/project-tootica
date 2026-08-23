import { HttpError } from '../../common/utils/httpError';
import type { Role } from '../../generated/prisma/enums';
import { superAdminRepository } from './repository';
import type {
  AccountType,
  CreateAccountInput,
  CreateClinicWithBranchInput,
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

  createClinic: async ({ branch, ...clinic }: CreateClinicWithBranchInput) => {
    const { clinic: created, branch: createdBranch } =
      await superAdminRepository.createClinicWithBranch(clinic, branch);
    return {
      ...created,
      branch: createdBranch
        ? {
            id: createdBranch.id,
            clinicId: createdBranch.clinicId,
            code: createdBranch.code,
            name: createdBranch.name,
            picName: createdBranch.picName,
            contact: createdBranch.contact,
          }
        : null,
    };
  },

  createAccount: async (input: CreateAccountInput) => {
    await ensureClinicExists(input.clinicId);
    const existing = await superAdminRepository.findUserByEmail(input.email);
    if (existing) {
      throw new HttpError(409, 'Email already in use');
    }
    const role = ROLE_BY_ACCOUNT_TYPE[input.accountType];
    const user = await superAdminRepository.createAccount({
      clinicId: input.clinicId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title,
      phone: input.phone,
      role,
      withDoctorProfile: role === 'DOCTOR',
    });
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
    };
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
