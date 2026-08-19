import { analyticsRepository } from './repository';
import type { AnalyticsQuery } from './schema';

export const analyticsService = {
  summary: async (clinicId: string, range: AnalyticsQuery) => {
    const [patients, doctors, appointments, upcomingAppointments] = await Promise.all([
      analyticsRepository.countPatients(clinicId),
      analyticsRepository.countDoctors(clinicId),
      analyticsRepository.countAppointments(clinicId, range),
      analyticsRepository.countUpcomingAppointments(clinicId),
    ]);

    return { patients, doctors, appointments, upcomingAppointments };
  },
};
