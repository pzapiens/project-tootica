# Tootica — Frontend

Frontend for the Tootica dental management system.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · ESLint

## Requirements

- Node.js >= 20
- The [backend](../backend) running locally on port `4000` (with Docker for
  Postgres + MailHog — see the backend README)

## Getting started

```bash
npm install
cp .env.example .env.local   # then edit if your backend runs elsewhere
npm run dev                  # http://localhost:3000
```

Open <http://localhost:3000>. The home page shows a **Backend connection** badge
that turns green once it can reach the backend.

## How API calls work

The frontend never calls the backend's URL directly. It calls **relative**
`/api/*` paths, and `next.config.ts` rewrites (proxies) those to the backend.
From the browser's perspective everything is same-origin, so there is **no CORS**
to configure and the auth cookies flow through the proxy unchanged.

- Backend origin: `BACKEND_ORIGIN` in `.env.local` (default `http://localhost:4000`).
- Use the `apiFetch()` helper in `src/lib/api.ts`:

```ts
import { apiFetch, type AuthResponse } from "@/lib/api";

await apiFetch<AuthResponse>("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
```

`apiFetch` sends `credentials: "include"` (the app is **cookie-based** — no
bearer tokens), and on a non-2xx response throws an `ApiError` carrying the HTTP
status and the backend's human-readable message. Validation errors surface the
specific `issues[]` messages (e.g. which password rule failed) instead of a
generic "Validation failed".

## Auth & routing

- **Cookie sessions.** `POST /api/auth/login` sets httpOnly `access_token` /
  `refresh_token` cookies. Every request goes out with credentials.
- **One landing URL for all roles.** After login everyone is sent to
  `/clinic-selection`. That page loads `GET /api/auth/me` and renders the correct
  view **by role**, so the super-admin area is **not** exposed by a distinct URL
  (there is no `/super-admin` route). Pages redirect to `/login` on a `401`.

## Screens & features

Design tokens (`--color-brand #0077c0`, `--color-ink`, `--color-field-border`,
`--color-field-placeholder`) live in `globals.css`; fonts are **Manrope**
(headings) + **Inter** (body). Auth screens auto-scale to fit the viewport.

### `/login` — Sign In
- Email + password with **per-field validation**: empty/format checked client
  side, and the backend distinguishes **"No account found with this email"**
  from **"Incorrect password"**, each shown under the relevant field.
- Password field has a **show/hide eye toggle** (`components/PasswordToggle`).
- **Keep me logged in** checkbox (visual only).
- On success → `/clinic-selection`.

