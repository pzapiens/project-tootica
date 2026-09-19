import type { Request, Response } from 'express';

import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { revenueService } from './service';

export const revenueController = {
  transactions: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await revenueService.transactions(clinicId));
  },
};
