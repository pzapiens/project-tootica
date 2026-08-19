# Architecture & AWS Migration Guide

How the Tootica backend is built today, why it is portable, and the concrete
steps to run it on **AWS API Gateway + Lambda** without rewriting the app.

- Audience: whoever does the AWS migration.
- TL;DR: the app already exposes a serverless entry point (`src/lambda.ts`) that
  wraps the *same* Express app used locally. The work is mostly swapping a few
  interface implementations (OTP store, email) and getting the surrounding AWS
  plumbing right (connections, secrets, cookies/CORS).

---

## 1. Current architecture (local / container)

```
                    ┌─────────────────────────────────────────────┐
   Browser / SPA    │                Express app                  │
  (credentials:     │  helmet → cors → json → cookieParser →      │
   'include')       │  morgan → routes → notFound → errorHandler  │
        │           │                                             │
        ▼           │   /api/auth/*         (public + cookie)     │
   http://:4000 ───▶│   /api/patients       authenticate+tenant   │
                    │   /api/doctors        authenticate+tenant   │
                    │   /api/appointments   authenticate+tenant   │
                    │   /api/analytics      authenticate+tenant   │
                    │   /api/super-admin    authenticate+superadm │
                    └───────────────┬───────────────┬─────────────┘
                                    │               │
                          Prisma 7 (pg adapter)     │ EmailProvider
                                    │               │ (Nodemailer)
                                    ▼               ▼
                          PostgreSQL 16        MailHog (SMTP :1025 / UI :8025)
                          (Docker :5432)

   In-memory OtpStore lives inside the process (Map).  ⚠ not shared across nodes
```

### Stack

| Concern         | Choice                                             |
| --------------- | -------------------------------------------------- |
| Runtime         | Node.js ≥ 20, TypeScript (CommonJS output)         |
| HTTP            | Express 4                                          |
| Validation      | Zod                                                |
| ORM             | Prisma 7 (PostgreSQL) via `@prisma/adapter-pg`     |
| AuthN/Z         | JWT in httpOnly cookies, bcrypt password hashing   |
| Email           | Nodemailer → MailHog locally                       |
| Local infra     | Docker Compose (Postgres + MailHog)                |

### Hexagonal layout

One folder per feature module; each owns its slice end-to-end. Shared concerns
live under `common/`. This is what makes the app transport-agnostic — nothing in
a module knows whether it's behind `app.listen()` or a Lambda handler.

```
src/
├── config/env.ts        # centralized, validated env loader (single source)
├── common/
│   ├── db/prisma.ts      # Prisma client singleton (pg driver adapter)
│   ├── email/            # EmailProvider interface + Nodemailer impl   ← swap point
│   ├── middleware/       # authenticate, requireTenant, errorHandler, asyncHandler
│   ├── types/            # Express Request augmentation (req.user, req.clinicId)
│   └── utils/            # httpError, password (bcrypt)
├── modules/
│   ├── auth/             # login/refresh/OTP/invite, jwt.util, otpStore   ← swap point
│   ├── patients/  doctors/  appointments/  analytics/  super-admin/
├── generated/prisma/     # generated client (gitignored)
├── app.ts                # buildApp(): middleware + route wiring (transport-agnostic)
├── server.ts             # local/container entry — app.listen()
└── lambda.ts             # serverless entry — serverless-http(createApp())
```

### Request lifecycle

```
request → helmet → cors → json/urlencoded → cookieParser → morgan
        → [route guard: authenticate → requireTenant | requireSuperAdmin]
        → module router → controller (Zod parse) → service (business rules)
        → repository (Prisma, clinic-scoped) → PostgreSQL
        → errors bubble to errorHandler (HttpError / ZodError → status codes)
```

### Auth & multi-tenancy

- **Cookies, not bearer tokens.** Login sets httpOnly `access_token` +
  `refresh_token`. `authenticate` verifies the access cookie → `req.user`.
- **Tenant isolation.** `requireTenant` sets `req.clinicId` from `req.user`;
  every tenant repository query is scoped by `clinicId`. Super-admin routes skip
  tenancy and use `requireSuperAdmin`.
