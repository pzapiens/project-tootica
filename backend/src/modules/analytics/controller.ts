import type { Request, Response } from 'express';

import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { analyticsQuerySchema } from './schema';
import { analyticsService } from './service';

export const analyticsController = {
  summary: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const range = analyticsQuerySchema.parse(req.query);
    res.json(await analyticsService.summary(clinicId, range));
  },
};
