import type { Request, Response } from 'express';

import { getBranchId, requireClinicId } from '../../common/middleware/tenant.middleware';
import {
  availabilityQuerySchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
  whatsappInboundSchema,
} from './schema';
import { appointmentService } from './service';

export const appointmentController = {
  list: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const query = listAppointmentsQuerySchema.parse(req.query);
    res.json(await appointmentService.list(clinicId, query, getBranchId(req)));
  },

  availability: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const query = availabilityQuerySchema.parse(req.query);
    res.json(await appointmentService.availability(clinicId, query, getBranchId(req)));
  },

  get: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await appointmentService.get(clinicId, req.params.id));
  },

  create: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = createAppointmentSchema.parse(req.body);
    res.status(201).json(await appointmentService.create(clinicId, data));
  },

  // Inbound WhatsApp booking. Today the app/tests post a normalised booking here;
  // the real Meta Cloud API webhook will parse its own payload into this shape.
  whatsappInbound: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = whatsappInboundSchema.parse(req.body);
    res.status(201).json(await appointmentService.whatsappInbound(clinicId, data));
  },

  update: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = updateAppointmentSchema.parse(req.body);
    res.json(await appointmentService.update(clinicId, req.params.id, data));
  },

  remove: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await appointmentService.remove(clinicId, req.params.id);
    res.status(204).send();
  },
};