- **Stateless tokens.** No server-side session store — verification is pure
  crypto, which is ideal for horizontally-scaled / serverless runtimes.

### The stateful pieces (migration-sensitive)

| Piece                | Today                | Problem on multi-node / Lambda                  |
| -------------------- | -------------------- | ----------------------------------------------- |
| `OtpStore`           | in-process `Map`     | Not shared across containers → verify fails      |
| DB connection pool   | pg pool per process  | Lambda concurrency exhausts Postgres connections |
| Email transport      | SMTP → MailHog       | Not available in AWS; needs SES                  |
| Secrets              | `.env` file          | Must move to Secrets Manager / SSM               |

Everything else is stateless.

---

## 2. Why it's already portable

1. **Split entry points.** `app.ts` builds the app; `server.ts` and `lambda.ts`
   are thin adapters. `lambda.ts` is literally:

   ```ts
   export const handler = serverless(createApp()); // deploy as dist/lambda.handler
   ```

2. **Interfaces at the volatile boundaries.** `EmailProvider` and `OtpStore` are
   interfaces — AWS implementations drop in without touching services.

3. **Config through `process.env`.** `env.ts` is the only place that reads env,
   so Lambda env vars / SSM / Secrets Manager map straight in.

4. **Stateless JWT auth.** No sticky sessions required.

5. **Prisma 7 query compiler** — no native Rust engine binary to bundle; smaller
   artifacts and faster cold starts.

---

## 3. Target AWS architecture

```
        Route 53
           │
           ▼
     CloudFront (optional, for SPA + caching)
           │
     ┌─────┴───────────────┐
     ▼                     ▼
  S3 (SPA static)   API Gateway (HTTP API v2)
                          │  custom domain: api.tootica.com
                          │  (cookies need same registrable domain as the SPA)
                          ▼
                    Lambda  (dist/lambda.handler, Node 20)
                    │   serverless-http → Express (createApp)
                    │   env from Lambda config; secrets from Secrets Manager
        ┌───────────┼───────────────┬───────────────┐
        ▼           ▼               ▼               ▼
   RDS Proxy    ElastiCache      Amazon SES     CloudWatch
      │         (Redis) OR                       Logs/Metrics
      ▼          DynamoDB
  RDS Postgres   (OtpStore + optional
  (Multi-AZ)      refresh-token denylist)

   VPC: Lambda + RDS Proxy + ElastiCache in private subnets;
        SES/Secrets Manager via VPC endpoints or NAT.
```

### Component mapping

| Local (today)            | AWS (target)                                    |
| ------------------------ | ----------------------------------------------- |
| `server.ts` / `app.listen` | `lambda.ts` handler behind **API Gateway HTTP API** |
| Docker Postgres          | **RDS for PostgreSQL** (Multi-AZ) via **RDS Proxy** |
| In-memory `OtpStore`     | **DynamoDB** (TTL) or **ElastiCache Redis**     |
| Nodemailer → MailHog     | **Amazon SES** `EmailProvider`                  |
| `.env` secrets           | **Secrets Manager** / **SSM Parameter Store**   |
| Console logs             | **CloudWatch Logs** (+ Powertools, optional)    |
| `docker compose`         | **SAM / CDK / Serverless Framework** IaC        |

> Prefer API Gateway **HTTP API (v2)** over REST API (v1): cheaper, lower
> latency, native JWT authorizers if you later move auth to the edge.
> `serverless-http` supports both payload formats.

### Lambda granularity — one API function (decision)

**Decision:** the entire Express app deploys as a **single Lambda**
(`dist/lambda.handler`) behind one API Gateway HTTP API — not per-module and not
per-endpoint functions.

**Why:**
- Reuses the app verbatim; migration stays an infra exercise, not a rewrite.
- Cross-cutting middleware (`authenticate`, `requireTenant`, error handling)
  runs in-process — no shared authorizer/layer needed on day one.
- One warm container serves every route → fewer cold starts under steady
  traffic; one deploy unit; one (initially broad) IAM role.
- Trade-off accepted: coarser scaling and a union-of-all IAM permissions. Revisit
  when that actually hurts.

