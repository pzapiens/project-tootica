# Tootica API Contract

Request/response shapes for every endpoint — **built** (✅) and **planned** (🟡).
Planned endpoints are shape-first: the contract is fixed now, implementation
follows.

- Base URL (local): `http://localhost:4000`
- All application routes are under `/api`.
- Legend: ✅ implemented · 🟡 planned (not yet implemented)

---

## Conventions

### Auth model
Cookie-based. `POST /api/auth/login` sets two **httpOnly** cookies —
`access_token` (short-lived) and `refresh_token`. Send subsequent requests with
credentials (`fetch(..., { credentials: 'include' })`). There is no `Authorization`
header. "Auth: ✅" below means a valid `access_token` cookie is required.

| Guard              | Meaning                                                        |
| ------------------ | ------------------------------------------------------------- |
| public             | No authentication                                             |
| cookie             | Valid session cookie (`authenticate`)                         |
| tenant             | Session **+** a clinic-scoped user (`authenticate + requireTenant`) |
| super-admin        | Session **+** `SUPER_ADMIN` role (`authenticate + requireSuperAdmin`) |

### Content type
Requests and responses are `application/json` (except `204 No Content`).

### Timestamps & ids
- Ids are strings (cuid), e.g. `"cmsy4j5b60001ngo9kg9b0vfw"`.
- Timestamps are ISO-8601 UTC, e.g. `"2026-08-18T03:49:37.788Z"`.
- `dob` is a date-only value serialized as ISO at midnight UTC.

### Error shape
All errors share:

```json
{ "error": "Human-readable message" }
```

Validation (Zod) errors add an `issues` array:

```json
{
  "error": "Validation failed",
  "issues": [
    { "code": "invalid_format", "path": ["email"], "message": "Invalid email address" }
  ]
}
```

| Status | When                                                            |
| ------ | --------------------------------------------------------------- |
| 400    | Validation failed / malformed request                           |
| 401    | Missing/invalid session, or bad credentials                     |
| 403    | Authenticated but not allowed (role, no clinic, inactive)       |
| 404    | Resource not found                                              |
| 429    | Rate limited (OTP cooldown / too many attempts)                 |
| 500    | Unexpected server error                                         |

### Enums

| Enum                | Values                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `Role`              | `SUPER_ADMIN`, `CLIENT_ADMIN`, `DOCTOR`, `RECEPTIONIST`, `GUEST_DOCTOR` |
| `UserStatus`        | `ACTIVE`, `SUSPENDED`                                            |
| `ClinicStatus`      | `ACTIVE`, `SUSPENDED`, `INACTIVE`                               |
| `ClinicPlan`        | `FREE`, `BASIC`, `PRO`, `ENTERPRISE`                            |
| `AppointmentStatus` | `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`   |

### Shared object shapes

**PublicUser** (never includes `passwordHash`):

```json
{
  "id": "cmsy4j5oc0002ngo93xwq2s8v",
  "email": "admin@tootica.local",
  "role": "CLIENT_ADMIN",
  "clinicId": "cmsy4j5b60001ngo9kg9b0vfw",
  "status": "ACTIVE",
  "accessStartDate": null,
  "accessEndDate": null,
  "createdAt": "2026-08-18T03:49:37.788Z",
  "updatedAt": "2026-08-18T03:49:37.788Z"
}
```

**Clinic**

```json
{
  "id": "cmsy4j5b60001ngo9kg9b0vfw",
  "name": "Bright Smile Dental",
  "status": "ACTIVE",
  "plan": "PRO",
  "createdAt": "2026-08-18T03:49:37.700Z"
}
```

**Patient**

```json
{
  "id": "cmsx...",
  "clinicId": "cmsy4j5b60001ngo9kg9b0vfw",
  "name": "James Carter",
  "phone": "+15552000001",
  "email": "james.carter1@example.com",
  "dob": "1985-03-02T00:00:00.000Z",
  "medicalNotes": "No known allergies",
  "createdAt": "2026-08-18T03:49:38.000Z"
}
```

**Doctor** (profile; the linked auth account is a separate `User`)

