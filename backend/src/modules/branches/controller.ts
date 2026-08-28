import type { Request, Response } from 'express';

import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { branchService } from './service';

export const branchController = {
  list: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await branchService.list(clinicId));
  },
};
