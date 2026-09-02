import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env, isProduction } from './config/env';
import { authenticate, requireRole, requireSuperAdmin } from './common/middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { requireTenant, resolveBranch } from './common/middleware/tenant.middleware';
import { accountRoutes } from './modules/accounts/routes';
import { analyticsRoutes } from './modules/analytics/routes';
import { appointmentRoutes } from './modules/appointments/routes';
import { authRoutes } from './modules/auth/routes';
import { branchRoutes } from './modules/branches/routes';
import { doctorRoutes } from './modules/doctors/routes';
import { patientRoutes } from './modules/patients/routes';
import { superAdminRoutes } from './modules/super-admin/routes';

function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'tootica-backend',
    timestamp: new Date().toISOString(),
  });
}

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  // Health check is exposed at both the root (for infra/load-balancer probes)
  // and under /api (for the frontend proxy, which forwards /api/*).
  app.get('/health', healthCheck);
  app.get('/api/health', healthCheck);

  // Auth module handles its own per-route protection.
  app.use('/api/auth', authRoutes);

  // Tenant-scoped modules: authenticate, then resolve the clinic from the user.
  // Doctors, appointments and analytics additionally resolve the active branch
  // (X-Branch-Code) so their lists/counts are partitioned per branch. Patients
  // stay clinic-wide (shared across a clinic's branches).
  app.use('/api/patients', authenticate, requireTenant, patientRoutes);
  app.use('/api/branches', authenticate, requireTenant, branchRoutes);
  app.use('/api/doctors', authenticate, requireTenant, resolveBranch, doctorRoutes);
  app.use('/api/appointments', authenticate, requireTenant, resolveBranch, appointmentRoutes);
  app.use('/api/analytics', authenticate, requireTenant, resolveBranch, analyticsRoutes);

  // Clinic admins manage their own clinic's doctors + receptionists.
  app.use(
    '/api/accounts',
    authenticate,
    requireTenant,
    requireRole('CLIENT_ADMIN'),
    accountRoutes,
  );

  // Super Admin: authenticated + role-gated, but NOT clinic-scoped.
  app.use('/api/super-admin', authenticate, requireSuperAdmin, superAdminRoutes);

  // Fallbacks — keep these registered last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
