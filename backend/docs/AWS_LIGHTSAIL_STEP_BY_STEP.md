# Move Tootica to AWS Lightsail: step by step

Updated 10 November 2026. For 1-3 clinics and up to 50 staff, in Mumbai (`ap-south-1`). Use this alongside the [architecture, cost and recovery plan](AWS_PRODUCTION_MIGRATION.md).

**Start with step 1. The application is not ready for production deployment yet.** This runbook describes the work and order; it does not provision AWS or implement the missing code. Resource creation starts billing.

## 1. Prepare a production release before buying infrastructure

Developer work required:

- Add S3 storage for patient documents and profile photos, including authorised downloads and existing file-key compatibility.
- Replace the in-memory OTP Map with PostgreSQL-backed expiry, limits and atomic one-time verification. Add shared login/OTP rate limits.
- Add Linux Dockerfiles, a production Compose file and Caddy configuration. Build reviewed images outside the live 4 GB server.
- Configure verified PostgreSQL TLS, separate runtime/migration DB roles, a small connection pool, readiness checks and production secret validation.
- Configure secure cookies, the controlled proxy hop, exact allowed origin and `TZ=Asia/Kolkata`. Disable the frontend development API rewrite for this deployment.
- Test production builds, clinic isolation, uploads, OTP behaviour across restarts and backup restoration.

The release must deliver `compose.production.yml` with services named `frontend`, `backend`, `caddy` and a one-shot `migrate` service. The migration image needs Prisma CLI and the complete migrations directory. Runtime images alone may omit these tools. Provide PostgreSQL 16 client tools separately for import.

**These production files/services do not exist yet.** Commands below using them apply only after this release is built and reviewed. The existing `backend/docker-compose.yml` is for local PostgreSQL/MailHog.

## 2. Prepare account, domain and launch data

1. Sign into AWS with a named administrator identity and enable MFA.
2. Choose Mumbai for every resource in this guide.
3. Confirm access to the DNS provider for `tootica.com`; use `app.tootica.com` for the app.
4. Create AWS billing alerts at INR 8,000, 10,000 and 12,000, with actual and forecast notifications. Alerts do not stop spending; track messaging charges separately.
5. Decide whether to import existing data or launch an empty clinic database. Remove demo data through an audited cleanup before export; do not copy sample patients to production.
6. Save the release commit, operator contact and recovery procedure.

