import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { superAdminController } from './controller';

export const superAdminRoutes = Router();

superAdminRoutes.get('/branches', asyncHandler(superAdminController.listBranches));
superAdminRoutes.patch('/branches/:id', asyncHandler(superAdminController.updateBranch));
superAdminRoutes.delete('/branches/:id', asyncHandler(superAdminController.removeBranch));
superAdminRoutes.post('/accounts', asyncHandler(superAdminController.createAccount));
superAdminRoutes.get('/clinics', asyncHandler(superAdminController.listClinics));
superAdminRoutes.get('/clinics/:id', asyncHandler(superAdminController.getClinic));
superAdminRoutes.post('/clinics', asyncHandler(superAdminController.createClinic));
superAdminRoutes.patch('/clinics/:id', asyncHandler(superAdminController.updateClinic));
superAdminRoutes.delete('/clinics/:id', asyncHandler(superAdminController.removeClinic));
