# Tootica — Provisioned Accounts

A fresh, minimal set of accounts for a clean environment. This is the single
source of truth for the credentials created by the provisioning script — use it
to replicate the exact same accounts on another system.

## Replicate on another system

From the `backend/` directory, with the database running and `DATABASE_URL` set
(see `.env` / `docker-compose.yml`):

```bash
npm install
npm run db:migrate:deploy   # apply the schema
npm run db:provision        # WIPES all data, then creates the accounts below
```

> ⚠️ `db:provision` deletes **all** existing rows (users, clinics, branches,
> doctors, patients, appointments) and recreates only the accounts listed here.
> It refuses to run when `NODE_ENV=production`.

The data lives in [`prisma/provision.ts`](../prisma/provision.ts). Edit that file
to change names/emails/passwords, then keep this document in sync.

## Passwords

| Scope        | Password         |
| ------------ | ---------------- |
| Super Admin  | `SuperAdmin@123` |
| Everyone else | `Password@123`   |

All accounts are created **already onboarded** — a known password, Terms
pre-accepted, and no forced first-login reset — so these credentials work
immediately. (To exercise the forced reset + Terms flow instead, set
`mustResetPassword: true` for a user and clear `termsAcceptedAt`.)

## Structure

- **1 Super Admin** (not tied to a clinic)
- **2 Clinics**, each with **1 Client Admin** and **2 Branches** (4 branches total)
- **Per branch: 1 Doctor + 1 Receptionist** (4 doctors + 4 receptionists total)

> Data-model note: **doctors and receptionists are branch-scoped** — each
> carries a `branchId` (and the doctor profile mirrors it) pinning them to a
> single branch. **Client admins are clinic-wide** (`branchId` null) and can
> access every branch. **Patients are clinic-scoped** (shared across branches).
> Each branch's **receptionist is also its person-in-charge** (`branch.picUserId`).

## Accounts

### Super Admin

| Name                  | Email                    | Role          | Password         |
| --------------------- | ------------------------ | ------------- | ---------------- |
| System Administrator  | `superadmin@tootica.com` | `SUPER_ADMIN` | `SuperAdmin@123` |

### Clinic 1 — Bright Smile Dental (plan: PRO)

| Name           | Email                                  | Role           | Branch (code)              | Password       |
| -------------- | -------------------------------------- | -------------- | -------------------------- | -------------- |
| Sanjay Kapoor  | `admin@brightsmile.com`                | `CLIENT_ADMIN` | — (clinic-wide)            | `Password@123` |
| Olivia Bennett | `olivia.bennett@brightsmile.com`       | `DOCTOR`       | Bright Smile — Downtown (BR-0001) | `Password@123` |
| Riya Sharma    | `reception.downtown@brightsmile.com`   | `RECEPTIONIST` | Bright Smile — Downtown (BR-0001) — **PIC** | `Password@123` |
| Marcus Reed    | `marcus.reed@brightsmile.com`          | `DOCTOR`       | Bright Smile — Uptown (BR-0002)   | `Password@123` |
| Neha Verma     | `reception.uptown@brightsmile.com`     | `RECEPTIONIST` | Bright Smile — Uptown (BR-0002) — **PIC**   | `Password@123` |

### Clinic 2 — Gentle Care Dentistry (plan: BASIC)

| Name           | Email                                 | Role           | Branch (code)               | Password       |
| -------------- | ------------------------------------- | -------------- | --------------------------- | -------------- |
| Maya Iyer      | `admin@gentlecare.com`                | `CLIENT_ADMIN` | — (clinic-wide)             | `Password@123` |
| Sophia Nguyen  | `sophia.nguyen@gentlecare.com`        | `DOCTOR`       | Gentle Care — Central (BR-0003)    | `Password@123` |
| Pooja Menon    | `reception.central@gentlecare.com`    | `RECEPTIONIST` | Gentle Care — Central (BR-0003) — **PIC** | `Password@123` |
| Ethan Okafor   | `ethan.okafor@gentlecare.com`         | `DOCTOR`       | Gentle Care — Riverside (BR-0004)  | `Password@123` |
| Arjun Rao      | `reception.riverside@gentlecare.com`  | `RECEPTIONIST` | Gentle Care — Riverside (BR-0004) — **PIC** | `Password@123` |

## Totals

- 1 super admin
- 2 client admins
- 4 doctors (+ 4 doctor profiles)
- 4 receptionists
- **11 users**, 2 clinics, 4 branches
