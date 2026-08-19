import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { analyticsController } from './controller';

export const analyticsRoutes = Router();

analyticsRoutes.get('/summary', asyncHandler(analyticsController.summary));
