import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { accountController } from './controller';

export const accountRoutes = Router();

accountRoutes.get('/', asyncHandler(accountController.list));
accountRoutes.post('/', asyncHandler(accountController.create));
accountRoutes.patch('/:id', asyncHandler(accountController.update));
accountRoutes.delete('/:id', asyncHandler(accountController.remove));
