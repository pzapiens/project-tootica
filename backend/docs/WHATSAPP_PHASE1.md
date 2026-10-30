# WhatsApp Phase 1: send from an appointment

The app sends a configured Meta-approved template directly from the existing appointment Chat dialog. Clinic admins inspect the connection at **Account > Profile Settings > WhatsApp**. No n8n workflow or staff password is involved in outbound sending.

## Setup

1. From `backend/`, run `npm run db:generate` and `npm run db:migrate:deploy`. This adds two tables without modifying existing appointments. Back up production databases before deployment.
2. Generate a 32-byte key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it as `WHATSAPP_TOKEN_ENCRYPTION_KEY` in backend secrets / your ignored local `.env`. Keep a secure backup: changing the key makes existing tokens unreadable until re-provisioned. Never use a NEXT_PUBLIC variable.
3. Set `WHATSAPP_GRAPH_VERSION` to a supported version for your Meta app (default `v23.0`).
4. In the backend environment set:

```dotenv

WHATSAPP_PROVISION_WABA_ID=<WhatsApp Business Account ID>
WHATSAPP_PROVISION_PHONE_NUMBER_ID=<Phone number ID>
WHATSAPP_PROVISION_ACCESS_TOKEN=<Meta system-user access token>
WHATSAPP_PROVISION_TEMPLATE_NAME=<approved template name>
WHATSAPP_PROVISION_TEMPLATE_LANGUAGE=en_US
```

5. Run `npm run whatsapp:provision` from `backend/`. This verifies via Meta that the token can access the WABA, that the phone belongs to it, and that the selected template/language is approved. It then encrypts the token using AES-256-GCM bound to the clinic and creates/updates that clinic's connection. It sends no message. A number already assigned to another clinic is rejected.
6. Remove the one-time `WHATSAPP_PROVISION_*` variables from the environment after provisioning. Keep the encryption key and API version. Restart the backend so removed provisioning secrets are not retained in its process environment.
7. Open a branch dashboard as a clinic admin and open **Profile Settings > WhatsApp**. Confirm the sender and template body. Configuration reflects the last provisioning verification, not a live health check.

The access token needs messaging permission to send and account-management permission to verify the WABA/templates. Grant the system user access to the correct assets. Use a current token; never commit it or show it in recordings. Provisioning does not subscribe webhooks or replace your existing n8n callback.

## Template support

One configured template per clinic. Supports up to 10 consecutive positional body variables `{{1}}`, `{{2}}`, etc. Optional static text header/footer are allowed; the UI preview shows the BODY only. Named variables, media headers and button templates are deliberately rejected. The sender cannot choose another template, phone-number ID or arbitrary recipient through the API.

Use an approved template from your real account. Meta's sample `hello_world` may be available for test numbers; do not assume it exists for a production number. If approval/status/content changes, re-provision. Runtime Meta rejection is shown as a sanitized code, not raw provider text.

## Appointment reminder template for the review recording

Create this template in WhatsApp Manager and submit it for template review before recording a send from Tootica. This is a draft for submission; it has not been submitted or approved by Meta.

- **Name:** `tootica_appointment_reminder`
- **Requested category:** Utility
- **Language:** English (US), `en_US`
- **Variables:** Numbered / positional
- **Header, footer and buttons:** None

**Body (copy exactly):**

```text
Hello {{1}}, this is a reminder of your appointment at {{2}} on {{3}} at {{4}}.
Clinic location: {{5}}.
Please contact the clinic if you need to change your appointment. Thank you.
```

Use fictional sample values for template review:

| Variable | Meaning | Sample value |
| --- | --- | --- |
| `{{1}}` | Patient name | Alex |
| `{{2}}` | Clinic name | Demo Dental Clinic |
| `{{3}}` | Appointment date | 5 November 2026 |
| `{{4}}` | Appointment time, including timezone | 10:30 AM IST |
| `{{5}}` | Clinic address | 12 Example Road, Bengaluru |

Use the actual clinic, location and appointment details when sending to a consented test patient. Only the first variable is prefilled by the current dialog; enter and verify the other four manually. Do not include treatment details in the reminder.

After the template/language is approved, set these values alongside the other provisioning variables from Setup and run `npm run whatsapp:provision` from `backend/`:

