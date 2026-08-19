import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { doctorController } from './controller';

export const doctorRoutes = Router();

doctorRoutes.get('/', asyncHandler(doctorController.list));
doctorRoutes.get('/:id', asyncHandler(doctorController.get));
doctorRoutes.post('/', asyncHandler(doctorController.create));
doctorRoutes.patch('/:id', asyncHandler(doctorController.update));
doctorRoutes.delete('/:id', asyncHandler(doctorController.remove));
