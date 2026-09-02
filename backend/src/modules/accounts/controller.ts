import type { Request, Response } from 'express';

import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { updateAccountSchema } from '../super-admin/schema';
import { createStaffSchema } from './schema';
import { accountService } from './service';

// Clinic-admin management of a clinic's own doctors + receptionists. Scoped to
// the caller's clinic (requireTenant) and gated to CLIENT_ADMIN in app.ts.
export const accountController = {
  list: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await accountService.list(clinicId));
  },

  create: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = createStaffSchema.parse(req.body);
    res.status(201).json(await accountService.create(clinicId, data));
  },

  update: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = updateAccountSchema.parse(req.body);
    res.json(await accountService.update(clinicId, req.params.id, data));
  },

  remove: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await accountService.remove(clinicId, req.params.id);
    res.status(204).send();
  },
};
