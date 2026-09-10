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

**Field-state convention (labeled form fields):** an **editable/selectable**
field shows its **header (label) and placeholder in full-opacity black**
(`text-[#1e1e24]`); an **inactive/read-only** field renders its **value/input at
50% opacity** (`opacity-50`). Applied across the New/Edit Appointment form, the
patient & doctor create/edit modals, the shift editor, and the cancel-reason
field. (Header-less **search** inputs keep their muted placeholder.)

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
- Greeting **"Welcome back, {salutation}. {name}"** in the title area, using the
  account's salutation — **"Dr"** for doctors (from their role), otherwise the
  **Title** (Mr/Mrs/Ms) chosen at account creation. The salutation is shown
  here, **not** in the sidebar account name (which shows the first name only).
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
  1440-wide Figma layout is rendered at `zoom: 0.9` so it fits. The content
  wrapper is a flex column with `min-h-full` so it fills the scroll viewport
  (capped at 100%, so it never overflows into a scrollbar when the content fits)
  — letting a page stretch its root (`flex-1`) and pin a footer to the page
  bottom with `mt-auto`; the page only scrolls when the rows genuinely overflow.
- The session (`GET /api/auth/me`) is loaded **once** here and shared with nested
  pages via a `useMe()` context; a `401` bounces to `/login`.
- The forced first-login **Reset Password + Terms** card (`ResetPasswordPopup`)
  is shown for any non-super-admin whose account still has `mustResetPassword`
  set — for doctors/receptionists (who skip clinic selection) it appears here;
  it posts to `POST /api/auth/complete-onboarding`.

**`/dashboard`** — the main screen (state owned by `DashboardClient`):
- **Header** with the "Welcome back, {salutation}. {name}" greeting, a **timeframe filter** (All-Time /
  Today / custom FROM–TO range), a circular **notification bell** and the primary
  **New Appointment** action. The bell (same outlined-circle style as the Patients
  filter/export buttons) shows a **red dot** while notifications remain and opens a
  popup listing each notification with a **Review** action plus a **Clear all**
  button (`NotificationBell.tsx`, dummy feed for now).
- Four **stat cards** from `GET /api/analytics/summary` (Total / Completed /
  Pending / Cancelled). The timeframe filter drives **only** these cards.
- **Today's Appointments** table from `GET /api/appointments` — the current day's
  appointments, filtered by a **status** dropdown (mapped to real statuses) and a
  client-side **search**, **paginated 20 per page**. It is independent of the
  timeframe filter and the calendar.
- A **mini calendar** beside the table dots the days that have an appointment and
  navigates months. **Clicking any day** opens the full calendar on that day
  (`/calendar?date=YYYY-MM-DD`) with its appointments in the right panel.
  **View Full Calendar** opens `/calendar`.
