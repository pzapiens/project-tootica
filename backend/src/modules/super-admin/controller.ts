import type { Request, Response } from 'express';

import { createClinicSchema, updateClinicSchema } from './schema';
import { superAdminService } from './service';

export const superAdminController = {
  listClinics: async (_req: Request, res: Response) => {
    res.json(await superAdminService.listClinics());
  },

  getClinic: async (req: Request, res: Response) => {
    res.json(await superAdminService.getClinic(req.params.id));
  },

  createClinic: async (req: Request, res: Response) => {
    const data = createClinicSchema.parse(req.body);
    res.status(201).json(await superAdminService.createClinic(data));
  },

  updateClinic: async (req: Request, res: Response) => {
    const data = updateClinicSchema.parse(req.body);
    res.json(await superAdminService.updateClinic(req.params.id, data));
  },

  removeClinic: async (req: Request, res: Response) => {
    await superAdminService.removeClinic(req.params.id);
    res.status(204).send();
  },
};
