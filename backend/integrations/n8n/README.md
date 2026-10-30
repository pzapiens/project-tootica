 # Tootica WhatsApp booking workflow

Import `tootica-whatsapp-booking.json` into n8n. It is inactive and contains no credentials. This is a low-volume booking-request starter using the existing repo API, not a live appointment reservation system.

## Where to connect

```text
Patient -> Meta WhatsApp Cloud API -> n8n WhatsApp Trigger
                                     -> Conversation
                                     -> Tootica login (on confirm / emergency)
                                     -> POST /api/appointments/whatsapp/inbound
                                     -> WhatsApp reply via Meta Graph API

Tootica staff -> Appointments -> WhatsApp Appointments -> accept / reject
```

The backend connection point is `backend/src/modules/appointments/routes.ts` and its `POST /whatsapp/inbound` route, mounted at `/api/appointments` in `backend/src/app.ts`. Validation is in `schema.ts`; creation is in `service.ts` in that module. The endpoint is authenticated, not a public Meta webhook. Do not point Meta directly at it.

`frontend/src/lib/whatsapp.ts` centralizes the existing click-to-chat links and manual inbound booking helper. These are currently `wa.me` links, not a configured Cloud API transport. This workflow connects server-to-server; it requires no frontend edit. Existing patient chat buttons open chats with those patients; they are not patient-facing links to the clinic bot. Share `https://wa.me/<YOUR_BUSINESS_NUMBER>` with patients to start the bot.

## Configure n8n

1. Import the JSON using n8n's Import from File option.
2. In **Conversation**, replace `backendUrl`, `clinic`, `staffPhone`, and `phoneNumberId`. Use the backend origin without `/api` or a trailing slash. `phoneNumberId` is Meta's numeric phone-number ID, not the WhatsApp telephone number. Use the ID as a string. Keep `timezone` and `utcOffset` aligned; defaults target India. Set `graphVersion` to a supported version for your Meta app.
3. On **WhatsApp Trigger**, create/select the WhatsApp OAuth2 credential using the Meta app ID and app secret. The app must have WhatsApp configured with a registered business number. Use a public HTTPS n8n webhook origin; for self-hosting configure its public webhook URL.
4. On **Send WhatsApp reply**, select an HTTP Header Auth credential: Name `Authorization`, Value `Bearer <META_ACCESS_TOKEN>`. Use an appropriate Meta system-user token with WhatsApp messaging access and the correct business assets. Keep tokens in credentials, never in the JSON.
5. On **Tootica login**, select an HTTP Custom Auth credential with this JSON (replace the values):

```json
{"body":{"identifier":"clinic-admin@example.com","password":"YOUR_PASSWORD"}}
```

Use a dedicated, active clinic account that has completed onboarding. The login route accepts `identifier`, not `email`. This workflow extracts the `access_token` from login's Set-Cookie response and sends it as a Cookie to the inbound endpoint. The repo does not accept a generic Bearer token on this endpoint. A normal clinic account scopes the request to its clinic. Do not use a super-admin account: those require additional tenant headers. No JWT secret or database password is needed by n8n.

6. Ensure n8n can reach the backend. With local n8n use `http://localhost:4000`; from Docker Desktop use `http://host.docker.internal:4000` where appropriate. n8n Cloud needs a reachable HTTPS backend, not your computer's localhost.
7. Publish the workflow and subscribe the Meta app to the intended WhatsApp Business Account (WABA) and its `messages` events. Publishing registers the webhook URL but does not itself subscribe the app to the WABA. Follow n8n's trigger documentation linked below. Meta permits one webhook per app; switching test and production registrations replaces the previous URL.
8. Send a real message from an allowed test recipient to the configured business number. Initial message prompts for the name; the next message supplies it. Use an active/published workflow: static data does not persist across manual test executions.

## Behavior

