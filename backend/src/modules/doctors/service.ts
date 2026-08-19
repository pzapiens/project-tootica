import { HttpError } from '../../common/utils/httpError';
import { doctorRepository } from './repository';
import type { CreateDoctorInput, UpdateDoctorInput } from './schema';

export const doctorService = {
  list: (clinicId: string) => doctorRepository.findMany(clinicId),

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
