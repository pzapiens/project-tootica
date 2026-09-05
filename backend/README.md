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

For the **documented dataset** (2 clinics × 2 branches with branch-scoped staff,
the accounts in [`docs/ACCOUNTS.md`](./docs/ACCOUNTS.md)) plus a few months of
sample appointments — both **wipe** existing data:

```bash
npm run db:provision            # 1 super admin + 2 clinics × 2 branches + staff
npm run db:seed:appointments    # ~30 appointments per clinic + patients
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

Seed scripts (all refuse to run with `NODE_ENV=production`):

- **`npm run db:seed:all`** — **the easiest one-command setup for a fresh
  machine.** Wipes, then creates the whole dataset in one go: the super admin,
  **2 clinics × 2 branches** with admins / doctors / receptionists, **doctor
  weekly shifts**, patients, and appointments across the **past 6 months, today,
  and the next 4 weeks** — so the dashboard's Today's Appointments, the stat
  cards and the full calendar all have data on first login. Deterministic (same
  result on every machine); same logins as `db:provision`.
- **`npm run db:provision`** — the documented, minimal dataset: **1 super admin +
  2 clinics, each with 2 branches**, and **per branch** 1 doctor + 1 receptionist
  (the receptionist is the branch's person-in-charge). Client admins are
  clinic-wide. Every account is pre-onboarded (known password, no forced reset),
  and each entity gets a display code (`CL-…`, `BR-…`, `DOC-…`). Wipes first.
- **`npm run db:seed:appointments`** — tops up patients and adds ~30 appointments
  per clinic across the previous months (deterministic, replayable).
- **`npm run db:seed`** — an older, richer sample set (3 clinics, guest doctors,
  weekly shifts). Not the documented dataset.

Key logins after `db:provision` (dev only) — full list in
[`docs/ACCOUNTS.md`](./docs/ACCOUNTS.md):

| Role           | Email                     | Password         |
| -------------- | ------------------------- | ---------------- |
| `SUPER_ADMIN`  | `superadmin@tootica.com`  | `SuperAdmin@123` |
| `CLIENT_ADMIN` | `admin@brightsmile.com`   | `Password@123`   |
| `CLIENT_ADMIN` | `admin@gentlecare.com`    | `Password@123`   |

All other staff (doctors, receptionists) also use `Password@123`.

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
| `npm run db:seed`         | Seed the legacy richer dataset (3 clinics)   |
| `npm run db:seed:all`     | **One-shot full seed**: accounts + branches + doctor shifts + patients + past/today/upcoming appointments — wipes first |
| `npm run db:provision`    | Seed the documented dataset (2 clinics × 2 branches) — wipes first |
| `npm run db:seed:appointments` | Add sample patients + appointments      |
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
│   ├── branches/           # per-clinic branch list (tenant-scoped)
│   └── super-admin/        # cross-tenant clinics, branches & account onboarding
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
- **`requireTenant`** derives `req.clinicId` for tenant-scoped modules. A normal
  user is bound to their **own** `clinicId` from the token. A **super admin** has
  no clinic of their own, so they target one per request via the **`X-Clinic-Id`
  header** (validated to exist) — this lets a super admin drill into any clinic's
  tenant-scoped data (patients, appointments, analytics, …). The dedicated
  `/api/super-admin/*` management routes are **not** tenant-scoped; they use
  `requireSuperAdmin` instead.
- **Login errors are specific.** Login returns distinct 401 messages —
  `"No account found with this email address"` vs `"Incorrect password"` — so the
  client can point at the right field. (This trades a little account-enumeration
  resistance for clearer UX; the forgot-password flow still hides account
  existence.)
- **Password policy.** New passwords (reset / set / change) must be **≥ 8 chars
  with an uppercase letter, a number and a special character** (shared
  `passwordSchema`). Login itself only checks the password matches.
- **Password reset** uses a 6-digit OTP emailed via MailHog, held in an
  in-memory `OtpStore` (swap for Redis in prod), with resend cooldown + attempt
  caps. A successful OTP exchange returns a short-lived reset token.
- **Invite onboarding:** `password_hash` is nullable; an invited user sets their
  password via `POST /api/auth/set-password` (which also activates the account).
- **Temp password + forced first-login reset.** Super-admin-created accounts get
  a random temporary password (emailed to the user, and returned once to the
  admin) and `must_reset_password = true`. On first login the client shows a
  mandatory card; `POST /api/auth/complete-onboarding` sets the new password,
  clears the flag and records `terms_accepted_at` (Terms & Conditions).
- **User profile columns.** `users` carries optional `first_name`, `last_name`,
  `title` and `phone`, used for greetings and person-in-charge display.
  `GET /api/auth/me` returns `{ user, clinic }` (the caller plus their clinic,
  `null` for a super admin).

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
| POST   | `/complete-onboarding` | ✅ | `{ password, acceptTerms: true }` (first login) |

### Feature modules

- `GET/POST/PATCH/DELETE /api/patients` — tenant-scoped CRUD (patients carry
  `gender` + a `PAT-…` code). `DELETE` **cascades**: it removes the patient's
  appointments in the same transaction (the FK has no DB-level cascade), so
  deleting a patient with history succeeds instead of failing on the constraint
- `GET/POST/PATCH/DELETE /api/doctors` — tenant-scoped CRUD; the list resolves the
  doctor's display name + email + `role` + branch and a `DOC-…` code. `POST`
  creates a **guest doctor** (provisions a `GUEST_DOCTOR` user + profile inside
  the clinic from name/phone/specialization — **email is optional**; when omitted
  a unique placeholder `@guest.tootica.local` address is minted to satisfy the
  unique/non-null `User.email` constraint and is reported back as `null`. No
  branch field; the guest is pinned to the branch being viewed so it shows in
  that branch's list). `PATCH`
  and `DELETE` operate on guest doctors only and **reject employed doctors** (role
  `DOCTOR`, managed via the account flow) with 403
- `GET/POST/PATCH/DELETE /api/appointments` — tenant-scoped CRUD. The list joins
  patient + doctor and accepts `from`/`to`/`status`/`limit` filters. `POST` takes
  a `nonMandatory` flag: when **false** it enforces **business hours (9 AM–6 PM)**
  and rejects a **doctor double-booking**; when **true** it skips both. A no-time
  booking is stored as zero-duration (`startTime == endTime`).
- `GET /api/appointments/availability?date=&from=&to=&doctorId=&excludeAppointmentId=`
  — per-doctor day bookings and, when a time range is given, whether each doctor
  is free. `excludeAppointmentId` drops one appointment from the day's bookings —
  used when **editing**, so an appointment's own slot doesn't read as a conflict.
- `GET /api/branches` — the caller's clinic branches (`{ id, clinicId, code, name, picName, contact }`)
- `GET /api/analytics/summary?from=&to=` — per-clinic counts plus a `byStatus`
  breakdown (`total`, `completed`, `pending`, `cancelled`).

### Super Admin (`/api/super-admin`, SUPER_ADMIN only)

- `GET/POST/PATCH/DELETE /clinics` — cross-tenant clinic management. `POST`
  creates the clinic **with one or more branches**: `{ name, plan?, branches: [{ name, picName?, contact? }] }`.
  `DELETE /clinics/:id` **cascades** — it removes the clinic **and everything it
  owns** (branches, staff, doctors, patients, appointments) in a single
  transaction, so a failure at any step rolls the whole delete back.
- `GET /branches` — **every** branch across all clinics (each with a unique
  **`BR-…` code**, PIC and contact); `POST /branches` adds a branch to a clinic
  (`{ clinicId, name, picName?, contact? }`); `PATCH /branches/:id` edits it.
- `GET /clinics/:id/accounts` — a clinic's staff (with each account's branch), for
  the "Manage Accounts" screens.
- `POST /accounts` — onboard a staff account:
  `{ clinicId, branchId?, firstName, lastName, title?, accountType: ADMIN|DOCTOR|RECEPTIONIST, email, phone? }`
  → creates the `User` (`CLIENT_ADMIN`/`DOCTOR`/`RECEPTIONIST`, plus a doctor
  profile for doctors). Doctors + receptionists are pinned to `branchId`; admins
  are clinic-wide. Returns a one-time `temporaryPassword` (also emailed) and
  `emailSent`. `409` on a duplicate email.
- `PATCH /accounts/:id` — edit / suspend / re-activate. `DELETE /accounts/:id`.

**Deletion code.** `DELETE` on `/accounts/:id`, `/branches/:id` and `/clinics/:id`
requires the super-admin deletion code — sent as `{ code }` in the body or an
`x-delete-code` header, matched against `SUPER_ADMIN_DELETE_CODE`.

**Display codes** (`CL-`, `BR-`, `PAT-`, `DOC-`, `APT-`) are globally sequential,
backed by a `counters` table. **Contact numbers** (account `phone`, branch
`contact`) are validated as an Indian number — the `91` country code + 10 digits.

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
| `SUPER_ADMIN_DELETE_CODE`    | `246810`                  | Code required to confirm destructive deletes |