- Full name -> three service buttons -> emergency Yes/No -> preferred-time list -> Confirm/Change.
- The four slot choices use a list: Today 5 PM, Tomorrow 10 AM, Tomorrow 4 PM, More options. Past times are omitted. More options collects a free-text preference for staff. Slot choices are preferences, not live availability.
- Confirm creates one pending WHATSAPP appointment through the existing API. Name, phone, and consultation type use existing fields; preferred time, urgency, clinic label, and Meta message ID are saved in `notes`. The backend still sets a zero-duration midnight placeholder and assigns no doctor.
- Yes to emergency immediately creates a pending request flagged `emergency: true` in notes, then provides the clinic number. This is a staff queue handoff, not a live agent integration or a staff push notification. Staff must monitor the queue; no emergency response SLA is implied.
- Change repeats service, urgency, and slot selection. START/RESTART starts a new request. Invalid inputs repeat the relevant prompt.
- CANCEL/RESCHEDULE sends a clinic contact link and clearly states the booking has not changed. These commands do not mutate appointments in this starter.
- Final text says **Request received**. It deliberately does not say **Booked** or promise a reminder: the current inbound endpoint only creates requests awaiting staff approval.
- Confirmed appointments are accepted by staff in the existing WhatsApp Appointments popup. Doctor-less pending bookings appear across the clinic's branches; this endpoint has no branch-routing field.

## Before production / exact requested Done message

The requested `Booked! We'll send a reminder...` message requires additional integration work:

1. Real slot lookup and an atomic reservation endpoint with availability, clinic/branch routing, duration, and duplicate protection. Existing `GET /api/appointments/availability` is a lookup; a lookup alone does not reserve a slot. Store the actual start/end times and return a confirmed appointment ID before saying Booked.
2. Durable per-sender state and a message-ID inbox/outbox with uniqueness constraints. This starter uses experimental n8n workflow static data, retains sessions and message IDs for 24 hours, and assumes serialized, low-volume executions. Configure production concurrency to one for this starter (or isolate it in an instance with concurrency one); do not use multiple workers. Replace this storage with Postgres or a suitable durable store for real traffic. It does not guarantee exactly-once creation: backend success followed by a failed WhatsApp send or execution persistence can create duplicates on replay. Do not automatically retry the create request.
3. Authenticated appointment ownership checks for CANCEL/RESCHEDULE, with patient selection when multiple appointments exist. Keep the appointment ID in durable state; call a clinic-scoped update endpoint only after validating sender ownership. The current workflow intentionally directs these requests to staff.
4. A reminder scheduler that reads confirmed appointments, checks consent and cancellation status, stores a unique reminder key, and uses an approved WhatsApp template when required outside the customer service window. There is no reminder scheduler in this workflow.
5. Configure n8n failure alerts and execution retention: login responses contain session cookies, and error executions can contain patient details. Successful execution payloads are disabled in the import. Restrict workflow access and purge error data under your retention policy.

## Verify / edit

Run `node backend/integrations/n8n/check-workflow.cjs` from the repo root. These checks execute the real embedded conversation code using simulated n8n state and payloads; they make no network requests. They do not validate live Meta credentials, n8n import compatibility, or backend connectivity. After configuration, verify an actual request appears in the correct clinic's WhatsApp Appointments popup and test a failed login/create: neither may send a success reply.

Edit `conversation.js`, then run `python backend/integrations/n8n/build-workflow.py` to regenerate the import JSON. Configuration edits made only inside n8n must be reapplied after a fresh import. Do not commit credentials or exports containing patient state.

## Official references

- [n8n WhatsApp Trigger and WABA subscription](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.whatsapptrigger/)
- [n8n WhatsApp credentials](https://docs.n8n.io/integrations/builtin/credentials/whatsapp/)
- [n8n static data limitations](https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/)
- [HTTP custom authentication](https://docs.n8n.io/integrations/builtin/credentials/httprequest/)
- [Meta interactive message formats](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/)


## Sending from the Tootica UI

Phase 1 outbound template messaging now lives in the appointment Chat dialog, with connection status under Clinic settings. It uses the backend directly and does not use this workflow. See [the Phase 1 setup and recording guide](../../docs/WHATSAPP_PHASE1.md).
