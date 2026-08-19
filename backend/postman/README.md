# Postman collection

Import `Tootica.postman_collection.json` into Postman (File → Import).

## Before you start

```bash
docker compose up -d
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

## How auth works here

The API uses **httpOnly cookies**, not bearer tokens. Postman's cookie jar
stores them per-domain automatically, so:

1. Run **Auth → Login (Client Admin)** — this sets the session cookies.
2. Now any tenant-scoped request (Patients, Doctors, Appointments, Analytics)
   works with the stored session.
3. For the Super Admin folder, run **Auth → Login (Super Admin)** first — it
   switches the active session to the super admin account.

> Using Postman on the web? Enable the Postman Desktop Agent so the cookie jar
> and `localhost` requests work. The desktop app works out of the box.

## Password reset flow

1. **Forgot Password** — sends a 6-digit OTP to MailHog.
2. **Fetch latest OTP (MailHog)** — reads the code from MailHog and saves it to
   the `otp` variable.
3. **Verify OTP** — validates it and saves a `resetToken`.
4. **Reset Password** — uses `resetToken` (the example sets the password back to
   `adminPassword` so the seeded login keeps working).

## Variables

Collection variables cover everything (`baseUrl`, credentials, and ids captured
from responses like `clinicId`, `patientId`, `doctorId`, `appointmentId`).
Create Clinic / Create Patient / etc. auto-store their new id for the follow-up
requests.

`Set Password (invite)` needs an invite token. Onboarding that mints these isn't
built yet; to try it, generate one for an existing passwordless user id:

```bash
npx tsx -e "import {signActionToken} from './src/modules/auth/jwt.util'; console.log(signActionToken('<USER_ID>','invite'))"
```

then paste it into the `inviteToken` variable.
