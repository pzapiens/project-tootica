import 'express';

import type { AuthUser } from '../middleware/auth.middleware';

// Request context populated by middleware:
//   - `user`     by authenticate (common/middleware/auth.middleware.ts)
//   - `clinicId` by requireTenant (common/middleware/tenant.middleware.ts)
//   - `branchId` by resolveBranch (common/middleware/tenant.middleware.ts);
//     undefined means "no branch selected" → clinic-wide.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      clinicId?: string;
      branchId?: string;
    }
  }
}
