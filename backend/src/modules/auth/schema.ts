import { z } from 'zod';

/**
 * Password strength policy for new passwords (reset / set / change). At least
 * 8 characters, with an uppercase letter, a number and a special character.
 * Login is intentionally excluded — it only checks the password matches.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

/**
 * Login accepts a single `identifier` that is either an email address or a
 * phone number — the client shows one field and the server routes the lookup
 * (see phone.util `looksLikeEmail`). Password is only length-checked here.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or phone number'),
  password: z.string().min(1),
});

/** Request an OTP for the passwordless login path (code delivered by SMS). */
export const loginRequestOtpSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or phone number'),
});

/** Verify the login OTP and establish a session. */
export const loginVerifyOtpSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or phone number'),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

/**
 * Forced first-login reset: a new password plus explicit Terms & Conditions
 * acceptance. `acceptTerms` must be literally `true` — an unchecked box is
 * rejected server-side, not just disabled in the UI.
 */
export const completeOnboardingSchema = z.object({
  password: passwordSchema,
  acceptTerms: z.boolean().refine((v) => v === true, {
    message: 'You must accept the Terms & Conditions to continue',
  }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginRequestOtpInput = z.infer<typeof loginRequestOtpSchema>;
export type LoginVerifyOtpInput = z.infer<typeof loginVerifyOtpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
