# Demo data

From `backend/`, with the configured PostgreSQL database running:

```sh
npm run db:migrate:deploy
npm run db:seed:demo
npm run db:seed:demo:check
```

The demo seed adds samples to all **17 application tables**, including the
display-code counters. It does not clear tables, reset existing passwords, or
replace existing patient/staff records. It refuses to seed in production.
The Prisma migrations table is managed by Prisma, not seeded.

Each existing clinic gets at least two branches, dedicated demo staff in every
branch, and 12 patients whose names end in `(Demo)`. The command also supports an
empty migrated database, creating two demo clinics and a demo super admin when
needed. Existing clinics need a clinic code. Display-code counters are synchronized
with existing codes before issuing new codes.

## Accounts

All newly created demo accounts use **`Demo@12345`**. Existing logins still work.
The seed prints a clinic admin address for each clinic. Email addresses use this
pattern, where the first eight characters of the clinic UUID avoid collisions:

```text
admin@<lowercase-clinic-code>.<first-8-clinic-id-chars>.demo.tootica.test
doctor-1@<same-domain>
doctor-2@<same-domain>
reception-1@<same-domain>
reception-2@<same-domain>
onboarding@<same-domain>
suspended@<same-domain>
```

`admin` has clinic-wide access. Doctors and receptionists are scoped to their
branch. The `onboarding` account prompts for a password reset and Terms acceptance;
the `suspended` account demonstrates blocked access. Guest profiles include an
active and an expired access window; they have no login password, matching guest
profiles created through the Doctors page.

If no super admin exists, the seed creates `superadmin@demo.tootica.test` with the
same demo password. Otherwise use your existing super admin login.

## Walkthrough

| App area                  | Demo scenario                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clinic/branch selection   | Existing clinics; at least two branches each, with demo doctors and receptionists. New demo branches have a receptionist as PIC.                                                            |
| Dashboard/calendar        | Per branch: 36 historical visits across six months, six visits today, eight upcoming visits. All six appointment statuses appear today.                                                     |
| Appointment forms/filters | All consultation types and lead sources; staff-created and accepted WhatsApp appointments.                                                                                                  |
| WhatsApp requests         | Four pending requests per clinic: two existing patients and two new leads. No assigned doctor, time slot, or display code until accepted.                                                   |
| Payments/revenue          | Completed appointments have two charges; examples include fully paid, partially paid, and fully unpaid bills. Cancelled/no-show visits have no charges.                                     |
| Patient records/history   | All 12 demo patients have visit-linked tooth remarks, medical history, and observations attributed to demo clinicians. Repeat visits show longitudinal history.                             |
| Documents                 | Each recorded visit has consent, X-ray, and other document samples, with actual downloadable files. The X-ray sample is an explicitly labelled SVG schematic; other samples are text files. |
| Record audit              | Sample create/update/delete actions and upload/download histories appear in each section. All histories are fictional.                                                                      |
| Doctor availability       | Weekly shifts covering every day, plus lunch blocks today and the next two days. Appointments avoid those blocks.                                                                           |
| Accounts/guest doctors    | Active branch staff, suspended staff, first-login onboarding, and active/expired guest profiles.                                                                                            |
| WhatsApp chat history     | Simulated submitted, failed, unknown, and pending submission attempts on the first branch's confirmed appointment today.                                                                    |

When a clinic has no WhatsApp connection, the seed enables the clinic's WhatsApp
feature flag and inserts a **disconnected demo connection**, with no live token.
Existing connections and their feature settings are preserved. The seed sends no
messages. Real sending requires provisioning a valid Meta connection; these sample
history rows do not indicate actual submission or delivery.

## Repeating and verifying

Stable demo IDs and create-only upserts prevent duplicate samples on a repeat run.
Edits, passwords, appointment dates, and statuses of existing demo rows are
preserved. Deleted samples are recreated on the next run. Dates are anchored to
the Dubai calendar date when each row is first created, so rerunning does not move
old appointments to today. Use a separate, fresh database for a newly dated demo.

The check command is read-only. It verifies every application table is populated,
all 12 demo patients in each clinic have linked clinical records and all three
document categories, tenant/patient relationships agree, and downloadable files
exist with matching byte sizes and demo labels. Local file storage is used, so run
the seed with the backend's usual `UPLOAD_DIR` and retain those files with the DB.
