import type { Request, Response } from 'express';

import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { updateAccountSchema } from '../super-admin/schema';
import { createStaffSchema, resetAccountPasswordSchema } from './schema';
import { accountService } from './service';

// Clinic-admin (and super-admin) management of a clinic's accounts. Scoped to
// the caller's clinic (requireTenant) and gated to CLIENT_ADMIN / SUPER_ADMIN in
// app.ts. The list returns admins + staff; create/update/delete stay staff-only.
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
    res.json(await accountService.update(clinicId, req.params.id, req.user!.id, data));
  },

  remove: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await accountService.remove(clinicId, req.params.id, req.user!.id);
    res.status(204).send();
  },

  resetPassword: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { password } = resetAccountPasswordSchema.parse(req.body);
    await accountService.resetPassword(clinicId, req.params.id, req.user!.id, password);
    res.status(204).send();
  },
};
