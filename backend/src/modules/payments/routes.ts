import { Router } from 'express';

import { asyncHandler } from '../../common/middleware/asyncHandler';
import { paymentController } from './controller';

// Payment routes, nested under `/api/appointments/:appointmentId/payments`. The
// clinic (tenant) is resolved by the middleware the router is mounted behind.
export const paymentRoutes = Router();

paymentRoutes.get('/:appointmentId/payments', asyncHandler(paymentController.list));
paymentRoutes.post('/:appointmentId/payments', asyncHandler(paymentController.create));
paymentRoutes.patch(
  '/:appointmentId/payments/:paymentId/paid',
  asyncHandler(paymentController.setPaid),
);
paymentRoutes.delete(
  '/:appointmentId/payments/:paymentId',
  asyncHandler(paymentController.remove),
);
