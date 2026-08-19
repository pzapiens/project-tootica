import 'express';

import type { AuthUser } from '../middleware/auth.middleware';

// Request context populated by middleware:
//   - `user`     by authenticate (common/middleware/auth.middleware.ts)
//   - `clinicId` by requireTenant (common/middleware/tenant.middleware.ts)
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      clinicId?: string;
    }
  }
}
