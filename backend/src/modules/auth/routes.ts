import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { authController } from './controller';

export const authRoutes = Router();

// Public endpoints.
authRoutes.post('/login', asyncHandler(authController.login));
authRoutes.post('/refresh', asyncHandler(authController.refresh));
authRoutes.post('/logout', asyncHandler(authController.logout));
authRoutes.post('/forgot-password', asyncHandler(authController.forgotPassword));
authRoutes.post('/verify-otp', asyncHandler(authController.verifyOtp));
authRoutes.post('/reset-password', asyncHandler(authController.resetPassword));
authRoutes.post('/set-password', asyncHandler(authController.setPassword));

// Authenticated endpoints.
authRoutes.get('/me', authenticate, asyncHandler(authController.me));
authRoutes.post('/change-password', authenticate, asyncHandler(authController.changePassword));
