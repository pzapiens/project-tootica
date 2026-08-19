import type { Request, Response } from 'express';

import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { createPatientSchema, updatePatientSchema } from './schema';
import { patientService } from './service';

export const patientController = {
  list: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await patientService.list(clinicId));
  },

  get: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await patientService.get(clinicId, req.params.id));
  },

  create: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = createPatientSchema.parse(req.body);
    res.status(201).json(await patientService.create(clinicId, data));
  },

  update: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = updatePatientSchema.parse(req.body);
    res.json(await patientService.update(clinicId, req.params.id, data));
  },

  remove: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await patientService.remove(clinicId, req.params.id);
    res.status(204).send();
  },
};