**Evolve only when a concrete driver appears** — independent scaling, per-function
least-privilege IAM, blast-radius isolation, or a workload with different runtime
characteristics. The hexagonal layout keeps that split cheap:

- Parameterize the app factory (e.g. `createApp({ modules: ['auth'] })`) and emit
  thin handlers (`lambda/api.ts`, `lambda/auth.ts`, …) that each mount a subset of
  routers. Route to them in API Gateway by path prefix (`/api/auth/*` → the auth
  function). Shared middleware moves into a small internal package/layer or an
  APIG Lambda authorizer.

**Likely first split is async workers, not API modules.** Push side-effecting or
slow work off the request path into their own event-driven functions, leaving the
synchronous API a simple, warm monolith:

- **Email delivery (SES)** — enqueue on `forgot-password`/invites (SQS), send in a
  worker Lambda.
- **Scheduled analytics / report generation** — EventBridge schedule.
- **OTP cleanup** — moot once OTPs live in DynamoDB with TTL.

```
APIG (HTTP API) ─▶ Lambda: api.handler  (Express, all /api/* routes)   ← now

# later, if/when needed:
SQS ────────────▶ Lambda: emailWorker (SES)
EventBridge ────▶ Lambda: analyticsReport
/api/auth/* ────▶ Lambda: auth        (peeled off a module)
```

---

## 4. What needs to change (by area)

### 4.1 OTP store → DynamoDB (recommended) or Redis
`OtpStore` is already an interface (`src/modules/auth/otpStore.ts`). Add a
`DynamoOtpStore` implementing `get/set/delete` against a table keyed by email,
with a DynamoDB **TTL attribute** so codes auto-expire. Select the impl in
`env.ts` (e.g. `OTP_STORE_DRIVER=memory|dynamo`). No service changes.

### 4.2 Database connections → RDS Proxy
Lambda × pg pool = connection storms. Put **RDS Proxy** in front and point
`DATABASE_URL` at the proxy endpoint. Keep the pg pool small per container
(`?connection_limit=1` style) since Lambda handles concurrency by scaling
containers, not by pooling within one.

### 4.3 Email → SES
Add an `SesEmailProvider implements EmailProvider` (AWS SDK v3 `@aws-sdk/client-ses`)
and select it by env. Verify the domain/sender in SES and move out of the
sandbox for real recipients.

### 4.4 Secrets → Secrets Manager / SSM
Keep `env.ts` as the single reader. Either (a) inject secrets as Lambda env vars
at deploy from Secrets Manager, or (b) fetch at cold start. JWT secrets,
`DATABASE_URL`, and SES creds all move here. Nothing hardcoded.

### 4.5 Cookies & CORS across domains
- Put the API on the **same registrable domain** as the SPA (e.g. SPA on
  `app.tootica.com`, API on `api.tootica.com`). Then `SameSite=Lax` cookies keep
  working. If they must be cross-site, switch to `SameSite=None; Secure` and set
  the cookie `domain`. This is a one-spot change in `authCookieOptions` (`env.ts`).
- `Secure` is already on in production — API Gateway is HTTPS, so cookies work
  (unlike plain-HTTP localhost).
- Decide **one** owner for CORS: either API Gateway CORS *or* the Express `cors`
  middleware — not both, to avoid duplicated headers. Keep `credentials: true`.

### 4.6 Bundling & the Prisma client
- Bundle with **esbuild** (`--platform=node --target=node20 --bundle`).
- The generated Prisma client is **gitignored** — CI must run `prisma generate`
  (the `postinstall` script) before bundling so it ships in the artifact.
- Prisma 7's query compiler means no Rust engine binary to package.

### 4.7 Cold starts & networking
- VPC-attached Lambdas (needed to reach RDS Proxy/ElastiCache) add cold-start
  latency; use provisioned concurrency for hot paths if needed.
- Reuse the Prisma client across invocations via the module-level singleton
  (already implemented in `common/db/prisma.ts`).

### 4.8 Observability
CloudWatch Logs by default. Optionally add **AWS Lambda Powertools** (structured
logging, tracing, metrics) — wire it in `lambda.ts`, leaving `app.ts` untouched.