Budget model: 4 GB server USD 24/month, encrypted managed database USD 30/month, plus storage/backups/operations allowances. The current total estimate is about **INR 9,183/month**, using INR 95/USD, modeled 18% GST and INR 1,000 messaging allowance. It is not a fixed invoice. [AWS pricing](https://aws.amazon.com/lightsail/pricing/)

## 3. Create the application server

In the [Lightsail console](https://lightsail.aws.amazon.com/):

1. Open **Instances > Create instance**.
2. Select **Mumbai**, then **Linux/Unix > OS Only > Ubuntu LTS**. Use a currently supported LTS offered in the console.
3. Choose a bundle with public IPv4: **4 GB RAM, 2 vCPUs**, currently USD 24/month.
4. Name it `tootica-prod-app`; add project/environment tags.
5. Save the SSH connection details and private key securely, then create the instance.

Select the virtual machine product, rather than Lightsail Container Service. Start with one VM; this budget provides manual recovery if it fails.

## 4. Attach a fixed IP and configure networking

1. Open **Networking > Create static IP**.
2. Choose Mumbai, attach it to `tootica-prod-app`, and name it `tootica-prod-ip`.
3. Record the static IPv4 address.
4. In the instance **Networking** tab, allow TCP 80 and 443 publicly.
5. Restrict TCP 22 to the administrator's public IP. Test your own SSH connection before removing other SSH access.
6. Keep 3000, 4000 and 5432 closed to the internet. Apply equivalent IPv6 restrictions if IPv6 is enabled.

The static address keeps DNS stable across server stops/restarts. [AWS static IP procedure](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html)

## 5. Install Docker on the server

Connect through SSH. Install Docker Engine and the Compose plugin using [Docker's Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/), including the official apt repository.

Run these checks **on the Ubuntu server**:

```bash
sudo docker version
sudo docker compose version
sudo systemctl enable --now docker
sudo install -d -m 700 /opt/tootica /opt/tootica/secrets /opt/tootica/import
```

Install security updates and document reboots. The production Compose file must restart application services automatically and limit log growth. Only Caddy publishes host ports 80/443; application containers communicate internally.

## 6. Create the managed PostgreSQL database

1. In Lightsail, open **Databases > Create database**.
2. Select Mumbai, preferably the app server's Availability Zone.
3. Select **PostgreSQL 16** if offered. Confirm the regional engine choice before purchasing; the source is PostgreSQL 16, so do not select an older major version.
4. Choose the **2 GB Standard plan with data encryption**, currently USD 30/month.
5. Set the master database name to `tootica`; name the resource `tootica-prod-db`. Store generated credentials in your password manager.
6. Wait for **Available**. In **Networking**, keep **Public mode OFF**.
7. Record the endpoint, port and database name. Configure the restricted application and migration roles prepared in step 1.

Connect from the Lightsail server, using PostgreSQL 16 client tools and the current AWS database CA bundle. Verify hostname/certificate validation with `sslmode=verify-full`; mount the CA into the application and migration containers. Do not use the master user for normal application requests.

The selected database is separate from the VM. [Create database](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database.html), [private access](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-configuring-database-public-mode.html), [verified TLS](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-connecting-to-postgres-database-using-ssl.html), [CA download](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-download-ssl-certificate-for-managed-database.html).

## 7. Create the private file bucket

1. In the **Amazon S3 console**, create a globally unique bucket such as `tootica-prod-files-ACCOUNTID` in Mumbai.
2. Keep **Block Public Access ON**, ACLs disabled, default encryption enabled and versioning enabled.
3. Set a reviewed retention/lifecycle policy for old versions, consistent with the clinic's retention needs.
4. Give the backend a dedicated identity limited to required object read/write/delete operations in this bucket. Give the migration operator separate listing/upload permissions.
5. Configure the S3 adapter delivered in step 1 with this bucket and region. Test credential rotation.

Lightsail bucket attachment does not automatically grant access to an Amazon S3 bucket. Use the credential arrangement defined in the production release; keep AWS credentials backend-only and protected outside the checkout.

## 8. Set production configuration and provider settings

Copy the release's reviewed configuration templates to `/opt/tootica`. Keep secrets in root-owned files under `/opt/tootica/secrets`, readable only by the required operator/container user.

Set existing backend configuration:

| Setting | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `4000`, internal Docker network only |
| `CORS_ORIGIN` | `https://app.tootica.com` |
| `TZ` | `Asia/Kolkata` |
| `DATABASE_URL` | Managed DB endpoint, runtime role and verified TLS configuration |
| JWT access/refresh/action secrets | New independently generated production values |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.zeptomail.in` / `587` with STARTTLS |
| `SMTP_USER` / `SMTP_PASSWORD` | `emailapikey` / protected ZeptoMail credential |
| `MAIL_FROM` | `Tootica <noreply@tootica.com>` |
| MSG91 key/template | Protected provider values; allowlist the static outgoing IP if required |

Add the S3/OTP/TLS settings actually implemented by step 1; those variable names are not defined in today's app. The frontend gets no DB or provider secrets. Preserve the WhatsApp encryption key when importing existing encrypted tokens. Change development administrator passwords before opening access.

## 9. Build and transfer the release

1. Build Linux images for the chosen server architecture in CI or a separate builder. Install dependencies from lockfiles and generate Prisma there.
2. Push frontend, backend and migrator images to a private registry.
3. Copy the reviewed Compose/Caddy/configuration files to `/opt/tootica`.
4. Authenticate the server to the registry with a scoped deployment identity; use image tags tied to the reviewed commit or immutable digests.
5. Pull the images. Do not build the app on the live 4 GB VM.

Run **on Ubuntu**, after the planned Compose file exists:

```bash
cd /opt/tootica
sudo docker compose -f compose.production.yml pull
```

## 10. Rehearse database and file migration

Use a temporary protected environment with its own DB/bucket and a short retention period. Prefer synthetic data for early tests; protect any real-data rehearsal. Use rehearsal-only connection settings and files for steps 10-13; never point them at the final production dataset. Keep temporary AWS spending within the USD 20 first-month allowance and remove resources after validation.

For an existing-data migration, export the local Docker database. Run **in Windows PowerShell**, with Docker Desktop running; change names if your local setup differs:

```powershell
$backupDir = Join-Path $env:USERPROFILE 'TooticaMigration'
New-Item -ItemType Directory -Force -Path $backupDir
docker exec tootica-postgres pg_dump -U tootica -d tootica -Fc -f /tmp/tootica-lightsail.dump
docker cp tootica-postgres:/tmp/tootica-lightsail.dump "$backupDir\tootica-lightsail.dump"
Get-FileHash -Algorithm SHA256 "$backupDir\tootica-lightsail.dump"
```

Check every command succeeds. Keep this patient-data archive outside Git. Transfer it over SSH to the protected import directory and compare its SHA-256 at the destination.

Restore **from the VM/private runner**, using PostgreSQL 16 client tools and a securely supplied connection (endpoint, migration role, password, database and verified CA). Set the libpq connection settings `PGHOST`, `PGPORT`, `PGUSER`, `PGSSLMODE=verify-full` and `PGSSLROOTCERT` for the approved target. Supply the password via a protected `PGPASSFILE` (mode 600), rather than a command-line argument. The following assumes those settings are already configured:

```bash
pg_restore --no-owner --no-acl --exit-on-error --dbname=tootica /protected/path/to/tootica-lightsail.dump
```

Restore into an **empty target** before applying pending migrations: the full archive already contains tables and `_prisma_migrations`. Review restored object ownership and runtime grants. Keep backup operations enabled for a small import; AWS data-import mode suspends backups and deletes emergency restore history.

Copy the **contents** of the actual configured upload root to the root of the S3 bucket with an authorised operator identity:

```text
aws s3 sync "ACTUAL_UPLOAD_ROOT" s3://YOUR_BUCKET/ --dryrun
aws s3 sync "ACTUAL_UPLOAD_ROOT" s3://YOUR_BUCKET/
```

Preserve stored keys: `<clinicId>/<file>` and `avatars/<userId>/<file>`. Do not add an extra `uploads/` prefix. Avoid `--delete`. Compare DB references, object counts/bytes and downloaded-content hashes; the copy command alone does not prove completeness. [S3 sync](https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html)

For an **empty launch**, skip the restore/file import, apply migrations, then provision only the approved clinic/staff/superadmin accounts. Do not run demo seeding scripts in production.

## 11. Apply migrations and start the app

Run **on Ubuntu**, once step 1's services exist and the target data is ready:

```bash
cd /opt/tootica
sudo docker compose -f compose.production.yml run --rm migrate npm run db:migrate:deploy
sudo docker compose -f compose.production.yml run --rm migrate npx prisma migrate status
sudo docker compose -f compose.production.yml up -d frontend backend caddy
sudo docker compose -f compose.production.yml ps
```

Require every migration to succeed before starting normal traffic. Use `migrate deploy`; never `migrate dev` or `migrate reset` against production. Check dependency readiness and sanitized startup logs.

## 12. Configure DNS and HTTPS for testing

1. Use a temporary hostname, for example `staging.tootica.com`, for the rehearsal. Point its A record at the test server's static IP; set Caddy and the allowed origin to that exact hostname.
2. Caddy routes `/api` and `/api/*` to `backend:4000`, and other paths to `frontend:3000`; preserve the `/api` prefix.
3. Keep Caddy certificate data on a persistent volume. Verify a valid HTTPS certificate and renewal configuration.
4. At launch, set the production hostname/origin to `app.tootica.com` and create or update its **A record** at the current DNS provider.
5. Leave email MX, SPF, DKIM and DMARC records intact. Add an AAAA record only if IPv6 is configured and tested.

Use Caddy's certificates for the VM. This design does not need a paid load balancer for HTTPS. [Caddy HTTPS requirements](https://caddyserver.com/docs/automatic-https)

## 13. Complete acceptance checks before the final move

- Password login, matching/nonmatching phone login, OTP expiry/limits and verification after backend restart.
- Actual ZeptoMail/MSG91 delivery to approved test recipients.
- Clinic/branch isolation; document and avatar upload/download/delete after restart.
- Appointments, conflict handling, India date boundaries and five clinic favourites.
- Large uploads through HTTPS, secure cookies, logout and optional WhatsApp.
- Representative load: initially 10 active users and a 25-user burst; monitor memory, disk, latency and CPU credits. Fifty staff accounts do not mean fifty concurrent heavy sessions.
- Restore a database backup and an S3 object version; restore a VM snapshot and reattach its static IP.

Record timings and results. Keep the live source unchanged until the rehearsal passes.

## 14. Freeze writes and switch production

1. Agree a maintenance window based on the measured rehearsal.
2. Stop all old writers, including API/background integrations, and block new bookings on the old system.
3. Take the final DB dump and upload-file delta; restore to a fresh empty production target, apply pending migrations and repeat consistency checks.
4. Update production DNS/Caddy/origin settings. If this is a new hostname, create it now; for an existing hostname, lower its TTL ahead of the window.
5. Verify production HTTPS, login and one controlled real appointment.
6. Enable normal writes only on AWS. Keep the old source frozen and retain the final backup under the agreed policy.

Before new AWS writes, rollback to the frozen source is possible after checks. After new writes, reverting DNS to an older database loses data: keep the current database when reverting compatible app images, or freeze and reconcile the latest data/files first.

## 15. Enable recovery and watch the first week

Enable VM snapshots, DB backup checks, bounded logs, CPU/memory/disk monitoring and HTTPS availability alerts. Assign an operator for patching, restarts and incidents.

Lightsail DB point-in-time restore covers the past **seven days**, in five-minute increments; test it and keep any longer-retention backups separately. [AWS restore procedure](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database-from-point-in-time-backup.html)

Review costs daily during launch and weekly afterwards. Remove rehearsal resources; keep protected backups according to retention policy. Start on the 4 GB plan and consider 8 GB only if measured use requires it and the updated forecast stays within INR 12,000.

Allow **7-10 working days** for the complete migration, including the application work, rehearsal and launch. AWS provisioning itself is only part of that time.
