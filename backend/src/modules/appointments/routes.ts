import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { appointmentController } from './controller';

export const appointmentRoutes = Router();

appointmentRoutes.get('/', asyncHandler(appointmentController.list));
appointmentRoutes.get('/:id', asyncHandler(appointmentController.get));
appointmentRoutes.post('/', asyncHandler(appointmentController.create));
appointmentRoutes.patch('/:id', asyncHandler(appointmentController.update));
appointmentRoutes.delete('/:id', asyncHandler(appointmentController.remove));
