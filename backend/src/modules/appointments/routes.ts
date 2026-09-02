import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { appointmentController } from './controller';

export const appointmentRoutes = Router();

appointmentRoutes.get('/', asyncHandler(appointmentController.list));
// Must precede `/:id` so "availability" isn't captured as an appointment id.
appointmentRoutes.get('/availability', asyncHandler(appointmentController.availability));
appointmentRoutes.get('/:id', asyncHandler(appointmentController.get));
appointmentRoutes.post('/', asyncHandler(appointmentController.create));
appointmentRoutes.patch('/:id', asyncHandler(appointmentController.update));
appointmentRoutes.delete('/:id', asyncHandler(appointmentController.remove));
