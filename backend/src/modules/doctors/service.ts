import { randomUUID } from 'crypto';

import { HttpError } from '../../common/utils/httpError';
import { rethrowUserUniqueViolation } from '../../common/utils/prismaErrors';
import { doctorRepository } from './repository';
import type {
  CreateDoctorInput,
  PutBlocksInput,
  PutShiftsInput,
  UpdateDoctorInput,
} from './schema';

// Date-only ("YYYY-MM-DD") is stored at UTC midnight, matching how patient DOB
// is handled, so the calendar day never shifts across timezones.
const toDateOnly = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const fmtDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

type ShiftRow = Awaited<ReturnType<typeof doctorRepository.listShifts>>[number];
type BlockRow = Awaited<ReturnType<typeof doctorRepository.listBlocks>>[number];

const toShiftDto = (r: ShiftRow) => ({
  id: r.id,
  groupId: r.groupId,
  frequency: r.frequency,
  date: fmtDateOnly(r.date),
  startTime: r.startTime,
  endTime: r.endTime,
});

const toBlockDto = (r: BlockRow) => ({
  id: r.id,
  date: fmtDateOnly(r.date),
  startTime: r.startTime,
  endTime: r.endTime,
});

type DoctorRow = Awaited<ReturnType<typeof doctorRepository.findMany>>[number];

// Guest doctors created without an email get a synthetic, login-less address on
// this domain (User.email is unique + non-null). It's an internal placeholder,
// never shown to users — the summary reports it as null.
const PLACEHOLDER_EMAIL_DOMAIN = 'guest.tootica.local';
const isPlaceholderEmail = (email: string) => email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);

/** Flatten a doctor + its user into a summary with a resolved display name. */
function toDoctorSummary(row: DoctorRow) {
  const fullName = [row.user.firstName, row.user.lastName].filter(Boolean).join(' ').trim();
  return {
    id: row.id,
    code: row.code,
    userId: row.userId,
    name: fullName || null,
    email: isPlaceholderEmail(row.user.email) ? null : row.user.email,
    // DOCTOR = an employed doctor with a login (managed via the account flow);
    // GUEST_DOCTOR = a visiting doctor added on the Doctors page (editable here).
    role: row.user.role,
    specialization: row.specialization,
    licenseNumber: row.licenseNumber,
    phone: row.phone,
    bio: row.bio,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    branchCode: row.branch?.code ?? null,
    createdAt: row.createdAt,
  };
}

/** "Dr. Sanjay Prakash" → { firstName: "Sanjay", lastName: "Prakash" }. The
 *  "Dr." honorific comes from the role, so any leading title is stripped. */
function splitName(name: string): { firstName: string; lastName: string } {
  const bare = name.trim().replace(/^dr\.?\s+/i, '');
  const parts = bare.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || parts[0] };
}