### 4.9 (Optional) Refresh-token revocation
Refresh tokens are currently stateless (non-revocable). Once Redis/DynamoDB
exists for OTPs, the same store can hold a refresh-token **denylist** (keyed by
the token `jti` we already sign) to support "log out everywhere."

---

## 5. Environment variable mapping

`env.ts` is the contract. Same names, new sources:

| Variable                 | Local source | AWS source                          |
| ------------------------ | ------------ | ----------------------------------- |
| `DATABASE_URL`           | `.env`       | Secrets Manager → RDS **Proxy** endpoint |
| `JWT_ACCESS_SECRET` etc. | `.env`       | Secrets Manager                     |
| `SMTP_*` / `MAIL_FROM`   | `.env`       | replaced by SES config / `MAIL_FROM` kept |
| `CORS_ORIGIN`            | `.env`       | Lambda env var (SPA origin)         |
| `NODE_ENV`               | `.env`       | `production`                        |
| `OTP_*`                  | `.env`       | Lambda env vars                     |
| *(new)* `OTP_STORE_DRIVER` | —          | `dynamo` (or `redis`)               |
| *(new)* `EMAIL_DRIVER`   | —            | `ses`                               |

---

## 6. Migration phases

**Phase 0 — Prep (no infra):**
- [ ] Add `DynamoOtpStore` + `SesEmailProvider` behind the existing interfaces.
- [ ] Add `OTP_STORE_DRIVER` / `EMAIL_DRIVER` switches in `env.ts`.
- [ ] Add an esbuild bundle script; ensure `prisma generate` runs in CI.
- [ ] Confirm `lambda.ts` handler locally (e.g. SAM local / serverless-offline).

**Phase 1 — Data & secrets:**
- [ ] Provision RDS Postgres (Multi-AZ) + **RDS Proxy**.
- [ ] Run `prisma migrate deploy` against RDS (one-off task/CI job).
- [ ] Move secrets to Secrets Manager; wire into Lambda.
- [ ] Create the DynamoDB OTP table (with TTL) or ElastiCache Redis.
- [ ] Verify SES sender/domain.

**Phase 2 — Compute & edge:**
- [ ] Deploy Lambda (`dist/lambda.handler`) via SAM/CDK/Serverless.
- [ ] Front with API Gateway HTTP API + custom domain (`api.tootica.com`).
- [ ] Set cookie `SameSite`/`domain` and CORS for the real SPA origin.
- [ ] Smoke-test every endpoint (the Postman collection works against any base URL).

**Phase 3 — Cutover:**
- [ ] Point the SPA at the API domain; run in parallel with the old target.
- [ ] Monitor CloudWatch (errors, DB connections, cold starts).
- [ ] Decommission the old runtime once stable.

---

## 7. IaC options

Any of these work; the app doesn't care:

- **AWS SAM** — simplest for "APIG + Lambda + a few resources."
- **AWS CDK** — best if you want typed infra in TypeScript alongside the app.
- **Serverless Framework** — fastest to wire `serverless-http` + HTTP API.

Handler reference in all cases: **`dist/lambda.handler`** (Node 20 runtime).

---

## 8. Risks & watch-items

| Risk                              | Mitigation                                   |
| --------------------------------- | -------------------------------------------- |
| DB connection exhaustion          | RDS Proxy + tiny per-container pool           |
| OTP verify fails across containers | DynamoDB/Redis OtpStore (Phase 0)            |
| Cross-site cookies dropped         | same registrable domain, or `SameSite=None`  |
| Cold-start latency (VPC)          | provisioned concurrency on hot routes         |
| Prisma client missing in bundle   | `prisma generate` in CI before bundling       |
| Duplicate CORS headers            | one CORS owner (APIG *or* Express)            |

---

## 9. Summary

The application layer is migration-ready: one Express app, two entry points, and
interfaces at every place AWS differs (OTP store, email, secrets, DB endpoint).
No business logic changes. The migration is an infrastructure + adapter exercise,
not a rewrite — do Phase 0 in this repo now-ish so the later cutover is purely
operational.
