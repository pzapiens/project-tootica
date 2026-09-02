import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: requireEnv('DATABASE_URL'),
  smtp: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.MAIL_FROM ?? 'Tootica <no-reply@tootica.local>',
  },
  jwt: {
    // Secrets are required — never hardcode them, even locally (see .env.example).
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    // Signs short-lived reset + invite tokens (differentiated by a `type` claim).
    actionSecret: requireEnv('JWT_ACTION_SECRET'),
    accessTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900), // 15m
    refreshTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 604800), // 7d
    resetTtlSeconds: Number(process.env.RESET_TOKEN_TTL_SECONDS ?? 600), // 10m
    inviteTtlSeconds: Number(process.env.INVITE_TOKEN_TTL_SECONDS ?? 604800), // 7d
  },
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 600), // 10m
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    maxResends: Number(process.env.OTP_MAX_RESENDS ?? 5),
  },
  superAdmin: {
    // Secret code a super admin must type to confirm any destructive delete
    // (account / branch / clinic). Set SUPER_ADMIN_DELETE_CODE in production.
    deleteCode: process.env.SUPER_ADMIN_DELETE_CODE ?? '246810',
  },
} as const;

/** Cookie flags for the auth token cookies. `secure` is on outside dev. */
export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export const isProduction = env.nodeEnv === 'production';
