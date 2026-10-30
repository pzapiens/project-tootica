import { prisma } from '../../common/db/prisma';
import type { PrismaClient } from '../../generated/prisma/client';
import { HttpError } from '../../common/utils/httpError';
import type { WhatsAppStore } from './ports';

export function createWhatsAppRepository(db: PrismaClient): WhatsAppStore {
  return {
    usageEnabled: async (clinicId) =>
      !!(await db.clinic.findFirst({
        where: { id: clinicId, status: 'ACTIVE', whatsAppEnabled: true },
        select: { id: true },
      })),
    connection: (clinicId) => db.whatsAppConnection.findUnique({ where: { clinicId } }),
    appointment: (clinicId, id, branchId) =>
      db.appointment.findFirst({
        where: {
          clinicId,
          id,
          ...(branchId ? { OR: [{ doctor: { branchId } }, { doctorId: null }] } : {}),
        },
        select: {
          id: true,
          contactPhone: true,
          patient: { select: { phone: true, clinicId: true } },
        },
      }),
    actorAllowed: async (userId, clinicId) =>
      !!(await db.user.findFirst({
        where: {
          id: userId,
          status: 'ACTIVE',
          mustResetPassword: false,
          OR: [{ clinicId, clinic: { status: 'ACTIVE' } }, { role: 'SUPER_ADMIN' }],
        },
        select: { id: true },
      })) &&
      !!(await db.clinic.findFirst({
        where: { id: clinicId, status: 'ACTIVE' },
        select: { id: true },
      })),
    recent: (clinicId, appointmentId) =>
      db.whatsAppMessage.findMany({
        where: { clinicId, appointmentId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    reserve: (data) =>
      db.$transaction(async (tx) => {
        // Serialize reservation/rate checks across processes for this clinic.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${data.clinicId}))::text`;
        const existing = await tx.whatsAppMessage.findUnique({
          where: { clinicId_requestKey: { clinicId: data.clinicId, requestKey: data.requestKey } },
        });
        if (existing) return { created: false, message: existing };
        const enabled = await tx.clinic.findFirst({
          where: { id: data.clinicId, status: 'ACTIVE', whatsAppEnabled: true },
          select: { id: true },
        });
        if (!enabled)
          throw new HttpError(
            403,
            'WhatsApp usage is disabled for this account. Contact your superadmin.',
          );
        const recent = await tx.whatsAppMessage.count({
          where: { clinicId: data.clinicId, createdAt: { gte: new Date(Date.now() - 60000) } },
        });
        if (recent >= 10)
          throw new HttpError(
            429,
            'Clinic WhatsApp limit reached. Wait a minute before sending again.',
          );
        const connection = await tx.whatsAppConnection.findFirst({
          where: { id: data.connectionId, clinicId: data.clinicId, status: 'CONNECTED' },
        });
        if (!connection)
          throw new HttpError(409, 'WhatsApp connection changed. Refresh before sending.');
        return { created: true, message: await tx.whatsAppMessage.create({ data }) };
      }),
    finish: async (clinicId, id, status, metaMessageId, errorCode) => {
      await db.whatsAppMessage.updateMany({
        where: { clinicId, id, status: 'PENDING' },
        data: { status, metaMessageId, errorCode },
      });
    },
  };
}
export const whatsAppRepository = createWhatsAppRepository(prisma);
