import { HttpError } from '../../common/utils/httpError';
import { appointmentRepository } from './repository';
import type { CreateAppointmentInput, UpdateAppointmentInput } from './schema';

export const appointmentService = {
  list: (clinicId: string) => appointmentRepository.findMany(clinicId),

  get: async (clinicId: string, id: string) => {
    const appointment = await appointmentRepository.findById(clinicId, id);
    if (!appointment) {
      throw new HttpError(404, 'Appointment not found');
    }
    return appointment;
  },

  create: (clinicId: string, data: CreateAppointmentInput) =>
    appointmentRepository.create(clinicId, data),

  update: async (clinicId: string, id: string, data: UpdateAppointmentInput) => {
    const { count } = await appointmentRepository.update(clinicId, id, data);
    if (count === 0) {
      throw new HttpError(404, 'Appointment not found');
    }
    return appointmentService.get(clinicId, id);
  },

  remove: async (clinicId: string, id: string) => {
    const { count } = await appointmentRepository.remove(clinicId, id);
    if (count === 0) {
      throw new HttpError(404, 'Appointment not found');
    }
  },
};
