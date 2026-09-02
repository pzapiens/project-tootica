import type { Request, Response } from 'express';

import {
  createAccountSchema,
  createBranchSchema,
  createClinicWithBranchesSchema,
  updateAccountSchema,
  updateBranchSchema,
  updateClinicSchema,
} from './schema';
import { superAdminService } from './service';

export const superAdminController = {
  listClinics: async (_req: Request, res: Response) => {
    res.json(await superAdminService.listClinics());
  },

  listBranches: async (_req: Request, res: Response) => {
    res.json(await superAdminService.listBranches());
  },

  updateBranch: async (req: Request, res: Response) => {
    const data = updateBranchSchema.parse(req.body);
    res.json(await superAdminService.updateBranch(req.params.id, data));
  },

  removeBranch: async (req: Request, res: Response) => {
    await superAdminService.removeBranch(req.params.id);
    res.status(204).send();
  },

  getClinic: async (req: Request, res: Response) => {
    res.json(await superAdminService.getClinic(req.params.id));
  },

  createClinic: async (req: Request, res: Response) => {
    const data = createClinicWithBranchesSchema.parse(req.body);
    res.status(201).json(await superAdminService.createClinic(data));
  },

  createBranch: async (req: Request, res: Response) => {
    const data = createBranchSchema.parse(req.body);
    res.status(201).json(await superAdminService.addBranch(data));
  },

  createAccount: async (req: Request, res: Response) => {
    const data = createAccountSchema.parse(req.body);
    res.status(201).json(await superAdminService.createAccount(data));
  },

  listAccounts: async (req: Request, res: Response) => {
    res.json(await superAdminService.listAccounts(req.params.id));
  },

  updateAccount: async (req: Request, res: Response) => {
    const data = updateAccountSchema.parse(req.body);
    res.json(await superAdminService.updateAccount(req.params.id, data));
  },

  removeAccount: async (req: Request, res: Response) => {
    await superAdminService.removeAccount(req.params.id);
    res.status(204).send();
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
