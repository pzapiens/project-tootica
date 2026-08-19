# Tootica — Backend

Backend API for the Tootica dental management system. Multi-tenant (per-clinic),
built around a hexagonal, module-per-feature layout.

**Stack:** Express · TypeScript · Prisma 7 (PostgreSQL) · Zod · JWT (httpOnly cookies) · bcrypt · Nodemailer · ESLint · Prettier

## Requirements

- Node.js >= 20
- Docker (for local Postgres + MailHog)

## Getting started

Prerequisites: **Node 20+** and **Docker Desktop running**.

```bash
npm install     # installs deps + generates the Prisma client
npm run setup   # creates .env (+ JWT secrets), starts Docker, migrates, seeds
npm run dev     # http://localhost:4000 with hot reload
```

`npm run setup` is idempotent — safe to re-run. It won't overwrite an existing
`.env`. If you'd rather do it by hand, see the equivalent steps below.

<details>
<summary>Manual setup (what <code>npm run setup</code> automates)</summary>

```bash
docker compose up -d          # starts Postgres + MailHog (see below)
cp .env.example .env          # then set real values (see Environment variables)

# generate JWT secrets and paste them into .env (run x3):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run db:migrate:deploy     # apply migrations
npm run db:seed               # create dev accounts + sample data
```

</details>

Health check: `GET http://localhost:4000/health` (also `/api/health` for the frontend proxy).

### Seeded dev data

`npm run db:seed` **wipes and re-inserts** a realistic dataset (refuses to run
with `NODE_ENV=production`): 1 super admin + 3 clinics, each with a client admin,
2 doctors, 1 time-boxed guest doctor, a receptionist, doctor profiles + weekly
shifts, 5 patients and 6 appointments (past + upcoming, mixed statuses).

Key logins (dev only; all staff use `Password123!`):

| Role           | Email                                        | Password          |
| -------------- | -------------------------------------------- | ----------------- |
| `SUPER_ADMIN`  | `super@tootica.local`                        | `SuperSecret123!` |
| `CLIENT_ADMIN` | `admin@tootica.local` (Bright Smile Dental)  | `Password123!`    |
| `CLIENT_ADMIN` | `admin@gentlecare.test`, `admin@sunrise.test`| `Password123!`    |

The super admin password is a hardcoded initial value — change it after first login.

## Local services (Docker)

`docker compose up -d` starts two containers:

| Service    | Purpose                    | Host ports                       |
| ---------- | -------------------------- | -------------------------------- |
| `postgres` | PostgreSQL 16 database     | `5432`                           |
| `mailhog`  | Local SMTP + email viewer  | `1025` (SMTP), `8025` (web UI)   |

- **Postgres** — connect a client (TablePlus/DBeaver/psql) with:
  host `localhost`, port `5432`, database `tootica`, user `tootica`,
  password `tootica_dev_password`. Or use the `DATABASE_URL` from `.env.example`.
- **MailHog** — outgoing mail (e.g. OTP emails) is caught, not sent. View it at
  <http://localhost:8025>.

Stop with `docker compose down` (add `-v` to also wipe the database volume).

## Scripts

| Script                    | Description                                  |
| ------------------------- | -------------------------------------------- |
| `npm run setup`           | One-command local setup (.env, Docker, migrate, seed) |
| `npm run dev`             | Start dev server with hot reload (tsx watch) |
| `npm run build`           | Compile TypeScript to `dist/`                |
| `npm start`               | Run the compiled server from `dist/`         |
| `npm run typecheck`       | Type-check without emitting                  |
| `npm run lint`            | Lint with ESLint                             |
| `npm run lint:fix`        | Lint and auto-fix                            |
| `npm run format`          | Format with Prettier                         |
| `npm run format:check`    | Check formatting without writing             |
| `npm run db:generate`     | Regenerate the Prisma client                 |
| `npm run db:migrate`      | Create + apply a migration (dev)             |
| `npm run db:migrate:deploy` | Apply pending migrations (non-interactive) |
| `npm run db:seed`         | Seed dev accounts                            |
| `npm run db:studio`       | Open Prisma Studio                           |
| `npm run db:reset`        | Drop, re-migrate and re-seed the database    |

## Project structure

Hexagonal, one folder per feature module. Each module owns its own
controller / service / repository / routes / schema.

```
src/
├── config/                 # env.ts — centralized, validated env loader
├── common/
│   ├── db/                 # Prisma client singleton (pg driver adapter)
│   ├── email/              # EmailProvider interface + Nodemailer impl
│   ├── middleware/         # auth, tenant, error handler, asyncHandler
│   ├── types/              # Express Request augmentation (req.user, req.clinicId)
│   └── utils/              # httpError, password (bcrypt)
├── modules/
│   ├── auth/               # login, tokens, OTP, invites (see Auth below)
│   ├── patients/
│   ├── doctors/
│   ├── appointments/
│   ├── analytics/
│   └── super-admin/        # cross-tenant clinic management
├── generated/prisma/       # generated Prisma client (gitignored)
├── app.ts                  # app factory (middleware + route wiring)
├── server.ts               # local / container entry point (app.listen)
└── lambda.ts               # serverless-http wrapper (same app, for AWS Lambda)
```

## Auth & multi-tenancy

