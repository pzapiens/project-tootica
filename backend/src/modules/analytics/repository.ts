import { prisma } from '../../common/db/prisma';
import type { AnalyticsQuery } from './schema';

function appointmentDateFilter(range: AnalyticsQuery) {
  if (!range.from && !range.to) {
    return undefined;
  }
  return { gte: range.from, lte: range.to };
}

export const analyticsRepository = {
  countPatients: (clinicId: string) => prisma.patient.count({ where: { clinicId } }),

  countDoctors: (clinicId: string) => prisma.doctor.count({ where: { clinicId } }),

  countAppointments: (clinicId: string, range: AnalyticsQuery) =>
    prisma.appointment.count({
      where: { clinicId, startTime: appointmentDateFilter(range) },
    }),

  countUpcomingAppointments: (clinicId: string) =>
    prisma.appointment.count({
      where: {
        clinicId,
        startTime: { gte: new Date() },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
    }),
};
