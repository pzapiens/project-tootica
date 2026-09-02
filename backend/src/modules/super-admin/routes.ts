import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { requireDeleteCode } from '../../common/middleware/requireDeleteCode';
import { superAdminController } from './controller';

export const superAdminRoutes = Router();

superAdminRoutes.get('/branches', asyncHandler(superAdminController.listBranches));
superAdminRoutes.post('/branches', asyncHandler(superAdminController.createBranch));
superAdminRoutes.patch('/branches/:id', asyncHandler(superAdminController.updateBranch));
superAdminRoutes.delete(
  '/branches/:id',
  requireDeleteCode,
  asyncHandler(superAdminController.removeBranch),
);
superAdminRoutes.post('/accounts', asyncHandler(superAdminController.createAccount));
superAdminRoutes.patch('/accounts/:id', asyncHandler(superAdminController.updateAccount));
superAdminRoutes.delete(
  '/accounts/:id',
  requireDeleteCode,
  asyncHandler(superAdminController.removeAccount),
);
superAdminRoutes.get('/clinics', asyncHandler(superAdminController.listClinics));
superAdminRoutes.get(
  '/clinics/:id/accounts',
  asyncHandler(superAdminController.listAccounts),
);
superAdminRoutes.get('/clinics/:id', asyncHandler(superAdminController.getClinic));
superAdminRoutes.post('/clinics', asyncHandler(superAdminController.createClinic));
superAdminRoutes.patch('/clinics/:id', asyncHandler(superAdminController.updateClinic));
superAdminRoutes.delete(
  '/clinics/:id',
  requireDeleteCode,
  asyncHandler(superAdminController.removeClinic),
);
