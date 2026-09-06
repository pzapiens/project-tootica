import { emailProvider } from '../../common/email/emailProvider';
import { smsProvider } from '../../common/sms/smsProvider';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { looksLikeEmail, normalizePhone } from '../../common/utils/phone.util';
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
    title: user.title,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    clinicId: user.clinicId,
    // Branch a doctor/receptionist is pinned to (null for clinic-wide admins).
    branchId: user.branchId,
    status: user.status,
    // Drives the forced first-login "Reset Password" prompt on the client.
    mustResetPassword: user.mustResetPassword,
    termsAcceptedAt: user.termsAcceptedAt,
    accessStartDate: user.accessStartDate,
    accessEndDate: user.accessEndDate,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** The caller's clinic, trimmed to the public Clinic shape (or null). */
function toPublicClinic(user: UserRecord) {
  return user.clinic
    ? {
        id: user.clinic.id,
        name: user.clinic.name,
        status: user.clinic.status,
        plan: user.clinic.plan,
        createdAt: user.clinic.createdAt,
      }
    : null;
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

/**
 * Resolve a login identifier (email or phone) to an account. Emails are matched
 * verbatim; phones are normalized first so formatting differences don't matter.
 * Returns null when nothing matches — callers decide whether to reveal that.
 */
async function resolveLoginUser(identifier: string): Promise<UserRecord | null> {
  const trimmed = identifier.trim();
  if (looksLikeEmail(trimmed)) {
    // Matched verbatim, as before — the email unique index is case-sensitive.
    return authRepository.findByEmail(trimmed);
  }
  const phone = normalizePhone(trimmed);
  if (!phone) return null;
  return authRepository.findByPhone(phone);
}

/** OTP store key for a login code, namespaced so it never collides with the
 * password-reset OTP (which is keyed by email). Keyed by user id so it's stable
 * whether the user typed their email or their phone as the identifier. */
function loginOtpKey(userId: string): string {
  return `login:${userId}`;
}

function issueTokens(user: UserRecord): { accessToken: string; refreshToken: string } {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    clinicId: user.clinicId,
    branchId: user.branchId,
  });
  const refreshToken = signRefreshToken(user.id);
  return { accessToken, refreshToken };
}

export const authService = {
  login: async (input: LoginInput) => {
    const user = await resolveLoginUser(input.identifier);
    // NOTE: distinguishing "no such account" from "wrong password" is friendlier
    // but enables account enumeration. Acceptable here per product decision.
    if (!user) {
      throw new HttpError(401, 'No account found with those details');
    }
    if (!user.passwordHash) {
      throw new HttpError(
        401,
        'This account has no password set yet. Use your invite link to set one.',
      );
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'Incorrect password');
    }
    assertActive(user);
    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  /**
   * Passwordless login step 1: send a one-time code by SMS to the account's
   * phone. Mirrors forgotPassword's anti-enumeration stance — the controller
   * always returns a generic success, so we silently no-op when the account
   * doesn't exist, isn't active, or has no phone on file. Reuses the OTP
   * throttling policy (resend cooldown + send cap).
   */
  requestLoginOtp: async (identifier: string): Promise<void> => {
    const user = await resolveLoginUser(identifier);
    if (!user || user.status !== 'ACTIVE' || !user.phone) {
      return;
    }

    const key = loginOtpKey(user.id);
    const now = Date.now();
    const existing = await otpStore.get(key);
    if (existing) {
      if (now - existing.lastSentAt < env.otp.resendCooldownSeconds * 1000) {
        throw new HttpError(429, 'Please wait before requesting another code');
      }
      if (existing.sendCount >= env.otp.maxResends) {
        throw new HttpError(429, 'Too many code requests. Try again later');
      }
    }

    const code = generateOtp();
    await otpStore.set(key, {
      code,
      expiresAt: now + env.otp.ttlSeconds * 1000,
      attempts: 0,
      sendCount: (existing?.sendCount ?? 0) + 1,
      lastSentAt: now,
    });

    const expiryMinutes = Math.round(env.otp.ttlSeconds / 60);
    await smsProvider.send({
      to: user.phone,
      body: `Your Tootica login code is ${code}. It expires in ${expiryMinutes} minutes. Do not share it with anyone.`,
    });
  },

  /**
   * Passwordless login step 2: verify the SMS code and establish a session.
   * Unlike the reset-password OTP (which hands back a short-lived reset token),
   * this issues the full access/refresh tokens — the user is now logged in.
   */
  loginWithOtp: async (identifier: string, code: string) => {
    const user = await resolveLoginUser(identifier);
    // Generic message so a wrong identifier can't be told apart from a wrong code.
    if (!user) {
      throw new HttpError(400, 'Invalid or expired code');
    }
    const key = loginOtpKey(user.id);
    const record = await otpStore.get(key);
    if (!record || Date.now() > record.expiresAt) {
      await otpStore.delete(key);
      throw new HttpError(400, 'Invalid or expired code');
    }
    if (record.attempts >= env.otp.maxAttempts) {
      await otpStore.delete(key);
      throw new HttpError(429, 'Too many attempts. Request a new code');
    }
    if (record.code !== code) {
      await otpStore.set(key, { ...record, attempts: record.attempts + 1 });
      throw new HttpError(400, 'Invalid or expired code');
    }

    await otpStore.delete(key);
    assertActive(user);
    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  me: async (userId: string) => {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new HttpError(401, 'Authentication required');
    }
    return { user: toPublicUser(user), clinic: toPublicClinic(user) };
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

    const expiryMinutes = Math.round(env.otp.ttlSeconds / 60);
    await emailProvider.send({
      to: email,
      subject: 'Your Tootica password reset code',
      text: [
        'Hi,',
        '',
        'We received a request to reset the password for your Tootica account.',
        'Use the verification code below to continue:',
        '',
        `    ${code}`,
        '',
        `This code expires in ${expiryMinutes} minutes and can only be used once.`,
        'Enter it on the password reset screen to set a new password.',
        '',
        "If you didn't request a password reset, you can safely ignore this email —",
        'your password will stay the same.',
        '',
        'Thanks,',
        'The Tootica Team',
      ].join('\n'),
      html: `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
    <h2 style="margin:0 0 16px;font-size:20px;">Reset your Tootica password</h2>
    <p style="margin:0 0 12px;">Hi,</p>
    <p style="margin:0 0 12px;">
      We received a request to reset the password for your Tootica account.
      Use the verification code below to continue:
    </p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;
                background:#f2f5f9;border-radius:10px;padding:18px 0;margin:20px 0;color:#00478d;">
      ${code}
    </div>
    <p style="margin:0 0 12px;">
      This code expires in <strong>${expiryMinutes} minutes</strong> and can only be used once.
      Enter it on the password reset screen to set a new password.
    </p>
    <p style="margin:0 0 12px;color:#666;">
      If you didn't request a password reset, you can safely ignore this email —
      your password will stay the same.
    </p>
    <p style="margin:24px 0 0;">Thanks,<br/>The Tootica Team</p>
  </div>`,
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

  /**
   * Forced first-login flow. The caller is already authenticated (they just
   * logged in with their temporary password), so no current password is
   * required — they set a new one and accept the Terms & Conditions in one
   * step. Records the T&C acceptance and clears the reset requirement.
   */
  completeOnboarding: async (userId: string, password: string): Promise<void> => {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new HttpError(401, 'Authentication required');
    }
    await authRepository.completeOnboarding(userId, await hashPassword(password));
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
