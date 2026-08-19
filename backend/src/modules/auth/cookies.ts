import type { Response } from 'express';

import { authCookieOptions, env } from '../../config/env';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...authCookieOptions,
    maxAge: env.jwt.accessTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...authCookieOptions,
    maxAge: env.jwt.refreshTtlSeconds * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, authCookieOptions);
  res.clearCookie(REFRESH_COOKIE, authCookieOptions);
}
