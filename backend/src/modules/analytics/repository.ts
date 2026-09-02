import { prisma } from '../../common/db/prisma';
import type { AnalyticsQuery } from './schema';

function appointmentDateFilter(range: AnalyticsQuery) {
  if (!range.from && !range.to) {
    return undefined;
  }
  return { gte: range.from, lte: range.to };
}

// Appointments have no branch column, so a branch filter scopes them through
// their doctor's branch; doctors filter on their own branchId. Patients are
// clinic-wide (shared across branches) and ignore the branch.
const apptBranch = (branchId?: string) => (branchId ? { doctor: { branchId } } : {});

export const analyticsRepository = {
  countPatients: (clinicId: string) => prisma.patient.count({ where: { clinicId } }),

  countDoctors: (clinicId: string, branchId?: string) =>
    prisma.doctor.count({ where: { clinicId, ...(branchId ? { branchId } : {}) } }),

  countAppointments: (clinicId: string, range: AnalyticsQuery, branchId?: string) =>
    prisma.appointment.count({
      where: { clinicId, startTime: appointmentDateFilter(range), ...apptBranch(branchId) },
    }),

  countUpcomingAppointments: (clinicId: string, branchId?: string) =>
    prisma.appointment.count({
      where: {
        clinicId,
        startTime: { gte: new Date() },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        ...apptBranch(branchId),
      },
    }),

  /** Appointment counts grouped by status within the range (for the stat cards). */
  countAppointmentsByStatus: (clinicId: string, range: AnalyticsQuery, branchId?: string) =>
    prisma.appointment.groupBy({
      by: ['status'],
      where: { clinicId, startTime: appointmentDateFilter(range), ...apptBranch(branchId) },
      _count: { _all: true },
    }),
};
