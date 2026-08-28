import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { branchController } from './controller';

export const branchRoutes = Router();

branchRoutes.get('/', asyncHandler(branchController.list));