```json
{
  "id": "cmsx...",
  "userId": "cmsx...",
  "clinicId": "cmsy4j5b60001ngo9kg9b0vfw",
  "specialization": "Orthodontics",
  "licenseNumber": "LIC-1000",
  "phone": "+15551000001",
  "bio": "Dr. Olivia Bennett — Orthodontics.",
  "createdAt": "2026-08-18T03:49:38.000Z"
}
```

**Appointment**

```json
{
  "id": "cmsx...",
  "clinicId": "cmsy4j5b60001ngo9kg9b0vfw",
  "patientId": "cmsx...",
  "doctorId": "cmsx...",
  "startTime": "2026-09-01T09:00:00.000Z",
  "endTime": "2026-09-01T09:30:00.000Z",
  "status": "SCHEDULED",
  "notes": "Routine visit",
  "createdAt": "2026-08-18T03:49:38.000Z",
  "updatedAt": "2026-08-18T03:49:38.000Z"
}
```

---

## Health ✅

### `GET /health` · `GET /api/health` — public
**200**

```json
{ "status": "ok", "service": "tootica-backend", "timestamp": "2026-08-18T10:00:00.000Z" }
```

---

## Auth ✅ — `/api/auth`

### 1. `POST /api/auth/login` — public
Request:

```json
{ "email": "admin@tootica.local", "password": "Password123!" }
```

**200** — sets `access_token` + `refresh_token` cookies:

```json
{ "user": { "...": "PublicUser" } }
```

Errors: `400` validation · `401 { "error": "Invalid credentials" }` ·
`403 { "error": "Account is not active" }` (also "Account access has not started yet" / "…has expired").

### 2. `GET /api/auth/me` — cookie
**200** `{ "user": { "...": "PublicUser" } }` · `401` if no/invalid session.

### 3. `POST /api/auth/refresh` — cookie (refresh)
Reads the `refresh_token` cookie; rotates both cookies.
**200** `{ "user": { "...": "PublicUser" } }` ·
`401 { "error": "Missing refresh token" }` / `"Invalid refresh token"`.

### 4. `POST /api/auth/logout` — public
**204** — clears both cookies. No body.

### 5. `POST /api/auth/forgot-password` — public
Request `{ "email": "admin@tootica.local" }`.
**200** (always, to avoid account enumeration):

```json
{ "message": "If an account exists for that email, a reset code has been sent." }
```

`429 { "error": "Please wait before requesting another code" }` / `"Too many code requests. Try again later"`.

### 6. `POST /api/auth/verify-otp` — public
Request:

```json
{ "email": "admin@tootica.local", "code": "482913" }
```

**200**:

```json
{ "resetToken": "<short-lived JWT>" }
```

Errors: `400 { "error": "Invalid or expired code" }` · `429 { "error": "Too many attempts. Request a new code" }`.

### 7. `POST /api/auth/reset-password` — public
Request (`password` min 8):

```json
{ "token": "<resetToken from verify-otp>", "password": "NewPassw0rd!" }
```

**200** `{ "message": "Password has been reset." }` · `401` invalid/expired token · `400` validation.

### 8. `POST /api/auth/set-password` — public (first-time invite)
Consumes an **invite** token (from staff onboarding) and activates the account.

```json
{ "token": "<invite token>", "password": "NewPassw0rd!" }
```

**200** `{ "message": "Password has been set." }` · `401` invalid/expired token · `400` validation.

### 9. `POST /api/auth/change-password` — cookie
Request:

```json
{ "currentPassword": "Password123!", "newPassword": "NewPassw0rd!" }
```

**200** `{ "message": "Password has been changed." }` ·
`401 { "error": "Current password is incorrect" }` · `400` validation.

---

## Clinic Management ✅ — `/api/super-admin/clinics` (super-admin)

### `GET /api/super-admin/clinics`
**200** `[ Clinic, … ]`

### `POST /api/super-admin/clinics`
Request (`plan`/`status` optional; default `FREE` / `ACTIVE`):

```json
{ "name": "New Clinic", "plan": "BASIC", "status": "ACTIVE" }
```

**201** → `Clinic`.

