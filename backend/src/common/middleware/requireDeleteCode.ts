import type { NextFunction, Request, Response } from 'express';

import { env } from '../../config/env';
import { HttpError } from '../utils/httpError';

/**
 * Gate for destructive super-admin deletes (account / branch / clinic). The
 * caller must supply the shared deletion code — in the JSON body as `{ code }`
 * or the `x-delete-code` header — matching `SUPER_ADMIN_DELETE_CODE`. This is
 * an extra deliberate confirmation on top of the route's super-admin auth.
 */
export function requireDeleteCode(req: Request, _res: Response, next: NextFunction): void {
  const provided = String(req.body?.code ?? req.header('x-delete-code') ?? '').trim();
  if (!provided) {
    throw new HttpError(403, 'A deletion code is required to delete this.');
  }
  if (provided !== env.superAdmin.deleteCode) {
    throw new HttpError(403, 'Incorrect deletion code.');
  }
  next();
}