- **New Appointment** modal — search or **create a patient** (`POST /api/patients`,
  shows the `PAT-…` code) → the **appointment form**. Schedule *by Date & Time*
  (the free doctors for a slot are found automatically; picking one from the
  Doctor dropdown is **optional** — the doctor is **non-mandatory** in this flow,
  so an appointment can be saved **unassigned**) or *by Doctor* (availability is
  **auto-checked** as you type the time — business hours + double-booking, from
  `GET /api/appointments/availability`). A **Non-mandatory** ("Skip time &
  availability check") option bypasses the checks (no time → shows `--`); it is
  **pre-ticked automatically** when editing a time-less booking (e.g. a WhatsApp
  booking accepted with no doctor/time yet). Both `doctorId` and the time are
  optional end-to-end (nullable `doctorId` on the backend). A staff (web) booking
  is created as `CONFIRMED` ("Upcoming"); only patient WhatsApp bookings arrive
  as `SCHEDULED` ("Pending"). **Status** is **locked to *Upcoming*** for a new
  booking (read-only, with a block icon); **editing** an appointment unlocks a
  **colour-coded dropdown** with the four selectable states — **Upcoming** (blue),
  **Completed** (green), **No Show** (slate) and **Cancelled** (red) — whose
  option colours come from the app's single status palette (`statusColors.ts`) so
  they read the same here as their table/calendar badges. There is no separate
  "Confirmed": *Upcoming* is the one active state and maps to the backend
  `CONFIRMED`; the raw `SCHEDULED`/"Pending" state exists only for un-accepted
  WhatsApp bookings. The active value reads in plain black and each option row
  carries its status colour with a check on the selected one. Confirm →
  `POST /api/appointments`, and the dashboard refreshes. **Editing**
  reuses the same form and excludes that appointment from the availability check,
  so its own slot never reads as a conflict.

**`/calendar`** — full month calendar of the clinic's real appointments
(`GET /api/appointments`), each in its date cell and colour-coded by status; an
**in-progress (Ongoing)** appointment is filled blue. Patients are shown by
**first name only**. Clicking a day opens that day's list, and an appointment
shows its detail. Accepts a **`?date=YYYY-MM-DD`** deep link (used by the
dashboard mini calendar) that opens straight onto that month with the day's
slide-over already showing.

**`/patients`** — the clinic's patient directory (Figma "Patients"). A
searchable (by name, ID, phone digits, or email local-part — the email domain
and `+91` are ignored so common letters still filter), sortable, paginated
table (ID, Patient Name, Phone, Email,
Age / Gender, Last Clinic Visit, Actions) from `GET /api/patients`; the **age**
is derived from DOB and the **last clinic visit** is computed client-side from
each patient's most recent *past* appointment (`GET /api/appointments`). Header
actions: **Filter** opens an **Apply Filter** panel (ID / Alphabetic / Age, each
ascending or descending) where selections are **staged** and committed with
**Apply Filters** (or cleared with **Reset All**) — multiple cards combine into a
multi-key sort, and the number of active filters shows as a **badge on the filter
icon**. **Export** downloads the current list as **CSV**. Each row has **Edit** (Edit Patient
Profile modal → `PATCH /api/patients/:id`), a **Book appointment** icon (not
wired yet), and **Delete** (confirm dialog → `DELETE /api/patients/:id`, which
also removes the patient's appointments). The table grows with its rows, but the
**pagination bar** (record range, a **per-page** selector, and numbered
pagination) is pushed to the **bottom of the page** via `mt-auto` (the root is
`flex-1` inside the shell's viewport-height content column) so a short table
doesn't leave the footer floating mid-page; once the rows overflow and the page
scrolls, the footer simply follows the last row.

**`/doctors`** — the clinic's doctor directory (Figma "Doctors"). A searchable
(by name, ID, phone digits, or specialization), sortable, paginated table (ID,
Doctor Name, Phone, Specialization, Actions) from `GET /api/doctors`; names are
shown with the **"Dr."** honorific. The list holds **two kinds of doctor**:
**employed doctors** (role `DOCTOR`, created via the account flow, with logins)
and **guest doctors** (role `GUEST_DOCTOR`, visiting doctors added here) — the
row's `role` tells them apart. Header actions: **Create Doctor** opens the **New
Doctor Profile** modal (name / phone / specialization required; **email
optional**) which creates a
**guest doctor** with `POST /api/doctors` (the backend provisions a
`GUEST_DOCTOR` user + profile inside the current clinic — no branch picker, since
creation is already clinic-scoped). **Filter** opens an **Apply Filter** panel
(ID ascending/descending + multi-select specialization chips, staged and
committed with **Apply Filters** / **Reset All**, active count shown as a
**badge**). **Export** downloads the current list as **CSV**. Row actions (Figma
`calendar_clock` glyph for the availability action): **Edit** — for **all**
doctors — opens the per-doctor shift editor at `/doctors/:id/shift`; the
**Availability** icon opens the **Doctor Availability** modal (date navigator +
timeline with a **Not Available / Available / Booked / Break** legend,
`GET /api/appointments/availability`); **Delete**
(confirm dialog → `DELETE /api/doctors/:id`) is shown **only for guest doctors**.
Same page-bottom pagination as Patients/Appointments (footer pinned to the page
bottom via `mt-auto` when the table is short; follows the rows when it scrolls).

**`/doctors/:id/shift`** (Edit Doctor Shift, Figma "Doctors2 - Edit") — the
per-doctor shift editor. The detail fields (name / consultation type / phone /
email) are **frozen for employed doctors** (identity managed via the account
flow) and **editable + saveable for guest doctors** (`PATCH /api/doctors/:id`,
via an "Update Details" button). Below is an **Add Shifts** builder (pick
calendar dates + recurrence + time range → shifts table). The calendar has
app-styled **month + year dropdowns** (year = present year and up), marks
**today with a blue stroke**, fills picked dates, and previews the dates the
chosen **recurrence** implies as matching fills — **Day** (just the pick),
**Weekly**, **Biweekly**, **Monthly**, **Yearly**, and **Every day** (every date
from the pick onward); a picked "today" keeps an inset ring so it stays
identifiable. Days that land in the current month's first/last week are shown
**faded but selectable** (the tail of the previous month and the head of the next)
so they can still be marked here. Recurrence is gated until a date is picked. Once a shift is added
it stays marked on the calendar in **green** (expanded by its recurrence) while
the working selection shows **blue** — a small legend labels the two. The shifts
table lists rows in **date order** (then by start time), regardless of add/edit
order. Each shift
row has **Edit** (loads its date/recurrence/time back into the builder — the
button becomes **Update Shift**, with a Cancel) and **Delete** (opens a **confirm
dialog** in the app's shared delete-prompt style before removing the row). Shifts are
persisted per doctor in **`localStorage`** (`src/lib/shifts.ts`, frontend-first)
so they survive leaving and re-opening the editor, and they drive the Doctor
Availability popup + New Appointment checks below — until the doctor-shifts
backend endpoints are wired.

**`/appointments`** — the clinic's appointment list (Figma "Appts1"). A
searchable (by ID, patient, doctor, or consultation type), filterable, paginated
table (ID, Patient Name, Consultation Type, Doctor, Date & Time, Status, Age /
Gender, Actions) from `GET /api/appointments`, scoped by a **timeframe** filter
(**All-Time / Today / custom range** — the same `TimeframeFilter` as the
dashboard; drives the `from`/`to` query). Each row shows a coloured **status
badge** plus a small state glyph (**hourglass** for `SCHEDULED`, **check-circle**
for `CONFIRMED`). Status colours are meaning-driven and come from a single
source — `src/lib/statusColors.ts` — shared by the appointments table, the
dashboard table + its status dropdown, and the calendar chips/cards/legend, so
tuning a colour there updates every surface at once: **Pending → amber**
(awaiting accept/reject), **Upcoming → blue** (scheduled), **On going → solid
blue** (active now), **Completed → green** (done), **Rescheduled → purple**
(moved), **Cancelled → red**, **No Show → slate** (absent). Header actions: a
**WhatsApp** button opens the **"WhatsApp Appointments" popup** (below); **New
Appointment** opens the shared
**NewAppointmentModal** wizard; **Filter** opens an **Apply Filter** panel (ID
sort, Date & Time sort, Attending-Doctor search + checkboxes, Consultation-Type
and Source checkboxes, and Status chips — all staged and committed with **Apply
Filters** / **Reset All**, active count shown as a **badge**); **Export**
downloads the current list as **CSV**; a **refresh** button re-fetches.

A **Pending** (`SCHEDULED`) appointment is a **patient WhatsApp booking** awaiting
the clinic's decision (staff web bookings are created straight as `CONFIRMED` /
"Upcoming", never pending). A WhatsApp booking carries **no doctor and no time
slot** (the patient can't pick either), so it is **kept out of the main table**
and listed only in the **"WhatsApp Appointments" popup** (`AppointmentWhatsAppDialog`),
opened from the WhatsApp header button (its badge counts the pending requests).
Each popup row shows **Patient Name, Consultation Type, Date, Age / Gender** and
**Accept** (green ✓ → `CONFIRMED`, so it now lists in the main table as
"Upcoming" with the full edit + overflow actions, and its **Booking Channel**
reads **WhatsApp** — frozen, same as "Web") / **Reject** (red ✕ → **deletes** the
appointment; a rejected booking is discarded, not kept as a cancelled row)
confirm dialogs (Figma "Appts3 - Accept" / "Appts2 - Reject"). For testing this
flow without a backend, a small set of **dummy bookings is cached in
`localStorage`** (`lib/whatsappDummyStore.ts`, seeded once per browser) and merged
into the popup; accepting or rejecting one just clears it from the cache (no API
call), so the row disappears the same way. An accepted
WhatsApp appointment shows **`--`** in place of the doctor and the time; **editing**
it opens the form with the **doctor unselected** and **"Skip time & availability
check" pre-ticked** (both fields left empty for staff to fill in). Every other
status shows **Edit**
(reopens the NewAppointmentModal edit flow) plus a **⋮ overflow menu** (Figma
"Appts More Dropdown"): **Records** (opens the full **"Patient Records"** view,
Figma "Appts8 - Records", in place of the table — see below), **Payments** (opens the **"Payment Management"** flow, Figma
"Appts15/16 - Payments": a payments list with **Mark as complete** + **Add New** →
the **"New Payment"** form (description + amount) → the row is added with a
running **Total Amount**, deletable. The record is **cached in `localStorage`**
per appointment (`lib/paymentsStore.ts`) until a payments backend lands, so it
survives reloads and drives a **payment-status glyph** in the row's Actions:
an **hourglass** ("Payment Pending") that becomes a **tick** ("Payment Complete")
when Mark-as-complete is ticked — both black, same size, with a styled dark
hover tooltip),
**Notify** (opens a **"Notify the Patient"**
confirmation, Figma "NTP" — the send is a placeholder until the notification
backend lands), **Call** (opens a **"Proceed to Call?"** confirmation
showing the number, "Appts - Call" — the number is a `tel:` link) and **Chat**
(opens a **"Proceed to Chat?"** confirmation, Figma "PTC", whose **Proceed to
WhatsApp** button opens `wa.me` for the patient's number), **Info** (read-only
patient message in a bordered box, Figma "Info"), **Cancel** (required reason
→ `CANCELLED`, Figma "Cancel Appointment?"), and **Delete** (`DELETE /api/appointments/:id`,
Figma "Delete Appts"). The table grows with its rows, but the **pagination bar**
(record range, per-page selector, numbered pagination) is pushed to the **bottom
of the page** via `mt-auto` (the content wrapper fills the scroll viewport) so a
short table doesn't leave the footer floating mid-page; once the rows overflow
and the page scrolls, the footer simply follows the last row.

The ⋮ → **Records** action opens the **"Patient Records"** view
(`PatientRecordsView`, Figma "Appts8 - Records") which replaces the table (back
arrow returns). It shows the patient's name/ID card and six working sections
(each separated by the same 32px gap):
**Doctor/Clinic Observations** — a free-text note with **Save** / **Discard**
(shows **"Saved"** with a tick once persisted); the **Perio-dental chart** —
a clinical chart image beside a **Tooth-wise Remarks** form (Remarks +
a Tooth Number stepper → **Add Entry**) that appends rows to a table, each row
**editable** (loads it back into the form as **Update**) and **deletable** (red
trash); and **Patient Medical History** (Figma "Medical History") — a free-text
box with **Add** / **Discard** that appends rows to a table, each row **edited
inline** (pencil → the row becomes an input with a **save** icon) and
**deletable**; and three **document-upload** sections — **Patient Consent Form**
(Figma "PC Form"), **X-ray Document** (Figma "X-ray Doc") and **Other Documents**
(Figma "Other Docs") — a shared
`DocumentUploadSection` with a drag-and-drop / click **file-upload** drop zone
(PDF/JPG/JPEG/PNG, ≤10 MB, validated) whose accepted files show under **Uploaded
Documents** as cards with **download / delete** (each section scopes its own files
by category). There's no records backend yet, so the note, both tables and the
document **metadata** are **cached in `localStorage`** per patient
(`lib/patientRecordsStore.ts`), while the uploaded **file bytes** are persisted in
**IndexedDB** (`lib/documentFiles.ts`) so **Download** works across reloads. Every
**delete** goes through a confirm prompt (`ConfirmDeleteDialog`). Each of the first
three sections' **Export**
downloads its data (dependency-free, via `lib/recordsExport.ts`): the observation
as a **PDF** (a hand-built PDF blob), and the perio and medical-history tables as
**Excel-openable `.xls`** sheets.

**`/analytics`, `/revenue`** — routed
and role-gated, currently rendering a **"Coming soon"** placeholder until each is
built frame-by-frame.

The **Doctor Availability** timeline modal (Figma 501:51877) paints the day over
a **Not Available** (dark) base: green **Available** windows from the doctor's
saved **shifts**, real **bookings** (blue), user **Blocked** slots (red), and a
**BREAK** divider for the clinic lunch. The timeline **domain auto-fits** — it
spans the union of business hours and everything drawn on it, so a shift/booking
that starts before opening or runs past closing (e.g. 09:00 AM–09:00 PM against
an 18:00 close) stretches the bar and its time labels to fit instead of
overflowing outside it. Hour **ticks** sit only at the edges of the segments
actually drawn (green/dark/blocks/bookings/breaks), so a shift running past
closing marks its real end time and the close (e.g. 06:00 PM) isn't labelled
mid-green — it only shows when it's a genuine edge. Adding a **block** that
overlaps an already-blocked slot is rejected with a reason naming the clash. The
modal always opens on the given day — the **present day** from the Doctors table,
or the chosen date in the New Appointment flow — with day/month/year navigation
from there. A **Block Time Slot** form (FROM/TO +
**Block Slot**) adds a red block for the viewed date; blocks are listed in a
**Blocked Time Slot** table with **Edit** (loads its times back into the form —
the button becomes **Update Slot**, with a Cancel) and **Delete** actions, and
persisted per doctor in `localStorage` (`src/lib/shifts.ts`). In the **New Appointment** flow the modal
opens **view-only** (`viewOnly`) — just the timeline, with the Block Time Slot
form and the blocked-slots grid hidden. Shift windows **and** blocked slots gate the
**New Appointment** flow — Select-by-Doctor marks a doctor available only inside a
covering shift and not during a blocked slot, and Select-by-Date&Time lists only
on-shift, unblocked, free doctors. The "check availability" business-hours/conflict
validations underneath are real backend checks.

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
│           │   ├── DashboardHeader.tsx · StatCards.tsx · TimeframeFilter.tsx · NotificationBell.tsx
│           │   ├── AppointmentsTable.tsx · MiniCalendar.tsx
│           │   ├── NewAppointmentModal.tsx · AppointmentFormStep.tsx
│           │   ├── DoctorAvailabilityModal.tsx · DateInput.tsx
│           │   └── mock.ts         # shared appointment types + timeframe helpers
│           ├── calendar/           # full month calendar (real appts) + calendar-mock.ts (mappers)
│           ├── patients/           # patient directory: list + filter + edit/delete + CSV export
│           │   ├── page.tsx · PatientsClient.tsx   # table, search, sort, pagination, export
│           │   ├── FilterPanel.tsx                 # Apply Filter (ID / Alphabetic / Age)
│           │   ├── EditPatientModal.tsx · DeletePatientDialog.tsx
│           ├── doctors/            # doctor directory: list + filter + create/edit/delete + CSV
│           │   ├── page.tsx · DoctorsClient.tsx     # table, search, sort, pagination, export
│           │   ├── constants.ts                     # dental specializations
│           │   ├── DoctorFilterPanel.tsx            # Apply Filter (ID sort + specialization chips)
│           │   ├── NewDoctorModal.tsx · DeleteDoctorDialog.tsx  # guest create / delete
│           │   └── [id]/shift/       # page.tsx · ShiftClient.tsx (Edit Doctor Shift + add shifts)
│           ├── appointments/        # appointment list: timeframe + filter + row actions + CSV export
│           │   ├── page.tsx · AppointmentsClient.tsx  # table, search, timeframe, pagination, export
│           │   ├── AppointmentFilterPanel.tsx         # Apply Filter (sort + doctor/type/source/status)
│           │   ├── AppointmentConfirmDialog.tsx       # accept / reject / delete confirm
│           │   ├── CancelAppointmentDialog.tsx · AppointmentInfoDialog.tsx
│           │   ├── AppointmentCallDialog.tsx           # "Proceed to Call?" confirm ("Appts - Call")
│           │   ├── AppointmentChatDialog.tsx           # "Proceed to Chat?" confirm ("PTC" → WhatsApp)
│           │   ├── AppointmentNotifyDialog.tsx         # "Notify the Patient" confirm ("NTP")
│           │   ├── PaymentManagementDialog.tsx         # "Payment Management" + "New Payment" flow
│           │   ├── PatientRecordsView.tsx              # "Patient Records" (observations + perio chart) — ⋮ → Records
│           │   ├── AppointmentWhatsAppDialog.tsx        # "WhatsApp Appointments" pending-bookings popup
│           └── analytics|revenue/  # Coming soon
├── components/
│   └── PasswordToggle.tsx          # show/hide eye button
└── lib/
    ├── api.ts          # apiFetch(), ApiError, types, displayName/greetingLabel
    ├── analytics.ts    # timeframe → /analytics query helpers
    ├── appointmentsBus.ts  # tiny event bus to refresh dashboard after a booking
    ├── statusColors.ts # single source of truth for appointment-status colours
    ├── paymentsStore.ts # localStorage cache for per-appointment payments + status glyph
    ├── patientRecordsStore.ts # localStorage cache for Patient Records (observation note + tooth-wise remarks)
    ├── documentFiles.ts # IndexedDB store for uploaded Patient Records file bytes (download survives reloads)
    ├── recordsExport.ts # dependency-free exporters: observation → PDF, perio table → .xls
    ├── bookingChannelStore.ts # localStorage marker: appointments accepted from WhatsApp bookings
    ├── whatsappDummyStore.ts # localStorage cache of dummy WhatsApp bookings (test the popup's accept/reject with no backend)
    ├── password.ts     # password-policy rules + live checklist helpers
    ├── validation.ts   # phoneError()/emailError() (+91 + 10 digits)
    └── useExclusiveDropdown.ts   # single-open-dropdown-at-a-time hook

public/
├── auth/      # login / forgot-password icons + logo
├── clinic/    # clinic-selection icons
└── dashboard/ # sidebar + dashboard icons
```