### `GET /api/super-admin/clinics/:id`
**200** → `Clinic` · `404 { "error": "Clinic not found" }`.

### `PATCH /api/super-admin/clinics/:id`
Request (any subset): `{ "name": "…", "plan": "PRO", "status": "SUSPENDED" }`
**200** → `Clinic` · `404`.

### `DELETE /api/super-admin/clinics/:id`
**204** · `404`.

All: `401` (no session) · `403` (not `SUPER_ADMIN`).

---

## Users / Staff 🟡 — `/api/users/*` (planned)

Staff onboarding. A create call provisions a **passwordless** `User`
(`status: SUSPENDED`) — plus a `Doctor` profile for doctors/guest-doctors — and
emails an **invite** token. The invitee calls `POST /api/auth/set-password`,
which sets the password and flips status to `ACTIVE`.

- Guard: `tenant` (a `CLIENT_ADMIN` manages staff within their own clinic);
  `SUPER_ADMIN` may act on any clinic.
- Relationship to `/api/doctors`: `/api/users/doctors` owns the **account
  lifecycle** (invite / suspend / remove); `/api/doctors` remains the domain
  resource for doctor **profiles/scheduling**. Once this ships, `POST /api/doctors`
  becomes internal/deprecated in favor of `POST /api/users/doctors`.

> **Schema note:** `User`/`Doctor` have no name columns today. `firstName` /
> `lastName` below require a small migration (add to `users`) before implementation.

### Doctors 🟡 — `/api/users/doctors`

`POST` — onboard a doctor. Request:

```json
{
  "email": "dr.jane@brightsmile.test",
  "firstName": "Jane",
  "lastName": "Doe",
  "specialization": "Orthodontics",
  "licenseNumber": "LIC-2001",
  "phone": "+15551230000",
  "bio": "Orthodontist, 10 yrs experience"
}
```

**201**:

```json
{
  "user": { "...": "PublicUser (role DOCTOR, status SUSPENDED)" },
  "doctor": { "...": "Doctor" },
  "invite": { "sent": true, "expiresInDays": 7 }
}
```

Errors: `400` validation · `409 { "error": "Email already in use" }` · `403`.

`GET /api/users/doctors` → **200** `[ { "user": PublicUser, "doctor": Doctor }, … ]`
`GET /api/users/doctors/:id` → **200** `{ "user": PublicUser, "doctor": Doctor }` · `404`
`PATCH /api/users/doctors/:id` → body `{ "specialization?": "…", "licenseNumber?": "…", "phone?": "…", "bio?": "…", "status?": "ACTIVE|SUSPENDED" }` → **200** `{ "user", "doctor" }`
`DELETE /api/users/doctors/:id` → **204** (deactivates the account)
`POST /api/users/doctors/:id/resend-invite` → **202** `{ "message": "Invite re-sent." }`

### Receptionists 🟡 — `/api/users/receptionists`

`POST` — request `{ "email": "…", "firstName": "…", "lastName": "…" }` → **201** `{ "user": PublicUser (role RECEPTIONIST, status SUSPENDED), "invite": { "sent": true, "expiresInDays": 7 } }` (no doctor profile).
`GET` → **200** `[ PublicUser, … ]` · `GET /:id` → **200** `PublicUser`
`PATCH /:id` → `{ "status?": "ACTIVE|SUSPENDED", "firstName?": "…", "lastName?": "…" }` → **200** `PublicUser`
`DELETE /:id` → **204** · `POST /:id/resend-invite` → **202**

### Guest Doctors 🟡 — `/api/users/guest-doctors`

Like doctors, but the **access window is required** (time-boxed access).

`POST` — request:

```json
{
  "email": "guest.sam@brightsmile.test",
  "firstName": "Sam",
  "lastName": "Lee",
  "specialization": "Oral Surgery",
  "accessStartDate": "2026-09-01T00:00:00.000Z",
  "accessEndDate": "2026-10-01T00:00:00.000Z"
}
```

**201** `{ "user": PublicUser (role GUEST_DOCTOR, with accessStart/End dates), "doctor": Doctor, "invite": { "sent": true, "expiresInDays": 7 } }`
`GET`, `GET /:id`, `PATCH /:id` (may update access window), `DELETE /:id`,
`POST /:id/resend-invite` — same shapes as Doctors, plus `accessStartDate` /
`accessEndDate` on the user.

