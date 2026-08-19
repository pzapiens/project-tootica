import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { patientController } from './controller';

export const patientRoutes = Router();

patientRoutes.get('/', asyncHandler(patientController.list));
patientRoutes.get('/:id', asyncHandler(patientController.get));
patientRoutes.post('/', asyncHandler(patientController.create));
patientRoutes.patch('/:id', asyncHandler(patientController.update));
patientRoutes.delete('/:id', asyncHandler(patientController.remove));
