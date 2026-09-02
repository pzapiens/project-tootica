import { HttpError } from '../../common/utils/httpError';
import { doctorRepository } from './repository';
import type { CreateDoctorInput, UpdateDoctorInput } from './schema';

type DoctorRow = Awaited<ReturnType<typeof doctorRepository.findMany>>[number];

/** Flatten a doctor + its user into a summary with a resolved display name. */
function toDoctorSummary(row: DoctorRow) {
  const fullName = [row.user.firstName, row.user.lastName].filter(Boolean).join(' ').trim();
  return {
    id: row.id,
    code: row.code,
    userId: row.userId,
    name: fullName || null,
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
    return doctor;
  },

  create: (clinicId: string, data: CreateDoctorInput) =>
    doctorRepository.create(clinicId, data),

  update: async (clinicId: string, id: string, data: UpdateDoctorInput) => {
    const { count } = await doctorRepository.update(clinicId, id, data);
    if (count === 0) {
      throw new HttpError(404, 'Doctor not found');
    }
    return doctorService.get(clinicId, id);
  },

  remove: async (clinicId: string, id: string) => {
    const { count } = await doctorRepository.remove(clinicId, id);
    if (count === 0) {
      throw new HttpError(404, 'Doctor not found');
    }
  },
};