---

## Patients ✅ — `/api/patients` (tenant)

### `GET /api/patients`
**200** `[ Patient, … ]` (scoped to caller's clinic, newest first).

### `POST /api/patients`
Request (`name` required; rest optional):

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+15551234567",
  "dob": "1990-05-01",
  "medicalNotes": "No known allergies"
}
```

**201** → `Patient`.

### `GET /api/patients/:id`
**200** → `Patient` · `404 { "error": "Patient not found" }`.

### `PATCH /api/patients/:id`
Request: any subset of the create fields. **200** → `Patient` · `404`.

### `DELETE /api/patients/:id`
**204** · `404`.

All: `401` (no session) · `403` (no clinic on account).

---

## Doctors ✅ — `/api/doctors` (tenant)

Doctor **profiles** for scheduling. Each profile links to an existing `User`
(the auth account) via `userId`. See Users/Staff 🟡 for the onboarding path that
will create the user + profile together.

### `GET /api/doctors`
**200** `[ Doctor, … ]`.

### `POST /api/doctors`
Request (`userId` required — an existing user):

```json
{
  "userId": "cmsx...",
  "specialization": "Orthodontics",
  "licenseNumber": "LIC-2001",
  "phone": "+15551230000",
  "bio": "…"
}
```

**201** → `Doctor`.

### `GET /api/doctors/:id`
**200** → `Doctor` · `404 { "error": "Doctor not found" }`.

### `PATCH /api/doctors/:id`
Request: any subset of `{ specialization, licenseNumber, phone, bio }` (not `userId`). **200** → `Doctor` · `404`.

### `DELETE /api/doctors/:id`
**204** · `404`.

---

## Appointments ✅ — `/api/appointments` (tenant)

### `GET /api/appointments`
**200** `[ Appointment, … ]` (scoped to clinic, ordered by `startTime` ascending).

### `POST /api/appointments`
Request (`endTime` must be after `startTime`; `status` defaults to `SCHEDULED`):

```json
{
  "patientId": "cmsx...",
  "doctorId": "cmsx...",
  "startTime": "2026-09-01T09:00:00.000Z",
  "endTime": "2026-09-01T09:30:00.000Z",
  "status": "SCHEDULED",
  "notes": "Routine checkup"
}
```

**201** → `Appointment`.
`400` example (time refine):

```json
{ "error": "Validation failed", "issues": [ { "code": "custom", "path": ["endTime"], "message": "endTime must be after startTime" } ] }
```

### `GET /api/appointments/:id`
**200** → `Appointment` · `404 { "error": "Appointment not found" }`.

### `PATCH /api/appointments/:id`
Request: any subset of the create fields (e.g. `{ "status": "CONFIRMED" }`). **200** → `Appointment` · `404`.

### `DELETE /api/appointments/:id`
**204** · `404`.

---

## Analytics ✅ — `/api/analytics` (tenant)

### `GET /api/analytics/summary`
Optional query: `?from=2026-01-01&to=2026-12-31` (bounds the `appointments`
count by `startTime`; `upcomingAppointments` always counts `SCHEDULED`/`CONFIRMED`
from now).

**200**:

```json
{ "patients": 5, "doctors": 3, "appointments": 6, "upcomingAppointments": 2 }
```

---

## Change log / status

| Area                 | Status | Notes                                              |
| -------------------- | ------ | -------------------------------------------------- |
| Auth (9 endpoints)   | ✅     | Cookie-based, OTP reset, invite set-password        |
| Clinic Management    | ✅     | Super-admin CRUD                                    |
| Patients             | ✅     | Tenant-scoped CRUD                                  |
| Doctors (profiles)   | ✅     | Tenant-scoped CRUD (create needs `userId`)          |
| Appointments         | ✅     | Tenant-scoped CRUD, time-range validation           |
| Analytics            | ✅     | Per-clinic summary counts                           |
| Users / Staff        | 🟡     | Onboarding + invites; needs name columns migration  |
