# Deploy Tootica to Railway / Render (one-clinic production)

The low-cost, low-ops path for going live with a **single clinic** — no AWS, no
code changes. You run the app exactly as it is locally (`server.ts` +
Postgres), just with production config and a real email + SMS provider.

> **Why this works with zero code changes:** the app already has a long-running
> entry point (`src/server.ts` → `app.listen(PORT)`), email is plain SMTP
> (Nodemailer), and phone OTP auto-selects Twilio the moment its env vars are
> set. You are only setting environment variables and attaching a database +
> a disk. Keep [`AWS_MIGRATION_GUIDE.md`](./AWS_MIGRATION_GUIDE.md) for later —
> nothing here blocks that move.

**Two platform traps to handle (both Railway and Render):**

1. **The filesystem is ephemeral** — it's wiped on every deploy/restart. Patient
   document uploads written to local disk would **vanish**. → Attach a
   **persistent volume** (see §5) or use object storage.
2. **In-memory OTP store** — fine on **one instance**; lost if you run more than
   one or on restart. → Keep the backend at **1 instance** for now (see §6).

---

## 0. What you're deploying

Two services from one repo:

| Service | Folder | Build | Start | Port |
| --- | --- | --- | --- | --- |
| **backend** | `backend/` | `npm ci && npm run build` | `npm run start` | `$PORT` (auto) |
| **frontend** | `frontend/` | `npm ci && npm run build` | `npm run start` | `$PORT` (auto) |

Plus one **managed PostgreSQL 16** database (the platform provides `DATABASE_URL`).

`server.ts` binds to `env.port` which reads `PORT` — Railway and Render both
inject `PORT` automatically, so this just works. `postinstall` runs
`prisma generate`, so the gitignored Prisma client is built during `npm ci`.

---

## 1. Prerequisites

- The repo pushed to GitHub (both platforms deploy from a GitHub repo).
- A **domain** you control (for TLS + first-party cookies). Both platforms give
  free HTTPS on their own subdomains too, which is enough to start.
- Accounts: Railway **or** Render, plus an **email provider** (§7) and, if you
  want SMS login OTP, **Twilio or an India SMS provider** (§8).

---

## 2. Track A — Railway

Railway is the fastest to wire a multi-service repo + managed Postgres + a volume.

1. **New Project → Deploy from GitHub repo.** Railway detects the monorepo; you
   add services manually below.
2. **Add Postgres:** *New → Database → PostgreSQL.* Railway exposes a
   `DATABASE_URL` variable you can reference from the backend service.
3. **Backend service:** *New → GitHub Repo → set Root Directory = `backend`.*
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm run db:migrate:deploy && npm run start`
     (runs the squashed migration baseline, then boots — safe to repeat; it's a
     no-op once applied).
   - **Variables:** set everything in §4. For the DB, reference the Postgres
     plugin: `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
