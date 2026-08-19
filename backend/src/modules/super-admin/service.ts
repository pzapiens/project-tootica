import { HttpError } from '../../common/utils/httpError';
import { superAdminRepository } from './repository';
import type { CreateClinicInput, UpdateClinicInput } from './schema';

async function ensureClinicExists(id: string) {
  const clinic = await superAdminRepository.findClinicById(id);
  if (!clinic) {
    throw new HttpError(404, 'Clinic not found');
  }
  return clinic;
}

export const superAdminService = {
  listClinics: () => superAdminRepository.findClinics(),

  getClinic: (id: string) => ensureClinicExists(id),

  createClinic: (data: CreateClinicInput) => superAdminRepository.createClinic(data),

  updateClinic: async (id: string, data: UpdateClinicInput) => {
    await ensureClinicExists(id);
    return superAdminRepository.updateClinic(id, data);
  },

  removeClinic: async (id: string) => {
    await ensureClinicExists(id);
    await superAdminRepository.removeClinic(id);
  },
};
