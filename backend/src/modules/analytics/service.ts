import { analyticsRepository } from './repository';
import type { AnalyticsQuery } from './schema';

export const analyticsService = {
  summary: async (clinicId: string, range: AnalyticsQuery, branchId?: string) => {
    const [patients, doctors, appointments, upcomingAppointments, statusGroups] =
      await Promise.all([
        analyticsRepository.countPatients(clinicId),
        analyticsRepository.countDoctors(clinicId, branchId),
        analyticsRepository.countAppointments(clinicId, range, branchId),
        analyticsRepository.countUpcomingAppointments(clinicId, branchId),
        analyticsRepository.countAppointmentsByStatus(clinicId, range, branchId),
      ]);

    // Roll the five appointment statuses up into the four dashboard buckets:
    // completed, pending (not yet happened), cancelled (incl. no-shows).
    const by = (status: string) =>
      statusGroups.find((g) => g.status === status)?._count._all ?? 0;
    const byStatus = {
      total: appointments,
      completed: by('COMPLETED'),
      pending: by('SCHEDULED') + by('CONFIRMED'),
      cancelled: by('CANCELLED') + by('NO_SHOW'),
    };

    return { patients, doctors, appointments, upcomingAppointments, byStatus };
  },
};
