# AWS Migration — Next Steps (Runbook)

An **actionable, sequenced checklist** for moving Tootica to AWS. This is the
"do this, in this order" companion to [`AWS_MIGRATION.md`](./AWS_MIGRATION.md),
which holds the architecture, component mapping and rationale — read that first
for the *why*; use this for the *how*.

The backend is already portable: `src/lambda.ts` wraps the same Express app as
`server.ts` via `serverless-http`, Prisma 7 uses a driver adapter, and the
stateful pieces are behind swappable interfaces. The work below is mostly
**provisioning infra** and **swapping four seams** (file storage, OTP store,
email, secrets) — not rewriting the app.

> Legend: ☐ = to do. Commands use placeholders in `<ANGLE_BRACKETS>` — replace
> with your account/region/resource names. Region assumed `ap-south-1` (Mumbai);
> change to suit.

---

## Phase 0 — Decisions to lock first

- ☐ **Account & region.** Pick the AWS account and region (data residency: India
  → `ap-south-1`).
- ☐ **Database:** Amazon **RDS for PostgreSQL** (simplest) vs **Aurora Serverless
  v2** (autoscaling). Either works — Prisma connects the same way. Put it in
  **private subnets** and front it with **RDS Proxy** (Lambda opens many short
  connections; the proxy pools them).
- ☐ **Lambda granularity:** keep the **single-function** API (one Lambda runs the
  whole Express app behind API Gateway) — see `AWS_MIGRATION.md` §4 "Lambda
  granularity". Don't split into per-route functions yet.
- ☐ **Domains:** decide API host (e.g. `api.tootica.com`) and app host
  (`app.tootica.com`). Cookies are cross-subdomain — see Phase 2.5.
- ☐ **IaC tool:** AWS **CDK** or **SST** (recommended for the Lambda+APIGW+RDS
  combo) vs the **Serverless Framework** vs Terraform. Pick one and keep all of
  the below in it rather than clicking in the console.

---

## Phase 1 — Provision AWS infrastructure

Do this once per environment (staging, then prod).

- ☐ **VPC** with private subnets (for RDS + the Lambda ENIs) and a NAT path for
  the Lambda to reach SES/Secrets Manager (or use **VPC endpoints** to avoid NAT
  cost).
- ☐ **RDS/Aurora PostgreSQL 16** in the private subnets. Note the endpoint,
  database name, user, password.
- ☐ **RDS Proxy** in front of it (IAM or secret-based auth). The Lambda's
  `DATABASE_URL` points at the **proxy** endpoint, not the DB directly.
- ☐ **S3 bucket** for patient-document uploads, e.g. `tootica-uploads-<env>`:
  - Block **all public access** (files are private; served through the API).
  - Enable **default encryption** (SSE-S3 or SSE-KMS) and **versioning**.
- ☐ **DynamoDB table** for the OTP store, e.g. `tootica-otp-<env>`:
  - Partition key `pk` (string). Enable **TTL** on an `expiresAt` attribute so
    expired OTPs auto-delete.
- ☐ **SES**: verify the sending domain / `MAIL_FROM` address; request
  **production access** (sandbox only emails verified addresses). Add DKIM.
- ☐ **Secrets Manager** (or SSM Parameter Store) entries for: the three JWT
  secrets, `DATABASE_URL`, `SUPER_ADMIN_DELETE_CODE`, and any SMS/Twilio creds.
- ☐ **IAM execution role** for the Lambda granting: `s3:GetObject/PutObject/
  DeleteObject` on the bucket, `dynamodb:*Item` on the OTP table, `ses:SendEmail`,
  `secretsmanager:GetSecretValue`, and VPC/ENI + CloudWatch Logs permissions.

---

## Phase 2 — Code changes (the four seams)

Each is a small, isolated change behind an existing interface. Gate the new impl
on an env var so **local dev keeps the disk/in-memory/console behaviour**.

### 2.1 File storage → S3  ⚠️ **required — not in the old doc**

Lambda has no persistent disk (only ephemeral `/tmp`), so the local-disk uploader
**will not work** in AWS. Swap it to S3.

