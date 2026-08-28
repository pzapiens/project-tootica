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
- Four appointment **stat cards** (seed data — see note below) with **branch**
  and **time-frame** filters.
- **Select Branch** table (their clinic's branches from `GET /api/branches`),
  searchable, single-select rows. **LOGOUT**.

**Super admin** — `SuperAdminView` (same URL, no separate path):
- Greeting **"Hi, Tootica"**.
- **Select Clinic** table listing **every branch across all clinics**
  (`GET /api/super-admin/branches`), each with a unique **code badge** (`c001`,
  `c002`, …), person-in-charge and contact. Searchable (incl. by code).
- **+ Add Clinic & Account** button (to the left of LOGOUT) opens a modal:
  - **Clinic selector** — searchable; pick an existing clinic, or **Add New
    Clinic** (a nested modal with a single **Clinic Name** + PIC + Contact) which
    creates it, adds it to the selector and auto-selects it.
  - **Account Details** (enabled once a clinic is selected) — First Name, Last
    Name, **Title** (Mr/Mrs/Ms/Dr), **Account Type** (Admin/Doctor/Receptionist),
    Email, Contact → `POST /api/super-admin/accounts`.
  - Required-field validation, plus **phone validation** (`+91` + 10 digits).
- Each row has **Edit** and **Delete** actions before the chevron:
  - **Edit** → modal → `PATCH /api/super-admin/branches/:id`.
  - **Delete** → a design-system **confirmation dialog** (danger button
    `#BA1A1A`) → `DELETE /api/super-admin/branches/:id`.

> **Stat cards are still seed data.** The backend has no per-status / per-branch
> analytics endpoint yet, so `clinic-selection/page.tsx` seeds those numbers.
> The greeting, branch list, PIC and contact are all live from the backend.

### `/clinic-selection/[code]/…` — per-clinic dashboard

Picking a branch on the selection screen enters the dashboard area, where
`[code]` is the branch code (e.g. `c001`). A shared **app shell** (`layout.tsx`
→ `DashboardShell`) wraps every nested route:

- **Dark sidebar** with the logo, **role-gated navigation** (Dashboard,
  Appointments, Patients, Doctors — visible to everyone; Analytics and Revenue —
  **admins only**), a **user chip** (name, "Dr." for doctors) whose drop-up has
  Profile / Accounts / **Switch Branch** (→ back to `/clinic-selection`) and
  **Log Out**.
- A fixed white content card; only its inner region scrolls. The dense
  1440-wide Figma layout is rendered at `zoom: 0.9` so it fits.
- The session (`GET /api/auth/me`) is loaded **once** here and shared with nested
  pages via a `useMe()` context; a `401` bounces to `/login`.
- Doctors / receptionists skip clinic selection, so their post-login **Reset
  Password** popup (`ResetPasswordPopup`) is shown here instead.

**`/dashboard`** — the main screen (built frame-by-frame):
- **Header** with the "Hi, {name}" greeting, a **timeframe filter** (All-Time /
  Today / custom FROM–TO range) and the primary **New Appointment** action.
- Four **stat cards** whose counts react to the selected timeframe.
- **Today's Appointments** table (searchable, status-filtered, sorted by start
  time) beside a functional **mini calendar** (real current month, today
  highlighted, click-to-select). Their bottoms line up; the table body scrolls
  if longer.
- **New Appointment** modal — a multi-step flow: find a first-time/returning
  patient → new-patient profile form → "Profile Created" → the **appointment
  form** (consultation types, lead source, and either *Select by Date & Time* or
  *Select by Doctor* scheduling, with a **Doctor Availability** timeline modal).
  Editing a table row reuses the same form pre-filled — its submit button reads
  **Update Appointment** instead of **Confirm Appointment**.

**`/calendar`** — full month calendar of a doctor's appointments, colour-coded by
status; clicking a day opens that day's list, and an appointment shows its detail.

**`/appointments`, `/patients`, `/doctors`, `/analytics`, `/revenue`** — routed
and role-gated, currently rendering a **"Coming soon"** placeholder until each is
built frame-by-frame.

> **Dashboard data is still mock.** The stat counts, today's-appointments table,
> calendar events and doctor-availability timeline come from local `mock.ts` /
> `calendar-mock.ts` files. Swap them for backend fetches once the per-clinic
> analytics + appointments endpoints exist. The session, greeting and role-gating
> are live.

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
│       ├── page.tsx                # seed stats; renders ClinicSelectionClient
│       ├── ClinicSelectionClient.tsx  # loads /me, dispatches by role
│       ├── ClinicAdminView.tsx     # per-clinic view (stats + branch list)
│       ├── SuperAdminView.tsx      # cross-tenant view + add/edit/delete
│       ├── DashboardTop.tsx · BranchFilter.tsx · TimeFilter.tsx
│       ├── SelectBranchSection.tsx · BranchList.tsx  # shared, parametrised table
│       ├── AddClinicAccountModal.tsx   # clinic selector + account form
│       ├── EditBranchModal.tsx
│       ├── modal-ui.tsx            # shared Overlay / inputs / buttons / ConfirmDialog
│       ├── ResetPasswordPopup.tsx  # post-login "set new password" card
│       └── [code]/                 # per-clinic dashboard area (code = branch code)
│           ├── layout.tsx · DashboardShell.tsx   # sidebar + white panel + useMe()
│           ├── _ComingSoon.tsx     # placeholder for unbuilt nav destinations
│           ├── dashboard/          # main screen: header, stat cards, table, calendar
│           │   ├── page.tsx · DashboardOverview.tsx · LowerSection.tsx
│           │   ├── DashboardHeader.tsx · StatCards.tsx · TimeframeFilter.tsx
│           │   ├── AppointmentsTable.tsx · MiniCalendar.tsx
│           │   ├── NewAppointmentModal.tsx · AppointmentFormStep.tsx
│           │   ├── DoctorAvailabilityModal.tsx · DateInput.tsx
│           │   └── mock.ts         # mock stats + today's appointments
│           ├── calendar/           # full month calendar + calendar-mock.ts
│           └── appointments|patients|doctors|analytics|revenue/  # Coming soon
├── components/
│   └── PasswordToggle.tsx          # show/hide eye button
└── lib/
    ├── api.ts          # apiFetch(), ApiError, types, displayName/greetingLabel
    ├── password.ts     # password-policy rules + live checklist helpers
    ├── validation.ts   # phoneError()/emailError() (+91 + 10 digits)
    └── useExclusiveDropdown.ts   # single-open-dropdown-at-a-time hook

public/
├── auth/      # login / forgot-password icons + logo
├── clinic/    # clinic-selection icons
└── dashboard/ # sidebar + dashboard icons
```
