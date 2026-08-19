import { emailProvider } from '../../common/email/emailProvider';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { HttpError } from '../../common/utils/httpError';
import { env } from '../../config/env';
import { authRepository } from './repository';
import {
  signAccessToken,
  signActionToken,
  signRefreshToken,
  verifyActionToken,
  verifyRefreshToken,
} from './jwt.util';
import { generateOtp } from './otp.util';
import { otpStore } from './otpStore';
import type { LoginInput } from './schema';

type UserRecord = NonNullable<Awaited<ReturnType<typeof authRepository.findById>>>;

function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    clinicId: user.clinicId,
    status: user.status,
    accessStartDate: user.accessStartDate,
    accessEndDate: user.accessEndDate,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function assertActive(user: UserRecord): void {
  if (user.status !== 'ACTIVE') {
    throw new HttpError(403, 'Account is not active');
  }
  const now = new Date();
  if (user.accessStartDate && now < user.accessStartDate) {
    throw new HttpError(403, 'Account access has not started yet');
  }
  if (user.accessEndDate && now > user.accessEndDate) {
    throw new HttpError(403, 'Account access has expired');
  }
}

function issueTokens(user: UserRecord): { accessToken: string; refreshToken: string } {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    clinicId: user.clinicId,
  });
  const refreshToken = signRefreshToken(user.id);
  return { accessToken, refreshToken };
}

export const authService = {
  login: async (input: LoginInput) => {
    const user = await authRepository.findByEmail(input.email);
    if (!user || !user.passwordHash) {
      throw new HttpError(401, 'Invalid credentials');
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'Invalid credentials');
    }
    assertActive(user);
    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  me: async (userId: string) => {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new HttpError(401, 'Authentication required');
    }
    return toPublicUser(user);
  },

  refresh: async (refreshToken: string | undefined) => {
    if (!refreshToken) {
      throw new HttpError(401, 'Missing refresh token');
    }
    const { sub } = verifyRefreshToken(refreshToken);
    const user = await authRepository.findById(sub);
    if (!user) {
      throw new HttpError(401, 'Invalid refresh token');
    }
    assertActive(user);
    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  forgotPassword: async (email: string): Promise<void> => {
    const user = await authRepository.findByEmail(email);
    // Don't reveal whether the account exists — controller always 200s.
    if (!user) {
      return;
    }

    const now = Date.now();
    const existing = await otpStore.get(email);
    if (existing) {
      if (now - existing.lastSentAt < env.otp.resendCooldownSeconds * 1000) {
        throw new HttpError(429, 'Please wait before requesting another code');
      }
      if (existing.sendCount >= env.otp.maxResends) {
        throw new HttpError(429, 'Too many code requests. Try again later');
      }
    }

    const code = generateOtp();
    await otpStore.set(email, {
      code,
      expiresAt: now + env.otp.ttlSeconds * 1000,
      attempts: 0,
      sendCount: (existing?.sendCount ?? 0) + 1,
      lastSentAt: now,
    });

    await emailProvider.send({
      to: email,
      subject: 'Your Tootica password reset code',
      text: `Your password reset code is ${code}. It expires in ${Math.round(
        env.otp.ttlSeconds / 60,
      )} minutes.`,
    });
  },

  verifyOtp: async (email: string, code: string) => {
    const record = await otpStore.get(email);
    if (!record || Date.now() > record.expiresAt) {
      await otpStore.delete(email);
      throw new HttpError(400, 'Invalid or expired code');
    }
    if (record.attempts >= env.otp.maxAttempts) {
      await otpStore.delete(email);
      throw new HttpError(429, 'Too many attempts. Request a new code');
    }
    if (record.code !== code) {
      await otpStore.set(email, { ...record, attempts: record.attempts + 1 });
      throw new HttpError(400, 'Invalid or expired code');
    }

    // Consume the OTP and hand back a short-lived reset token.
    await otpStore.delete(email);
    const user = await authRepository.findByEmail(email);
    if (!user) {
      throw new HttpError(400, 'Invalid or expired code');
    }
    return { resetToken: signActionToken(user.id, 'reset') };
  },

  resetPassword: async (token: string, password: string): Promise<void> => {
    const { sub } = verifyActionToken(token, 'reset');
    const user = await authRepository.findById(sub);
    if (!user) {
      throw new HttpError(400, 'Invalid or expired token');
    }
    await authRepository.updatePassword(sub, await hashPassword(password));
  },

  setPassword: async (token: string, password: string): Promise<void> => {
    const { sub } = verifyActionToken(token, 'invite');
    const user = await authRepository.findById(sub);
    if (!user) {
      throw new HttpError(400, 'Invalid or expired token');
    }
    await authRepository.setInitialPassword(sub, await hashPassword(password));
  },

  changePassword: async (
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> => {
    const user = await authRepository.findById(userId);
    if (!user || !user.passwordHash) {
      throw new HttpError(400, 'Password is not set for this account');
    }
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'Current password is incorrect');
    }
    await authRepository.updatePassword(userId, await hashPassword(newPassword));
  },
};
