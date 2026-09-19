import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { revenueController } from './controller';

// Revenue routes, mounted at `/api/revenue`. Clinic-scoped (the transactions come
// from the clinic's payments); the client derives the summary + does the search,
// filter and timeframe over the returned list.
export const revenueRoutes = Router();

revenueRoutes.get('/transactions', asyncHandler(revenueController.transactions));