4. **Persistent uploads (trap #1):** on the backend service, *add a Volume*,
   mount path `/data`, then set `UPLOAD_DIR=/data/uploads`. Now documents
   survive deploys.
5. **Keep it single-instance (trap #2):** leave replicas at 1 (default). Don't
   enable horizontal scaling while the OTP store is in-memory.
6. **Frontend service:** *New → GitHub Repo → Root Directory = `frontend`.*
   - **Build:** `npm ci && npm run build` · **Start:** `npm run start`
   - **Variable:** `BACKEND_ORIGIN` = the backend service's URL
     (Railway internal URL like `http://backend.railway.internal:PORT`, or the
     public backend domain). The Next.js `/api/*` rewrite proxies to it, keeping
     cookies **first-party** (simplest).
7. **Domains:** attach your custom domain to the **frontend** service (e.g.
   `app.tootica.com`). The backend can stay on its internal/Railway URL since the
   frontend proxies to it.

---

## 3. Track B — Render

Render's model is explicit Web Services + a managed Postgres + Persistent Disks.

1. **New → PostgreSQL.** Pick a region close to the clinic; note the **Internal
   Database URL** (used by services in the same region). Render Postgres
   **requires SSL** — append `?sslmode=require` to `DATABASE_URL` (see §4 note).
2. **Backend: New → Web Service**, connect the repo, **Root Directory =
   `backend`.**
   - **Build Command:** `npm ci && npm run build`
   - **Pre-Deploy Command:** `npm run db:migrate:deploy`  *(Render runs this once
     per deploy, before traffic shifts — the correct place for migrations.)*
   - **Start Command:** `npm run start`
   - **Instance count:** 1 (trap #2).
3. **Persistent uploads (trap #1):** add a **Disk** to the backend service, e.g.
   mount path `/data`, then set `UPLOAD_DIR=/data/uploads`. *(A Disk pins the
   service to one instance — which is what you want here anyway.)*
4. **Frontend: New → Web Service**, **Root Directory = `frontend`.**
   - **Build:** `npm ci && npm run build` · **Start:** `npm run start`
   - **Env:** `BACKEND_ORIGIN` = the backend service's URL (Render internal URL
     `http://tootica-backend:PORT` or its public `.onrender.com` host).
5. **Domains:** add your custom domain to the **frontend** service.

---

## 4. Environment variables (backend)

Set these on the **backend** service. Everything with a default can be omitted;
the **must-set-in-prod** ones are marked.

```bash
NODE_ENV=production                      # ← MUST: enables Secure cookies
# PORT is injected by the platform — do NOT set it yourself.

DATABASE_URL=postgresql://...            # ← MUST: from the managed Postgres
# Render external/managed PG needs SSL → append ?sslmode=require
# e.g. postgresql://user:pass@host:5432/db?sslmode=require

CORS_ORIGIN=https://app.tootica.com      # your frontend origin

# JWT secrets — generate 3 distinct strong values:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_ACCESS_SECRET=...                     # ← MUST
JWT_REFRESH_SECRET=...                    # ← MUST
JWT_ACTION_SECRET=...                     # ← MUST

SUPER_ADMIN_DELETE_CODE=<pick-a-secret>   # ← MUST (default 246810 is public)

UPLOAD_DIR=/data/uploads                  # ← MUST: the mounted persistent volume

# Email (see §7) — a real SMTP provider:
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587                             # use 587 (STARTTLS) — see §7 note
SMTP_USER=...
SMTP_PASSWORD=...
MAIL_FROM=Tootica <no-reply@tootica.com>  # must be a verified sender/domain

# Phone/SMS login OTP (see §8) — set all three to go live, leave blank to log:
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1...                          # E.164; India needs DLT (see §8)

# Optional — tune if you like; sensible defaults exist for all:
# ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, OTP_TTL_SECONDS, etc.
```

Frontend service needs just: `BACKEND_ORIGIN=<backend URL>`.

---

## 5. Persistent uploads (do not skip)

Patient documents are written to `UPLOAD_DIR` on local disk. On Railway/Render
the container filesystem is **wiped on every deploy** — without a persistent
volume, every uploaded document is lost on the next deploy.

- **Railway:** add a **Volume**, mount `/data`, set `UPLOAD_DIR=/data/uploads`.
- **Render:** add a **Disk**, mount `/data`, set `UPLOAD_DIR=/data/uploads`.
- **Alternative (object storage):** set `STORAGE_DRIVER=s3` + `S3_BUCKET` and
  point at an S3-compatible bucket — **Cloudflare R2** is a cheap, zero-egress
  choice and speaks the S3 API. This uses the same storage seam described in
  `AWS_MIGRATION_GUIDE.md` §1.1. For one clinic, a persistent volume is simpler.

**Back up the volume** (and the DB) regularly — see §9.

---

## 6. OTP store on a single instance

The password-reset and login OTPs live in an **in-memory Map** (`otpStore.ts`).
On one always-on instance this is correct and fast. Caveats:

- **Keep the backend at 1 instance.** With 2+ instances, an OTP set on one won't
  verify on another.
- **On redeploy/restart, in-flight OTPs are dropped.** Impact is tiny: the code
  has a ~10-minute TTL anyway, so a user just taps "resend". Deploy at quiet
  hours if you want to avoid even that.
- **When you later scale out,** swap in a Redis-backed `OtpStore` (both platforms
  offer a Redis add-on) — it's a drop-in behind the existing interface, same
  pattern as the DynamoDB impl in `AWS_MIGRATION_GUIDE.md` §1.2. No service code
  changes.

---

## 7. Email — how to handle it

Locally, all mail is caught by **MailHog**. In production you point the **same
Nodemailer transport** at a real SMTP provider — **no code change**, just the
`SMTP_*` + `MAIL_FROM` vars from §4.

**What sends email today:**
- **New-account temporary password** (`accountEmails.ts`) — when a super
  admin/clinic admin creates a user.
- **Password-reset OTP** (`auth/service.ts` forgot-password) — a 6-digit code.

**Pick a provider** (any SMTP works — free tiers are plenty for one clinic):

| Provider | Free tier | Notes |
| --- | --- | --- |
| **Brevo** (Sendinblue) | ~300/day | India-friendly, simple SMTP |
| **Resend** | ~3k/mo | Clean DX; SMTP + API |
| **SendGrid** | ~100/day | Established |
| **Mailgun / Postmark** | trial | Postmark has great deliverability |
| **AWS SES (SMTP mode)** | pay-as-go | Cheapest at volume; SMTP creds work here too |

**Setup steps (same for any):**
1. Create the account; add and **verify your sending domain** — add the
   **SPF + DKIM** DNS records they give you. Unverified senders land in spam.
2. Generate **SMTP credentials** (host, port, username, password).
3. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`
   (must be an address on the verified domain).
4. Redeploy. Trigger a password reset and confirm the email arrives.

> **Port note:** the Nodemailer transport is created with `secure: false`, which
> is the **STARTTLS** mode — use **port 587**. Port 465 (implicit TLS) would need
> `secure: true` (a one-line code change). Every provider above supports 587, so
> just use 587 and you need no code change.

---

## 8. Phone / SMS login OTP — how to handle it

The login OTP is sent over SMS via `smsProvider.ts`, which **auto-selects a
provider** in this order (first one whose vars are fully set wins):

1. **MSG91** — if `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID` are set (India path).
2. **Twilio** — if `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` are set.
3. **Console** — otherwise, logs the code to the server logs.

So:

- **Staging / before DLT is ready:** leave all SMS vars **blank**. The OTP is
  printed to the backend logs (`[sms:console] to=... body=...`) — read it in the
  Railway/Render log viewer to complete a login. Fully testable, no SMS spend.
- **Production:** set the MSG91 vars → real texts, **no code change**.

### MSG91 setup (recommended for India)

MSG91 is already implemented (`Msg91SmsProvider`). It uses the **Flow API v5**,
which under DLT sends a **template id + variables**, not free-form text — the app
passes the `otp` and `exp` (expiry minutes) variables for you.

1. Create an MSG91 account; get your **Auth Key**.
2. Complete **DLT registration** (below) and create a **Flow/template** whose two
   variables are named **`otp`** and **`exp`**, e.g. *"Your Tootica login code is
   `##otp##`. It expires in `##exp##` minutes. Do not share it with anyone.
   -TOOTICA"*. Note the **Template ID**.
3. Set env: `MSG91_AUTH_KEY=...`, `MSG91_TEMPLATE_ID=...`. Redeploy.
4. Store staff/patient phones in **E.164** (`+91…`) — the adapter strips the
   `+`/spaces before sending.

> **Variable names matter:** your MSG91 template's variables **must** be named
> `otp` and `exp`, or they won't populate. (To use other names, edit the
> `recipients` keys in `Msg91SmsProvider.send`.)

### ⚠️ India DLT registration (required, few days)

India's TRAI requires **DLT registration** for all transactional SMS to +91
numbers — **no gateway can deliver without it**:

1. Register your **entity** + a **Sender/Header ID** on a DLT portal
   (Jio/Airtel/Vodafone TrueConnect). MSG91 assists with this.
2. Register the **OTP message template** — the sent text must match it exactly,
   which is why the app sends template variables rather than free-form.
3. Link it in MSG91.

Until DLT is approved, keep the SMS vars blank and use the **console logger** to
exercise the full login flow.

**Other providers:** `Twilio` is also built in (set the 3 `TWILIO_*` vars) — zero
code, but pricier to India; numbers must be E.164. For **Fast2SMS / Gupshup /
Kaleyra**, add a class implementing `SmsProvider` and select it in
`createSmsProvider()` — the same one-file pattern as `Msg91SmsProvider`. Ask me
and I'll add it.

---

## 9. First super admin + backups

**Seed the first account (production — do NOT run the demo seeds, they wipe
data):**

- `npm run db:provision` creates a full demo dataset **and wipes** — only use it
  on a throwaway/staging DB.
- For real production, onboard just the **super admin** via a trimmed one-off
  script (a `db:provision` variant that creates only the super admin), then
  create clinics/branches/staff through the app UI. (Ask me to add this script.)

**Backups:**
- **Database:** enable the platform's managed Postgres backups (Railway and
  Render both offer automated daily backups on paid plans). For extra safety,
  a nightly `pg_dump` to object storage.
- **Uploads volume:** snapshot the Disk/Volume, or if you used R2/S3, enable
  bucket versioning.

---

## 10. Verify (end-to-end smoke test)

Against the deployed frontend URL:

- [ ] Frontend loads over **HTTPS**; `GET /api/health` (proxied) → `200`.
- [ ] **Login** with the super admin → cookies set, dashboard loads.
- [ ] **Create a staff user** → the **temporary-password email** arrives (§7).
- [ ] **Forgot password** → the **reset OTP email** arrives.
- [ ] **Login OTP:** phone code arrives via SMS (or appears in logs if Twilio is
      blank). Completes login.
- [ ] **Upload a patient document**, then **redeploy**, then **download it** →
      still there (proves the persistent volume, trap #1).
- [ ] Create an appointment + payment → dashboard Revenue updates.

---

## Cost (one clinic, INR/mo)

| Platform | Backend | Postgres | Disk/Volume | ~ Total |
| --- | --- | --- | --- | --- |
| **Railway** | usage-based (~$5 credit) | ~$5–10 | small | **~₹1,500–2,500** |
| **Render** | Starter ~$7 | ~$7 | ~$1–3 | **~₹1,500–3,000** |

Plus email (free tier) and SMS (pay-per-message; India ~₹0.15–0.50/SMS via a
domestic gateway, more via Twilio). An order of magnitude under the AWS stack —
move to [`AWS_MIGRATION_GUIDE.md`](./AWS_MIGRATION_GUIDE.md) only when a real
trigger (multiple clinics, HA/SLA, compliance) appears.

---

## Summary

1. Push repo → create backend + frontend web services + managed Postgres.
2. Backend: build `npm ci && npm run build`, migrate on deploy
   (`db:migrate:deploy`), start `npm run start`, **1 instance**.
3. Attach a **persistent volume** at `UPLOAD_DIR` (trap #1).
4. Set env vars (§4): `NODE_ENV=production`, `DATABASE_URL`, JWT secrets,
   `SUPER_ADMIN_DELETE_CODE`, `CORS_ORIGIN`.
5. **Email:** point `SMTP_*`/`MAIL_FROM` at Brevo/Resend/SES — verify domain
   (SPF/DKIM), use port **587**. No code change.
6. **Phone OTP:** set the 3 `TWILIO_*` vars (blank = log to console). For **India,
   complete DLT registration** or use MSG91/Fast2SMS (small code add).
7. Frontend: set `BACKEND_ORIGIN`, attach your domain.
8. Seed the real super admin (not the demo seeds); enable DB + volume backups.
9. Run the §10 smoke test.
</content>
