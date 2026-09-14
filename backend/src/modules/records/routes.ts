import { Router } from 'express';
import multer from 'multer';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { recordsController } from './controller';

// Patient-records routes, nested under `/api/patients/:patientId/records`. The
// clinic (tenant) is resolved by the middleware the router is mounted behind.
export const recordsRoutes = Router();

// Uploaded bytes are parsed into memory then handed to the storage module, so
// the storage backend stays swappable (local disk now → S3 later). 25 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

recordsRoutes.get('/:patientId/records', asyncHandler(recordsController.bundle));

recordsRoutes.put('/:patientId/records/observation', asyncHandler(recordsController.setObservation));

recordsRoutes.post('/:patientId/records/teeth', asyncHandler(recordsController.addTooth));
recordsRoutes.patch('/:patientId/records/teeth/:entryId', asyncHandler(recordsController.updateTooth));
recordsRoutes.delete('/:patientId/records/teeth/:entryId', asyncHandler(recordsController.removeTooth));

recordsRoutes.post('/:patientId/records/medical-history', asyncHandler(recordsController.addMed));
recordsRoutes.patch('/:patientId/records/medical-history/:entryId', asyncHandler(recordsController.updateMed));
recordsRoutes.delete('/:patientId/records/medical-history/:entryId', asyncHandler(recordsController.removeMed));

recordsRoutes.post(
  '/:patientId/records/documents',
  upload.single('file'),
  asyncHandler(recordsController.addDocument),
);
recordsRoutes.get(
  '/:patientId/records/documents/:documentId/download',
  asyncHandler(recordsController.downloadDocument),
);
recordsRoutes.delete(
  '/:patientId/records/documents/:documentId',
  asyncHandler(recordsController.removeDocument),
);