```dotenv
WHATSAPP_PROVISION_TEMPLATE_NAME=tootica_appointment_reminder
WHATSAPP_PROVISION_TEMPLATE_LANGUAGE=en_US
```

Provisioning selects this as the clinic's single configured template. Follow the recording steps below to show the appointment, completed variables, preview, consent confirmation, successful submission and received message. This is a manually sent reminder using the existing appointment dialog; scheduled reminders remain deferred. Template approval and App Review approval are separate outcomes.

## Send / record review video

1. Use a test patient who has consented, with an international phone number including country code. The app removes formatting, but cannot reliably infer or validate a missing country code.
2. Open **Appointments > row menu > WhatsApp message**. The dialog shows the selected patient and clinic sender. Existing **Open WhatsApp Web** remains available separately.
3. Fill template variables and check the body preview. The first variable is initially filled with the patient's name; change it if your template uses something else there. Confirm the patient agreed to receive this message, then select **Send template**.
4. The server rechecks user status/onboarding, clinic status, tenant and branch access. The recipient comes from the stored appointment/patient, not from browser input.
5. Show **Submitted to WhatsApp** and the same message arriving in WhatsApp Web/phone. Submission is not a delivery receipt. Record both Tootica and WhatsApp; keep credentials and other patients out of the recording. This demonstrates messaging only; it does not guarantee App Review approval or demonstrate template management.

The backend makes the Meta call, so a local Tootica UI can send without an incoming tunnel. The backend needs outbound internet access. Your n8n inbound conversation still needs its existing webhook/tunnel configuration independently.

## Reliability and audit

- Clinic-scoped UUID submission keys reserve an audit row before contacting Meta. Replaying the same key returns its previous outcome. Reusing a key for changed content returns 409. The browser retains the key when retrying an interrupted request while the dialog stays open.
- Database advisory locks serialize reservation/rate checks across processes. Phase 1 limits new attempts to 10 per clinic per minute. Duplicate lookups do not consume another attempt.
- `SUBMITTED`: Meta returned a message ID. `FAILED`: definite rejection. `UNKNOWN`: timeout, network failure or ambiguous response. `PENDING`: reserved/in progress, or process stopped before recording the result. No automatic network retries are performed.
- If a response is lost after Meta accepted it, the record may remain PENDING. Do not reset it and resend blindly. The UI blocks further sends for an appointment with a recent PENDING/UNKNOWN submission. An operator must reconcile the outcome using Meta/recipient evidence and the audit record before authorizing another attempt. Automated reconciliation is deferred to the webhook phase.
- The audit stores clinic, connection, appointment, sending user ID, recipient, template/language, parameters, consent-attestation time, submission key and result. User/connection IDs are snapshots, retained if those records change. Appointment deletion nulls its audit reference; deleting a clinic cascades its messages and connection. Establish an appropriate retention policy before wider production use.
- Clinic admin **Disconnect** blocks future requests and removes the encrypted token. It does not revoke the token at Meta or retract in-flight/submitted messages. Reconnection requires re-provisioning.

## Checks

```powershell
cd backend
npm run test:whatsapp
npm run typecheck
# Requires reachable Postgres and permission to create a temporary schema:
npm run test:whatsapp:db
```

The database suite uses a random isolated schema on `WHATSAPP_TEST_DATABASE_URL` (or local DATABASE_URL), applies migrations there and removes only that schema. It does not migrate/clear the application tables. Provider calls in automated tests are mocked; a real consented send is needed for end-to-end verification.

## Deferred

Embedded Signup, template creation/management, delivery/read webhook processing, multi-number branch routing, automatic booking reservations, reminders, cancellation and rescheduling. This Phase 1 feature is independent of the starter n8n workflow, which still creates pending requests through staff-session authentication.

The connected Profile Settings WhatsApp panel includes **Test from an appointment**, a shortcut to the appointments page. Choose an Upcoming appointment; pending requests use the separate accept/reject flow. The shortcut opens the page only and does not send a message.

## Account access

Superadmins control WhatsApp under **Clinics > Edit Clinic > Enable WhatsApp usage**. This applies to all users and branches in the clinic account. New clinics default to disabled; the migration preserves access for existing connected clinics. Disabling blocks template sends and incoming WhatsApp bookings without deleting saved credentials. In-flight messages may still arrive. Embedded signup is visible but disabled for now.
