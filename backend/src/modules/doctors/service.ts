import { randomUUID } from 'crypto';

import { HttpError } from '../../common/utils/httpError';
import { doctorRepository } from './repository';
import type { CreateDoctorInput, UpdateDoctorInput } from './schema';

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
    const doctor = await doctorRepository.createGuest(clinicId, {
      firstName,
      lastName,
      email,
      phone: data.phone,
      specialization: data.specialization,
      branchId,
    });
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

    const userData: { firstName?: string; lastName?: string; email?: string; phone?: string | null } = {};
    const doctorData: { specialization?: string; phone?: string | null } = {};
    if (data.name !== undefined) {
      const { firstName, lastName } = splitName(data.name);
      userData.firstName = firstName;
      userData.lastName = lastName;
    }
    if (data.email !== undefined) userData.email = data.email;
    if (data.phone !== undefined) {
      userData.phone = data.phone ?? null;
      doctorData.phone = data.phone ?? null;
    }
    if (data.specialization !== undefined) doctorData.specialization = data.specialization;

    const updated = await doctorRepository.updateProfile(
      clinicId,
      id,
      existing.userId,
      userData,
      doctorData,
    );
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
};