export const doctorService = {
  list: async (clinicId: string, branchId?: string) => {
    const doctors = await doctorRepository.findMany(clinicId, branchId);
    return doctors.map(toDoctorSummary);
  },

  get: async (clinicId: string, id: string) => {
    const doctor = await doctorRepository.findById(clinicId, id);
    if (!doctor) {
      throw new HttpError(404, 'Doctor not found');
    }
    return toDoctorSummary(doctor);
  },

  /** Create a guest doctor (GUEST_DOCTOR user + profile) inside this clinic. */
  create: async (clinicId: string, data: CreateDoctorInput, branchId?: string) => {
    if (data.email) {
      const existing = await doctorRepository.findUserByEmail(data.email);
      if (existing) {
        throw new HttpError(409, 'Email already in use');
      }
    }
    // No email given → mint a unique placeholder so the login-less guest still
    // satisfies the unique/non-null User.email constraint.
    const email = data.email ?? `guest-${randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    const { firstName, lastName } = splitName(data.name);
    const doctor = await doctorRepository
      .createGuest(clinicId, {
        firstName,
        lastName,
        email,
        phone: data.phone,
        specialization: data.specialization,
        branchId,
      })
      // Safety net: surface any unique clash (e.g. email race) as a clean 409.
      .catch(rethrowUserUniqueViolation);
    return toDoctorSummary(doctor);
  },

  update: async (clinicId: string, id: string, data: UpdateDoctorInput) => {
    const existing = await doctorRepository.findById(clinicId, id);
    if (!existing) {
      throw new HttpError(404, 'Doctor not found');
    }
    // Only guest doctors can be edited here; an employed doctor's identity is
    // managed through the account flow, so guard against changing it.
    if (existing.user.role !== 'GUEST_DOCTOR') {
      throw new HttpError(403, "Employed doctors can't be edited here");
    }
    // Changing email to one already taken by another user is a conflict.
    if (data.email && data.email !== existing.user.email) {
      const taken = await doctorRepository.findUserByEmail(data.email);
      if (taken) {
        throw new HttpError(409, 'Email already in use');
      }
    }

    const userData: { firstName?: string; lastName?: string; email?: string } = {};
    const doctorData: { specialization?: string; phone?: string | null } = {};
    if (data.name !== undefined) {
      const { firstName, lastName } = splitName(data.name);
      userData.firstName = firstName;
      userData.lastName = lastName;
    }
    if (data.email !== undefined) userData.email = data.email;
    // Phone lives on the doctor profile only — never on the login user (unique
    // OTP-login identifier), so a guest doctor's phone can't collide there.
    if (data.phone !== undefined) doctorData.phone = data.phone ?? null;
    if (data.specialization !== undefined) doctorData.specialization = data.specialization;

    const updated = await doctorRepository
      .updateProfile(clinicId, id, existing.userId, userData, doctorData)
      .catch(rethrowUserUniqueViolation);
    return toDoctorSummary(updated);
  },

  remove: async (clinicId: string, id: string) => {
    const existing = await doctorRepository.findById(clinicId, id);
    if (!existing) {
      throw new HttpError(404, 'Doctor not found');
    }
    // Only guest doctors (created here) can be deleted; employed doctors are
    // removed through the account flow.
    if (existing.user.role !== 'GUEST_DOCTOR') {
      throw new HttpError(403, "Employed doctors can't be deleted here");
    }
    await doctorRepository.remove(clinicId, id);
  },

  /* --------------------------------------------------------- shifts / blocks */

  listShifts: async (clinicId: string, doctorId: string) => {
    await ensureDoctor(clinicId, doctorId);
    return (await doctorRepository.listShifts(clinicId, doctorId)).map(toShiftDto);
  },

  replaceShifts: async (clinicId: string, doctorId: string, input: PutShiftsInput) => {
    await ensureDoctor(clinicId, doctorId);
    const rows = input.shifts.map((s) => ({
      groupId: s.groupId ?? null,
      frequency: s.frequency,
      date: toDateOnly(s.date),
      startTime: s.startTime,
      endTime: s.endTime,
    }));
    return (await doctorRepository.replaceShifts(clinicId, doctorId, rows)).map(toShiftDto);
  },

  listBlocks: async (clinicId: string, doctorId: string) => {
    await ensureDoctor(clinicId, doctorId);
    return (await doctorRepository.listBlocks(clinicId, doctorId)).map(toBlockDto);
  },

  replaceBlocks: async (clinicId: string, doctorId: string, input: PutBlocksInput) => {
    await ensureDoctor(clinicId, doctorId);
    const rows = input.blocks.map((b) => ({
      date: toDateOnly(b.date),
      startTime: b.startTime,
      endTime: b.endTime,
    }));
    return (await doctorRepository.replaceBlocks(clinicId, doctorId, rows)).map(toBlockDto);
  },
};

/** Ensure the doctor exists in this clinic (tenant scoping) or 404. */
async function ensureDoctor(clinicId: string, doctorId: string): Promise<void> {
  const doctor = await doctorRepository.findById(clinicId, doctorId);
  if (!doctor) {
    throw new HttpError(404, 'Doctor not found');
  }
}