- **Cookies, not bearer tokens.** `POST /api/auth/login` sets two httpOnly
  cookies: `access_token` (short-lived) and `refresh_token`. `POST /api/auth/refresh`
  silently rotates them. The frontend must send requests with credentials
  (`fetch(..., { credentials: 'include' })`); CORS is configured accordingly.
- **`authenticate`** verifies the access cookie and attaches `req.user`
  (`{ id, email, role, clinicId }`).
- **`requireTenant`** derives `req.clinicId` from `req.user` for tenant-scoped
  modules. It is **not** applied to `/api/super-admin/*` (a super admin has no
  single clinic); those routes use `requireSuperAdmin` instead.
- **Password reset** uses a 6-digit OTP emailed via MailHog, held in an
  in-memory `OtpStore` (swap for Redis in prod), with resend cooldown + attempt
  caps. A successful OTP exchange returns a short-lived reset token.
- **Invite onboarding:** `password_hash` is nullable; an invited user sets their
  password via `POST /api/auth/set-password` (which also activates the account).

## API reference

Base path: `/api`. All non-auth modules require a valid session cookie.

Full request/response JSON shapes for every endpoint (built and planned) are in
[`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md).

### Auth (`/api/auth`)

| Method | Path               | Auth | Body                                  |
| ------ | ------------------ | ---- | ------------------------------------- |
| POST   | `/login`           | —    | `{ email, password }`                 |
| GET    | `/me`              | ✅   | —                                     |
| POST   | `/refresh`         | cookie | —                                   |
| POST   | `/logout`          | —    | —                                     |
| POST   | `/forgot-password` | —    | `{ email }`                           |
| POST   | `/verify-otp`      | —    | `{ email, code }` → `{ resetToken }`  |
| POST   | `/reset-password`  | —    | `{ token, password }`                 |
| POST   | `/set-password`    | —    | `{ token, password }` (invite token)  |
| POST   | `/change-password` | ✅   | `{ currentPassword, newPassword }`    |

### Feature modules

- `GET/POST/PATCH/DELETE /api/patients` — tenant-scoped CRUD
- `GET/POST/PATCH/DELETE /api/doctors` — tenant-scoped CRUD
- `GET/POST/PATCH/DELETE /api/appointments` — tenant-scoped CRUD
- `GET /api/analytics/summary` — per-clinic counts
- `GET/POST/PATCH/DELETE /api/super-admin/clinics` — SUPER_ADMIN only

## Deployment

The app has two entry points that share the same Express app (`app.ts`):

- `server.ts` — local / container (`app.listen`)
- `lambda.ts` — AWS Lambda via `serverless-http` (handler: `dist/lambda.handler`)

For the full current architecture and the AWS API Gateway + Lambda migration
plan, see [`docs/AWS_MIGRATION.md`](./docs/AWS_MIGRATION.md).

## Testing with Postman

A ready-to-use collection lives in [`postman/`](./postman):

1. Import `postman/Tootica.postman_collection.json`.
2. Make sure Docker, the migrations, the seed, and `npm run dev` are all running.
3. Postman stores the login cookies automatically — run **Auth → Login** first,
   then any other request reuses the session.
4. The password-reset flow includes a **Fetch latest OTP (MailHog)** helper that
   reads the code straight from MailHog and stores it for **Verify OTP**.

See [`postman/README.md`](./postman/README.md) for details.

## Environment variables

See `.env.example`. Copy it to `.env` and adjust. JWT secrets are **required**
(no hardcoded fallback) — generate strong random values.

| Variable                     | Default                   | Description                                 |
| ---------------------------- | ------------------------- | ------------------------------------------- |
| `NODE_ENV`                   | `development`             | Runtime environment                         |
| `PORT`                       | `4000`                    | Port the server listens on                  |
| `CORS_ORIGIN`                | `http://localhost:3000`   | Comma-separated allowed CORS origins        |
| `DATABASE_URL`               | —                         | PostgreSQL connection string                |
| `SMTP_HOST` / `SMTP_PORT`    | `localhost` / `1025`      | SMTP transport (MailHog locally)            |
| `SMTP_USER` / `SMTP_PASSWORD`| — / —                     | SMTP auth (empty locally)                   |
| `MAIL_FROM`                  | `Tootica <no-reply@…>`    | From address for outbound mail              |
| `JWT_ACCESS_SECRET`          | — (required)              | Signs access tokens                         |
| `JWT_REFRESH_SECRET`         | — (required)              | Signs refresh tokens                        |
| `JWT_ACTION_SECRET`          | — (required)              | Signs reset + invite tokens                 |
| `ACCESS_TOKEN_TTL_SECONDS`   | `900`                     | Access token lifetime (15m)                 |
| `REFRESH_TOKEN_TTL_SECONDS`  | `604800`                  | Refresh token lifetime (7d)                 |
| `RESET_TOKEN_TTL_SECONDS`    | `600`                     | Password-reset token lifetime (10m)         |
| `INVITE_TOKEN_TTL_SECONDS`   | `604800`                  | Invite/set-password token lifetime (7d)     |
| `OTP_TTL_SECONDS`            | `600`                     | OTP validity window (10m)                   |
| `OTP_RESEND_COOLDOWN_SECONDS`| `60`                      | Minimum gap between OTP resends             |
| `OTP_MAX_ATTEMPTS`           | `5`                       | Failed verifications before lockout         |
| `OTP_MAX_RESENDS`            | `5`                       | Max OTP sends per window                    |
