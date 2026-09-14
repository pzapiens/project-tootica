import type { Request, Response } from 'express';

import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { createPaymentSchema, setPaidSchema } from './schema';
import { paymentService } from './service';

export const paymentController = {
  list: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await paymentService.bundle(clinicId, req.params.appointmentId));
  },

  create: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = createPaymentSchema.parse(req.body);
    res.status(201).json(await paymentService.add(clinicId, req.params.appointmentId, data));
  },

  remove: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await paymentService.remove(clinicId, req.params.appointmentId, req.params.paymentId);
    res.status(204).send();
  },

  setPaid: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { paid } = setPaidSchema.parse(req.body);
    res.json(
      await paymentService.setPaid(clinicId, req.params.appointmentId, req.params.paymentId, paid),
    );
  },
};