- ☐ Add an S3 implementation alongside `src/common/storage/fileStorage.ts`
  (`@aws-sdk/client-s3`): `save` → `PutObject`, `remove` → `DeleteObject`, and
  replace `resolvePath`/`createStream` (used by the document **download**
  controller) with either an S3 `GetObject` stream **or** a short-lived
  **presigned URL** returned to the client. The module's interface
  (`save` / `remove` / stream) is deliberately tiny — callers and the
  `patient_documents` schema don't change.
- ☐ Select impl by env: use S3 when `STORAGE_DRIVER=s3` (+ `S3_BUCKET`), else the
  current local disk. Keep `UPLOAD_DIR` for local.
- ☐ Files to touch: `src/common/storage/fileStorage.ts` (new S3 branch),
  `src/modules/records/controller.ts` (`downloadDocument` streaming), `env.ts`.

### 2.2 OTP store → DynamoDB

- ☐ Add a `DynamoOtpStore implements OtpStore` next to
  `src/modules/auth/otpStore.ts` (currently `InMemoryOtpStore` — fine for a
  single local process, **lost across Lambda cold starts / instances**). Use the
  DynamoDB table from Phase 1 with per-item TTL.
- ☐ Select by env (`OTP_STORE=dynamodb` + `OTP_TABLE`), else in-memory.
  See `AWS_MIGRATION.md` §4.1.

### 2.3 Email → SES

- ☐ Add an SES provider implementing the existing `EmailProvider` interface in
  `src/common/email/` (`@aws-sdk/client-ses` or SES SMTP creds via the existing
  Nodemailer transport). Select by env; keep MailHog locally. §4.3.

### 2.4 Secrets → Secrets Manager / SSM

- ☐ At cold start, load secrets into `process.env` before `src/config/env.ts`
  validates them (a small bootstrap in `lambda.ts`), **or** inject them as Lambda
  env vars from Secrets Manager via your IaC. Nothing hardcoded. §4.4.

### 2.5 Cookies & CORS across domains

- ☐ Auth cookies are `httpOnly`. For `app.tootica.com` → `api.tootica.com` set
  cookies with `Domain=.tootica.com; SameSite=None; Secure`. Update `CORS_ORIGIN`
  to the app's HTTPS origin and keep `credentials: true`. If you instead keep the
  **same-origin proxy** (frontend rewrites `/api/*`), cookies stay first-party and
  this is simpler. §4.5.

### 2.6 Bundle the Prisma client for Lambda

- ☐ Ensure the generated Prisma client + its query engine are included in the
  deploy artifact (the client is gitignored and generated). Run
  `npm run db:generate` in the build, and make sure the engine binary targets the
  Lambda runtime (`binaryTargets` / the driver-adapter native deps). Bundle via
  your IaC's esbuild/Docker packaging. §4.6.

---

## Phase 3 — Database migration

The migration history is a **single squashed baseline** (`prisma/migrations/
20261006000000_init`). Applying it to a fresh RDS is one command.

- ☐ From a machine that can reach RDS (or a bastion / the RDS Proxy), with
  `DATABASE_URL` pointing at the new DB:
  ```bash
  cd backend
  npm ci
  npm run db:generate
  npm run db:migrate:deploy      # applies the single init baseline
  ```
- ☐ Seed the first environment. For a demo/staging dataset use the documented
  provisioner (**wipes** — never run against prod with real data):
  ```bash
  npm run db:provision           # 1 super admin + 2 clinics × 2 branches + staff
  npm run db:seed:appointments   # sample patients + appointments
  ```
  For **production**, skip the seeds and onboard the real super admin via a
  one-off script / `db:provision` variant, then create clinics through the app.
- ☐ Confirm: `npx prisma migrate status` → "Database schema is up to date!".

---

## Phase 4 — Deploy the backend (Lambda + API Gateway)

- ☐ Build: `npm run build` (emits `dist/`, handler `dist/lambda.handler`).
- ☐ Package with your IaC (CDK/SST/Serverless): Lambda in the **VPC private
  subnets**, env vars/secrets wired, IAM role from Phase 1, behind an **HTTP API
  (API Gateway v2)**.
