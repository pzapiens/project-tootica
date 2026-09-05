import type { Request, Response } from 'express';

import { getBranchId, requireClinicId } from '../../common/middleware/tenant.middleware';
import { createDoctorSchema, updateDoctorSchema } from './schema';
import { doctorService } from './service';

export const doctorController = {
  list: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await doctorService.list(clinicId, getBranchId(req)));
  },

  get: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await doctorService.get(clinicId, req.params.id));
  },

  create: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = createDoctorSchema.parse(req.body);
    // Pin the guest to the branch currently being viewed so it shows up in that
    // branch's list (the list is branch-scoped); clinic-wide views pass none.
    res.status(201).json(await doctorService.create(clinicId, data, getBranchId(req)));
  },

  update: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = updateDoctorSchema.parse(req.body);
    res.json(await doctorService.update(clinicId, req.params.id, data));
  },

  remove: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await doctorService.remove(clinicId, req.params.id);
    res.status(204).send();
  },
};
