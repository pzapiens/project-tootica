import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { doctorController } from './controller';

export const doctorRoutes = Router();

doctorRoutes.get('/', asyncHandler(doctorController.list));
doctorRoutes.get('/:id', asyncHandler(doctorController.get));
doctorRoutes.post('/', asyncHandler(doctorController.create));
doctorRoutes.patch('/:id', asyncHandler(doctorController.update));
doctorRoutes.delete('/:id', asyncHandler(doctorController.remove));

// Per-doctor shifts + availability blocks (replace-all semantics).
doctorRoutes.get('/:id/shifts', asyncHandler(doctorController.listShifts));
doctorRoutes.put('/:id/shifts', asyncHandler(doctorController.putShifts));
doctorRoutes.get('/:id/blocks', asyncHandler(doctorController.listBlocks));
doctorRoutes.put('/:id/blocks', asyncHandler(doctorController.putBlocks));
