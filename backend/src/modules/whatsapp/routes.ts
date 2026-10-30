import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/db/prisma';
import { requireRole } from '../../common/middleware/auth.middleware';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { getBranchId, requireClinicId } from '../../common/middleware/tenant.middleware';
import { HttpError } from '../../common/utils/httpError';
import { whatsAppRepository } from './repository';
import { createWhatsAppService, publicConnection } from './service';

const service = createWhatsAppService(whatsAppRepository);
export const whatsAppRoutes = Router();
whatsAppRoutes.use(requireRole('CLIENT_ADMIN', 'SUPER_ADMIN'));
whatsAppRoutes.get(
  '/connection',
  asyncHandler(async (req, res) => {
    res.json({
      enabled: await whatsAppRepository.usageEnabled(requireClinicId(req)),
      connection: publicConnection(await whatsAppRepository.connection(requireClinicId(req))),
    });
  }),
);
whatsAppRoutes.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    if (!(await whatsAppRepository.actorAllowed(req.user!.id, requireClinicId(req))))
      throw new HttpError(403, 'An active account with completed onboarding is required');
    await prisma.whatsAppConnection.updateMany({
      where: { clinicId: requireClinicId(req) },
      data: { status: 'DISCONNECTED', encryptedToken: '' },
    });
    res.status(204).send();
  }),
);
export const whatsAppAppointmentRoutes = Router();
whatsAppAppointmentRoutes.use('/:appointmentId/whatsapp', (req, _res, next) => {
  if (['DOCTOR', 'GUEST_DOCTOR', 'RECEPTIONIST'].includes(req.user!.role) && !req.user!.branchId)
    throw new HttpError(403, 'A branch assignment is required');
  next();
});
whatsAppAppointmentRoutes.get(
  '/:appointmentId/whatsapp',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.appointmentId);
    res.json(await service.bundle(requireClinicId(req), id, getBranchId(req)));
  }),
);
whatsAppAppointmentRoutes.post(
  '/:appointmentId/whatsapp/messages',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.appointmentId);
    res.json(
      await service.send(requireClinicId(req), id, req.user!.id, req.body, getBranchId(req)),
    );
  }),
);
