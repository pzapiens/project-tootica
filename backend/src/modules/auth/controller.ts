import type { Request, Response } from 'express';

import { HttpError } from '../../common/utils/httpError';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  setPasswordSchema,
  verifyOtpSchema,
} from './schema';
import { authService } from './service';

export const authController = {
  login: async (req: Request, res: Response) => {
    const credentials = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(credentials);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ user });
  },

  me: async (req: Request, res: Response) => {
    if (!req.user) {
      throw new HttpError(401, 'Authentication required');
    }
    // authService.me returns { user, clinic } — the clinic lets the client
    // render the caller's clinic without a second request.
    res.json(await authService.me(req.user.id));
  },

  refresh: async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    const { user, accessToken, refreshToken } = await authService.refresh(token);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ user });
  },

  logout: async (_req: Request, res: Response) => {
    clearAuthCookies(res);
    res.status(204).send();
  },

  forgotPassword: async (req: Request, res: Response) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
  },

  verifyOtp: async (req: Request, res: Response) => {
    const { email, code } = verifyOtpSchema.parse(req.body);
    res.json(await authService.verifyOtp(email, code));
  },

  resetPassword: async (req: Request, res: Response) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    res.json({ message: 'Password has been reset.' });
  },

  setPassword: async (req: Request, res: Response) => {
    const { token, password } = setPasswordSchema.parse(req.body);
    await authService.setPassword(token, password);
    res.json({ message: 'Password has been set.' });
  },

  changePassword: async (req: Request, res: Response) => {
    if (!req.user) {
      throw new HttpError(401, 'Authentication required');
    }
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: 'Password has been changed.' });
  },
};