### `/forgot-password` — password reset (4 connected steps)
1. **Email** → `POST /api/auth/forgot-password`. The OTP is emailed; locally it
   is caught by **MailHog** (view at <http://localhost:8025>).
2. **Verification** — 6-box OTP with auto-advance / paste / a resend countdown →
   `POST /api/auth/verify-otp` (returns a short-lived `resetToken`).
3. **Reset Password** — new + confirm, with a **live password-policy checklist**
   (≥ 8 chars, an uppercase letter, a number, a special character) and eye
   toggles → `POST /api/auth/reset-password`.
4. **Login Again** → back to `/login`.

### `/clinic-selection` — role-based landing
Loads the signed-in user and renders one of two views:

**Clinic staff (CLIENT_ADMIN / DOCTOR / RECEPTIONIST)** — `ClinicAdminView`:
- Greeting **"Hi, {name}"** (doctors are greeted **"Hi, Dr {name}"**; other
  titles are omitted).
- Four appointment **stat cards** from `GET /api/analytics/summary` (real
  per-clinic counts by status) that update with a **time-frame** filter.
- **Select Branch** table (their clinic's branches from `GET /api/branches`),
  searchable, single-select rows. **LOGOUT**.

**Super admin** — `SuperAdminView` (same URL, no separate path). A **two-level
browse**:

- **Clinics** list (`GET /api/super-admin/clinics`) — each row shows the clinic
  (with its `CL-…` code badge), the clinic admin as PIC, and contact. Clicking a
  clinic drills into its **branches**; the row actions **manage** the clinic's
  admins, **edit** the clinic, or **delete** it (removing the clinic and all its
  data — behind the deletion-code gate).
- **Branches** of the drilled-in clinic (with a back button) — each branch row
  (`BR-…` code) can **manage its staff** (that branch's doctors + receptionist),
  **edit** (`PATCH /api/super-admin/branches/:id`), **delete**, or **open the
  dashboard** for that clinic. Entering a dashboard remembers the selected clinic
  (sent as the **`X-Clinic-Id`** header) so a super admin — who has no clinic of
  their own — can view that clinic's tenant-scoped data. A **+ Add Branch** button
  adds one (`POST /api/super-admin/branches`).
- **+ Add Clinic & Account** (top bar) opens a modal to pick/create a clinic and
  onboard an account:
  - **Add New Clinic** — a **Clinic Name** plus **one or more branches** (each
    with its own name / PIC / contact) → `POST /api/super-admin/clinics`.
  - **Account Details** — First/Last Name, **Title**, **Account Type**
    (Admin/Doctor/Receptionist), Email, Contact → `POST /api/super-admin/accounts`
    (doctors/receptionists pinned to the chosen branch). The result screen shows
    the one-time **temporary password** (also emailed to the user).
- **Manage Accounts** modal — list, edit, **suspend/re-activate**, or **delete**
  accounts.
- **Deletion gate** — deleting a **clinic**, branch or account opens a confirm
  dialog that requires the **super-admin deletion code** before the request is sent.

All of the above is live from the backend (greeting, clinics, branches, PIC,
contact, codes and stat cards).

### `/clinic-selection/[code]/…` — per-clinic dashboard

Picking a branch on the selection screen enters the dashboard area, where
`[code]` is the branch code (e.g. `BR-0001`). A shared **app shell**
(`layout.tsx` → `DashboardShell`) wraps every nested route:

- **Dark sidebar** with the logo, **role-gated navigation** (Dashboard,
  Appointments, Patients, Doctors — visible to everyone; Analytics and Revenue —
  **admins only**), a **user chip** (name, "Dr." for doctors) whose drop-up has
  Profile / Accounts / **Switch Branch** (→ back to `/clinic-selection`) and
  **Log Out**.
- A fixed white content card; only its inner region scrolls. The dense
  1440-wide Figma layout is rendered at `zoom: 0.9` so it fits.
- The session (`GET /api/auth/me`) is loaded **once** here and shared with nested
  pages via a `useMe()` context; a `401` bounces to `/login`.
- The forced first-login **Reset Password + Terms** card (`ResetPasswordPopup`)
  is shown for any non-super-admin whose account still has `mustResetPassword`
  set — for doctors/receptionists (who skip clinic selection) it appears here;
  it posts to `POST /api/auth/complete-onboarding`.

**`/dashboard`** — the main screen (state owned by `DashboardClient`):
- **Header** with the "Hi, {name}" greeting, a **timeframe filter** (All-Time /
  Today / custom FROM–TO range) and the primary **New Appointment** action.
- Four **stat cards** from `GET /api/analytics/summary` (Total / Completed /
  Pending / Cancelled). The timeframe filter drives **only** these cards.
- **Today's Appointments** table from `GET /api/appointments` — the current day's
  appointments, filtered by a **status** dropdown (mapped to real statuses) and a
  client-side **search**, **paginated 20 per page**. It is independent of the
  timeframe filter and the calendar.
- A **mini calendar** beside the table is **display-only**: it dots the days that
  have an appointment and navigates months. **View Full Calendar** opens `/calendar`.
- **New Appointment** modal — search or **create a patient** (`POST /api/patients`,
  shows the `PAT-…` code) → the **appointment form**. Schedule *by Date & Time*
  (find **available doctors** for a slot) or *by Doctor* (availability is
  **auto-checked** as you type the time — business hours + double-booking, from
  `GET /api/appointments/availability`). A **Non-mandatory** option bypasses the
  checks (no time → shows `--`). **Status** is editable (default *Upcoming*).
  Confirm → `POST /api/appointments`, and the dashboard refreshes. **Editing**
  reuses the same form and excludes that appointment from the availability check,
  so its own slot never reads as a conflict.

**`/calendar`** — full month calendar of the clinic's real appointments
(`GET /api/appointments`), each in its date cell and colour-coded by status; an
**in-progress (Ongoing)** appointment is filled blue. Patients are shown by
**first name only**. Clicking a day opens that day's list, and an appointment
shows its detail.

**`/appointments`, `/patients`, `/doctors`, `/analytics`, `/revenue`** — routed
and role-gated, currently rendering a **"Coming soon"** placeholder until each is
built frame-by-frame.

The one screen still showing sample data is the **Doctor Availability** timeline
modal (an illustrative day); the "available doctors" / "check availability"
validations it sits behind are real.

## Scripts

| Script          | Description                  |
| --------------- | ---------------------------- |
| `npm run dev`   | Start dev server (port 3000) |
| `npm run build` | Production build             |
| `npm start`     | Serve the production build   |
| `npm run lint`  | Lint with ESLint             |

## Environment variables

See `.env.example`. Copy it to `.env.local`.

| Variable         | Default                 | Description                           |
| ---------------- | ----------------------- | ------------------------------------- |
| `BACKEND_ORIGIN` | `http://localhost:4000` | Origin the `/api/*` proxy forwards to |

## Project structure

```
src/
├── app/
│   ├── layout.tsx · globals.css · page.tsx · BackendStatus.tsx
│   ├── login/
│   │   ├── page.tsx · LoginCard.tsx · FitToViewport.tsx
│   ├── forgot-password/
│   │   ├── page.tsx · ForgotPasswordFlow.tsx   # 4-step flow + password checklist
│   └── clinic-selection/
│       ├── page.tsx                # renders ClinicSelectionClient
│       ├── ClinicSelectionClient.tsx  # loads /me, dispatches by role
│       ├── ClinicAdminView.tsx     # per-clinic view (real stats + branch list)
│       ├── SuperAdminView.tsx      # clinics → branches drill-down + management
│       ├── DashboardTop.tsx · BranchFilter.tsx · TimeFilter.tsx
│       ├── SelectBranchSection.tsx · BranchList.tsx  # shared, parametrised table
│       ├── AddClinicAccountModal.tsx   # clinic + branches selector + account form
│       ├── AddBranchModal.tsx      # add a branch to an existing clinic
│       ├── ManageAccountsModal.tsx # per-branch / per-clinic account management
│       ├── EditBranchModal.tsx · EditClinicModal.tsx
│       ├── modal-ui.tsx            # shared Overlay / inputs / buttons / ConfirmDialog
│       ├── ResetPasswordPopup.tsx  # forced first-login reset + Terms card
│       └── [code]/                 # per-clinic dashboard area (code = branch code)
│           ├── layout.tsx · DashboardShell.tsx   # sidebar + white panel + useMe()
│           ├── _ComingSoon.tsx     # placeholder for unbuilt nav destinations
│           ├── dashboard/          # main screen: header, stat cards, table, calendar
│           │   ├── page.tsx · DashboardClient.tsx  # owns timeframe (cards) + status filter (table)
│           │   ├── DashboardOverview.tsx · LowerSection.tsx
│           │   ├── DashboardHeader.tsx · StatCards.tsx · TimeframeFilter.tsx
│           │   ├── AppointmentsTable.tsx · MiniCalendar.tsx
│           │   ├── NewAppointmentModal.tsx · AppointmentFormStep.tsx
│           │   ├── DoctorAvailabilityModal.tsx · DateInput.tsx
│           │   └── mock.ts         # shared appointment types + timeframe helpers
│           ├── calendar/           # full month calendar (real appts) + calendar-mock.ts (mappers)
│           └── appointments|patients|doctors|analytics|revenue/  # Coming soon
├── components/
│   └── PasswordToggle.tsx          # show/hide eye button
└── lib/
    ├── api.ts          # apiFetch(), ApiError, types, displayName/greetingLabel
    ├── analytics.ts    # timeframe → /analytics query helpers
    ├── appointmentsBus.ts  # tiny event bus to refresh dashboard after a booking
    ├── password.ts     # password-policy rules + live checklist helpers
    ├── validation.ts   # phoneError()/emailError() (+91 + 10 digits)
    └── useExclusiveDropdown.ts   # single-open-dropdown-at-a-time hook

public/
├── auth/      # login / forgot-password icons + logo
├── clinic/    # clinic-selection icons
└── dashboard/ # sidebar + dashboard icons
```