- ☐ Set Lambda env: `NODE_ENV=production`, `DATABASE_URL` (RDS Proxy),
  `STORAGE_DRIVER=s3` + `S3_BUCKET`, `OTP_STORE=dynamodb` + `OTP_TABLE`,
  `CORS_ORIGIN`, the JWT secrets, `SUPER_ADMIN_DELETE_CODE`, SES/SMS vars — see
  the full table in `AWS_MIGRATION.md` §5 plus the new `STORAGE_DRIVER`/`S3_BUCKET`
  and `OTP_STORE`/`OTP_TABLE`.
- ☐ Smoke the function URL / API stage: `GET /health` → `{ status: "ok" }`.
- ☐ Tune cold starts: provisioned concurrency if needed; keep the function warm
  if the UX demands it. §4.7.

---

## Phase 5 — Frontend hosting

The frontend is a **Next.js** app that proxies `/api/*` to `BACKEND_ORIGIN`.

- ☐ Host it. Easiest: **AWS Amplify Hosting** (native Next.js SSR support) or
  **SST/OpenNext**. Point its `/api/*` rewrite (`next.config.ts` → `BACKEND_ORIGIN`)
  at the API Gateway URL (or `api.tootica.com`). Keeping the rewrite preserves the
  **same-origin** cookie model (simplest — see 2.5).
- ☐ Set `BACKEND_ORIGIN` to the deployed API origin.
- ☐ If you prefer S3 + CloudFront for a static export, note the app uses dynamic
  routes and server behaviour — Amplify/OpenNext is the lower-friction path.

---

## Phase 6 — Cutover

- ☐ Point DNS (Route 53): `api.tootica.com` → API Gateway, `app.tootica.com` →
  the frontend host. **ACM** certs in the right region (API Gateway custom domain;
  CloudFront certs in `us-east-1`).
- ☐ Verify end-to-end against the deployed stack (Phase 7).
- ☐ Flip traffic. Keep the old environment until the new one is proven.

---

## Phase 7 — Verify (end-to-end smoke test)

Run against the deployed API (mirrors the local checks used during development):

- ☐ `GET /api/health` → 200.
- ☐ `POST /api/auth/login` `{ identifier, password }` → 200, sets cookies.
- ☐ `GET /api/patients` with the session cookie → 200 (not 500 — catches Prisma
  client / DB wiring issues).
- ☐ Password reset: `POST /api/auth/forgot-password` → OTP arrives via **SES**.
- ☐ **Records + S3:** open a patient's Records, upload a document → it lands in
  the **S3 bucket**; **Download** streams it back; delete removes the S3 object.
- ☐ Create an appointment, add a payment → Revenue reflects it.
- ☐ Check **CloudWatch Logs** for errors; confirm DynamoDB OTP items get a TTL.

---

## Rollback

- ☐ DNS back to the previous environment (lowest-risk cutover is DNS-weighted).
- ☐ RDS: restore from an automated snapshot if the DB was changed.
- ☐ Keep the pre-migration environment running until the new stack has soaked.

---

## Quick reference — new env vars introduced here

| Variable          | Example                     | Used by                          |
| ----------------- | --------------------------- | -------------------------------- |
| `STORAGE_DRIVER`  | `s3`                        | file storage (2.1); `local` dev  |
| `S3_BUCKET`       | `tootica-uploads-prod`      | S3 uploader                      |
| `OTP_STORE`       | `dynamodb`                  | OTP store (2.2); `memory` dev    |
| `OTP_TABLE`       | `tootica-otp-prod`          | DynamoDB OTP store               |

All other variables (JWT secrets, `DATABASE_URL`, SMTP/SES, TTLs,
`SUPER_ADMIN_DELETE_CODE`, `CORS_ORIGIN`) are already documented in the backend
`README.md` and mapped for AWS in `AWS_MIGRATION.md` §5.

---

## Ordered summary

1. Lock decisions (Phase 0).
2. Provision VPC, RDS + Proxy, S3, DynamoDB, SES, Secrets Manager, IAM (Phase 1).
3. Swap the four seams behind env flags: **S3 storage**, DynamoDB OTP, SES email,
   Secrets Manager; handle cross-domain cookies; bundle Prisma (Phase 2).
4. `migrate deploy` the single baseline to RDS + seed/provision (Phase 3).
5. Deploy the Lambda behind API Gateway (Phase 4).
6. Host the Next.js frontend; point its `/api/*` proxy at the API (Phase 5).
7. DNS cutover (Phase 6), verify end-to-end (Phase 7), keep rollback ready.
