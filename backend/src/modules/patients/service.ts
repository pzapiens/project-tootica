import { HttpError } from '../../common/utils/httpError';
import { patientRepository } from './repository';
import type { CreatePatientInput, UpdatePatientInput } from './schema';

export const patientService = {
  list: (clinicId: string) => patientRepository.findMany(clinicId),

  get: async (clinicId: string, id: string) => {
    const patient = await patientRepository.findById(clinicId, id);
    if (!patient) {
      throw new HttpError(404, 'Patient not found');
    }
    return patient;
  },

  create: (clinicId: string, data: CreatePatientInput) =>
    patientRepository.create(clinicId, data),

  update: async (clinicId: string, id: string, data: UpdatePatientInput) => {
    const { count } = await patientRepository.update(clinicId, id, data);
    if (count === 0) {
      throw new HttpError(404, 'Patient not found');
    }
    return patientService.get(clinicId, id);
  },

  remove: async (clinicId: string, id: string) => {
    const { count } = await patientRepository.remove(clinicId, id);
    if (count === 0) {
      throw new HttpError(404, 'Patient not found');
    }
  },
};
