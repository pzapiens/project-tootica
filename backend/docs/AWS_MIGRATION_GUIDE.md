# Tootica → AWS: Detailed Migration Guide (start to end)

A single, do-everything runbook for moving the Tootica backend (Express + Prisma)
and frontend (Next.js) onto AWS. It consolidates and makes concrete the two
background docs:

- [`AWS_MIGRATION.md`](./AWS_MIGRATION.md) — the architecture & *why* each AWS
  service was chosen.
- [`AWS_NEXT_STEPS.md`](./AWS_NEXT_STEPS.md) — the high-level checklist.

**This file is the detailed *how*** — real code diffs for the four seams, real
IaC, exact CLI commands, and an end-to-end verification pass.

> **The one thing to understand first:** the app is already migration-ready.
> `src/lambda.ts` wraps the *same* Express app as `src/server.ts` via
> `serverless-http`. Prisma 7 uses a driver adapter (no Rust engine binary).
> Every place AWS differs — file storage, OTP store, email, secrets, DB endpoint
> — is already behind an interface or `env.ts`. **This is an infrastructure +
> four-adapter exercise, not a rewrite. No business logic changes.**

**Region** assumed `ap-south-1` (Mumbai — India data residency). Change to suit.
Placeholders look like `<ACCOUNT_ID>`, `<ENV>` (= `staging` | `prod`).

---

## Table of contents

0. [Prerequisites & decisions to lock](#phase-0--prerequisites--decisions-to-lock)
1. [Target architecture](#target-architecture)
2. [Phase 1 — Code changes (the four seams)](#phase-1--code-changes-the-four-seams)
3. [Phase 2 — Bundle & test the Lambda locally](#phase-2--bundle--test-the-lambda-locally)
4. [Phase 3 — Provision AWS infrastructure (IaC)](#phase-3--provision-aws-infrastructure-iac)
5. [Phase 4 — Database migration to RDS](#phase-4--database-migration-to-rds)
6. [Phase 5 — Deploy the backend](#phase-5--deploy-the-backend)
7. [Phase 6 — Host the frontend](#phase-6--host-the-frontend)
8. [Phase 7 — DNS cutover](#phase-7--dns-cutover)
9. [Phase 8 — End-to-end verification](#phase-8--end-to-end-verification)
10. [Rollback](#rollback)
11. [Cost sketch](#cost-sketch)
12. [Appendix — full env var matrix](#appendix--full-env-var-matrix)

---

## Phase 0 — Prerequisites & decisions to lock

**Tools on your machine:**

```bash
aws --version          # AWS CLI v2
node --version         # >= 20
npm i -g aws-cdk        # if using CDK (this guide's default IaC)
aws configure           # or: aws sso login --profile tootica
```

**Lock these five decisions before touching anything:**

| Decision | Recommended | Notes |
| --- | --- | --- |
| **Account & region** | `ap-south-1` | India data residency. One account, two stacks (staging/prod), *or* two accounts. |
| **Database** | RDS for PostgreSQL 16, Multi-AZ | Aurora Serverless v2 if you want autoscaling; Prisma connects identically. **Always front with RDS Proxy.** |
| **Lambda granularity** | **One function** = whole Express app | Don't split per-route yet. See `AWS_MIGRATION.md` §4 for when to revisit. |
| **Domains** | `api.tootica.com` + `app.tootica.com` | Same registrable domain → cookies stay simple. |
| **IaC tool** | **AWS CDK (TypeScript)** | This guide uses CDK. SST/OpenNext or Serverless Framework also fine — the app doesn't care. |

**Cookie model — pick one now, it changes 2.5:**

- **(A) Same-origin proxy (simplest, recommended).** The Next.js frontend keeps
  rewriting `/api/*` to the backend, so the browser only ever talks to
  `app.tootica.com`. Cookies stay first-party `SameSite=Lax`. **No cookie code
  changes.**
- **(B) Cross-subdomain.** Browser calls `api.tootica.com` directly. Requires
  `Domain=.tootica.com; SameSite=None; Secure` cookies and CORS with
  `credentials:true`. More moving parts.

This guide assumes **(A)** and notes the (B) delta where relevant.

---

## Target architecture

```
                         Route 53  (tootica.com)
                              │
            ┌─────────────────┴──────────────────┐
            ▼                                     ▼
   app.tootica.com                        api.tootica.com
   Amplify Hosting (Next.js SSR)          API Gateway HTTP API (v2)
       │  rewrites /api/*  ───────────────────────▶│
       │  (same-origin cookies, model A)            ▼
       │                                   Lambda: dist/lambda.handler
       │                                   (serverless-http → Express)
       │                                   VPC private subnets · Node 20
       │                      ┌──────────────┬──────────┬──────────────┐
       │                      ▼              ▼          ▼              ▼
       │                 RDS Proxy      DynamoDB    Amazon SES    Secrets Mgr
       │                      ▼         (OTP + TTL)  (email)      (JWT, DB URL)
       │                 RDS Postgres 16
       │                 (Multi-AZ, private)
       ▼
   S3 (patient-document uploads, private)  ◀── Lambda GetObject/PutObject
```

| Local today | AWS target |
| --- | --- |
| `server.ts` / `app.listen` | `lambda.ts` behind **API Gateway HTTP API** |
| Docker Postgres | **RDS Postgres** via **RDS Proxy** |
| Local disk `uploads/` | **S3** (private bucket) |
| In-memory `OtpStore` | **DynamoDB** (per-item TTL) |
| Nodemailer → MailHog | **Amazon SES** |
| `.env` file | **Secrets Manager** |
| Console logs | **CloudWatch Logs** |

---

## Phase 1 — Code changes (the four seams)

Do all of this **in a branch, in this repo, before provisioning anything.** Each
change is gated on an env var so **local dev keeps working unchanged** (MailHog,
local disk, in-memory OTP). Install the AWS SDK clients you'll need:

```bash
cd backend
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner \
      @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb \
      @aws-sdk/client-ses @aws-sdk/client-secrets-manager
```

### 1.0 — Extend `env.ts` with the new switches

Add to the `env` object in `src/config/env.ts`:

```ts
  // ── AWS adapter selection (default to local behaviour) ──────────────
  storageDriver: process.env.STORAGE_DRIVER ?? 'local',   // 'local' | 's3'
  s3Bucket: process.env.S3_BUCKET ?? '',
  otpStoreDriver: process.env.OTP_STORE ?? 'memory',       // 'memory' | 'dynamodb'
  otpTable: process.env.OTP_TABLE ?? '',
  emailDriver: process.env.EMAIL_DRIVER ?? 'smtp',         // 'smtp' | 'ses'
  awsRegion: process.env.AWS_REGION ?? 'ap-south-1',
```

And make the cookie options domain-aware (needed only for cookie model **B**;
harmless for **A** since `COOKIE_DOMAIN` is unset locally):

```ts
export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.COOKIE_SAMESITE ?? 'lax') as 'lax' | 'none',
  domain: process.env.COOKIE_DOMAIN || undefined,  // e.g. '.tootica.com' for model B
  path: '/',
};
```

### 1.1 — File storage → S3  ⚠️ required

Lambda has no persistent disk (only ephemeral `/tmp` wiped between cold starts),
so the local-disk uploader **cannot** work in AWS. This is the one seam you
*must* swap.

The storage module is consumed as a namespace import in
`src/modules/records/controller.ts`:

```ts
import * as storage from '../../common/storage/fileStorage';
// uses: storage.save, storage.exists, storage.createStream, storage.remove
```

Refactor `src/common/storage/fileStorage.ts` so each function dispatches on
`env.storageDriver`. The local branch is the existing code verbatim; add an S3
branch. The S3 download path returns a **presigned GET URL** (recommended — the
bytes never pass through Lambda, saving memory/time) rather than streaming.

```ts
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand,
  HeadObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';

const useS3 = env.storageDriver === 's3';
const ROOT = path.resolve(env.uploadDir);
const s3 = useS3 ? new S3Client({ region: env.awsRegion }) : null;

function keyFor(clinicId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 12);
  return `${clinicId}/${randomUUID()}${ext}`;
}

export async function save(clinicId: string, buffer: Buffer, originalName: string): Promise<string> {
  const key = keyFor(clinicId, originalName);
  if (useS3) {
    await s3!.send(new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: buffer }));
    return key;
  }
  const abs = path.join(ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return key;
}

/** Local-only; confines key to ROOT. */
export function resolvePath(key: string): string {
  const abs = path.resolve(ROOT, key);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) throw new Error('Invalid storage key');
  return abs;
}

export async function exists(key: string): Promise<boolean> {
  if (useS3) {
    try { await s3!.send(new HeadObjectCommand({ Bucket: env.s3Bucket, Key: key })); return true; }
    catch { return false; }
  }
  return existsSync(resolvePath(key));
}

/** S3: a short-lived presigned GET URL. Local: `undefined` (stream instead). */
export async function presignedUrl(key: string): Promise<string | undefined> {
  if (!useS3) return undefined;
  return getSignedUrl(s3!, new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }), { expiresIn: 60 });
}

/** Local-only streaming fallback. */
export function createStream(key: string): NodeJS.ReadableStream {
  return createReadStream(resolvePath(key));
}

export async function remove(key: string): Promise<void> {
  if (useS3) {
    await s3!.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key })).catch(() => {});
    return;
  }
  try { await unlink(resolvePath(key)); } catch { /* already gone */ }
}
```

> Note `exists` is now **async** (S3 `HeadObject`). Update the one caller in
> `records/controller.ts` `downloadDocument`:

```ts
// before: if (!storage.exists(doc.storageKey)) { …404… }
if (!(await storage.exists(doc.storageKey))) {
  res.status(404).json({ error: { message: 'File not found' } });
  return;
}

const url = await storage.presignedUrl(doc.storageKey);
if (url) {
  res.redirect(url);            // S3: hand the browser a presigned URL
  return;
}
// local disk: stream as before
res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
storage.createStream(doc.storageKey).pipe(res);
```

### 1.2 — OTP store → DynamoDB

`src/modules/auth/otpStore.ts` already defines the `OtpStore` interface and
exports an `otpStore` singleton (used in `auth/service.ts`). Add a DynamoDB impl
and pick at export time. The table stores each record with an `expiresAt` number
attribute wired as the DynamoDB **TTL attribute** so expired OTPs auto-delete.

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../../config/env';

// … keep OtpRecord, OtpStore, InMemoryOtpStore exactly as-is …

class DynamoOtpStore implements OtpStore {
  private readonly doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: env.awsRegion }));

  async get(key: string): Promise<OtpRecord | undefined> {
    const r = await this.doc.send(new GetCommand({ TableName: env.otpTable, Key: { pk: key } }));
    return r.Item as OtpRecord | undefined;
  }

  async set(key: string, record: OtpRecord): Promise<void> {
    await this.doc.send(new PutCommand({
      TableName: env.otpTable,
      // `ttl` in epoch *seconds* for DynamoDB TTL; record.expiresAt is epoch ms.
      Item: { pk: key, ...record, ttl: Math.ceil(record.expiresAt / 1000) },
    }));
  }

  async delete(key: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: env.otpTable, Key: { pk: key } }));
  }
}

export const otpStore: OtpStore =
  env.otpStoreDriver === 'dynamodb' ? new DynamoOtpStore() : new InMemoryOtpStore();
```

### 1.3 — Email → SES

`src/common/email/emailProvider.ts` exports the `EmailProvider` interface and an
`emailProvider` singleton (used by `accountEmails.ts` and `auth/service.ts`). Add
an SES impl.

```ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
// … keep EmailMessage, EmailProvider, NodemailerEmailProvider as-is …

class SesEmailProvider implements EmailProvider {
  private readonly ses = new SESClient({ region: env.awsRegion });
  async send(message: EmailMessage): Promise<void> {
    await this.ses.send(new SendEmailCommand({
      Source: env.smtp.from,                      // reuse MAIL_FROM (must be SES-verified)
      Destination: { ToAddresses: [message.to] },
      Message: {
        Subject: { Data: message.subject },
        Body: {
          ...(message.text ? { Text: { Data: message.text } } : {}),
          ...(message.html ? { Html: { Data: message.html } } : {}),
        },
      },
    }));
  }
}

export const emailProvider: EmailProvider =
  env.emailDriver === 'ses' ? new SesEmailProvider() : new NodemailerEmailProvider();
```

> Alternative with **zero code change**: SES also speaks SMTP. Generate SES SMTP
> credentials and just set `SMTP_HOST=email-smtp.ap-south-1.amazonaws.com`,
> `SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASSWORD` to the SES creds. Keep
> `EMAIL_DRIVER=smtp`. Simpler, but the SDK path above is cleaner for IAM.

### 1.4 — Secrets → Secrets Manager

Two options; **(a) is simpler and this guide uses it.**

- **(a) Inject at deploy.** Your IaC reads the secret and sets Lambda env vars
  from it. `env.ts` is unchanged — it just reads `process.env`. (CDK snippet in
  Phase 3 does this.)
- **(b) Fetch at cold start.** Add a tiny bootstrap at the top of `lambda.ts`
  that pulls a JSON secret and merges it into `process.env` **before** anything
  imports `env.ts`:

```ts
// src/lambda.ts (option b)
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function loadSecrets() {
  if (!process.env.SECRETS_ARN) return;
  const sm = new SecretsManagerClient({});
  const { SecretString } = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRETS_ARN }));
  Object.assign(process.env, JSON.parse(SecretString ?? '{}'));
}
const ready = loadSecrets().then(async () => {
  const { createApp } = await import('./app');       // import AFTER secrets land
  const serverless = (await import('serverless-http')).default;
  return serverless(createApp());
});
export const handler = async (event: unknown, context: unknown) => (await ready)(event, context);
```

### 1.5 — Cookies & CORS

- **Model A (same-origin proxy):** nothing to do. Frontend rewrites `/api/*`;
  cookies are first-party `SameSite=Lax`. CORS is a non-issue.
- **Model B (cross-subdomain):** set Lambda env `COOKIE_DOMAIN=.tootica.com`,
  `COOKIE_SAMESITE=none`, `CORS_ORIGIN=https://app.tootica.com`. Pick **one** CORS
  owner — the Express `cors` middleware (already present) *or* API Gateway CORS,
  never both, or you get duplicated headers.

### 1.6 — Verify local dev still works

With none of the new env vars set, drivers default to local. Confirm nothing
regressed:

```bash
cd backend
npm run typecheck && npm run lint
docker compose up -d
npm run dev          # login, request reset (MailHog), upload a doc → all still local
```

Commit the branch. **Code work is done** — everything below is infra/ops.

---

## Phase 2 — Bundle & test the Lambda locally

Add an esbuild bundle script so CI produces a single deployable file. The Prisma
client is **gitignored and generated**, so `prisma generate` must run before
bundling.

```jsonc
// backend/package.json → scripts
"bundle": "npm run db:generate && esbuild src/lambda.ts --bundle --platform=node --target=node20 --outfile=dist/lambda.js --external:@prisma/client"
```

Test the handler locally without AWS using the AWS SAM CLI or `serverless-offline`:

```bash
npx serverless-offline            # or: sam local start-api
curl localhost:3000/api/health    # → { "status": "ok" }
```

---

## Phase 3 — Provision AWS infrastructure (IaC)

Create a CDK app under `backend/infra/` (`cdk init app --language typescript`).
Below is the **shape** of the stack — the resources and how they wire together.
Fill in VPC/subnet details for your account.

```ts
// infra/lib/tootica-stack.ts (abridged — the resources that matter)
import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2, aws_rds as rds, aws_s3 as s3, aws_dynamodb as ddb,
  aws_secretsmanager as sm, aws_lambda_nodejs as lambda, aws_lambda as lambdaBase,
  aws_apigatewayv2 as apigw, aws_apigatewayv2_integrations as integ,
} from 'aws-cdk-lib';

export class TooticaStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, env: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Network — private subnets for RDS + Lambda; VPC endpoints avoid NAT cost.
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2, natGateways: 1 });
    [ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
     ec2.InterfaceVpcEndpointAwsService.SES]
      .forEach((svc, i) => vpc.addInterfaceEndpoint(`Ep${i}`, { service: svc }));
    vpc.addGatewayEndpoint('S3Ep', { service: ec2.GatewayVpcEndpointAwsService.S3 });
    vpc.addGatewayEndpoint('DdbEp', { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB });

    // 2. Database (Multi-AZ) + RDS Proxy (Lambda talks to the proxy, not the DB).
    const db = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      vpc, multiAz: env === 'prod', databaseName: 'tootica',
      credentials: rds.Credentials.fromGeneratedSecret('tootica'),
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    const proxy = db.addProxy('Proxy', { vpc, secrets: [db.secret!] });

    // 3. S3 (private) — patient documents.
    const bucket = new s3.Bucket(this, 'Uploads', {
      bucketName: `tootica-uploads-${env}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED, versioned: true,
    });

    // 4. DynamoDB OTP table with TTL on `ttl`.
    const otp = new ddb.Table(this, 'Otp', {
      tableName: `tootica-otp-${env}`,
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl', billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    // 5. App secrets (JWT, super-admin code). DATABASE_URL built from proxy below.
    const appSecret = new sm.Secret(this, 'AppSecret');  // populate JWT_* etc. out-of-band

    // 6. The API Lambda — the whole Express app.
    const fn = new lambda.NodejsFunction(this, 'Api', {
      entry: '../src/lambda.ts', handler: 'handler',
      runtime: lambdaBase.Runtime.NODEJS_20_X, memorySize: 1024,
      timeout: cdk.Duration.seconds(30), vpc,
      bundling: { commandHooks: {   // ensure `prisma generate` ran; ship the client
        beforeBundling: () => ['npm run db:generate'],
        afterBundling: () => [], beforeInstall: () => [],
      } },
      environment: {
        NODE_ENV: 'production',
        AWS_REGION_APP: 'ap-south-1',
        STORAGE_DRIVER: 's3', S3_BUCKET: bucket.bucketName,
        OTP_STORE: 'dynamodb', OTP_TABLE: otp.tableName,
        EMAIL_DRIVER: 'ses', MAIL_FROM: 'Tootica <no-reply@tootica.com>',
        CORS_ORIGIN: `https://app.tootica.com`,
        SECRETS_ARN: appSecret.secretArn,               // if using cold-start fetch
        // DATABASE_URL assembled from the proxy endpoint + db secret (see note).
        DATABASE_URL: `postgresql://tootica@${proxy.endpoint}:5432/tootica?schema=public`,
      },
    });

    // 7. Permissions (least privilege).
    bucket.grantReadWrite(fn);
    otp.grantReadWriteData(fn);
    appSecret.grantRead(fn);
    db.secret!.grantRead(fn);
    proxy.grantConnect(fn, 'tootica');
    fn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: ['*'] }));

    // 8. HTTP API (v2) in front of the Lambda.
    const api = new apigw.HttpApi(this, 'HttpApi', {
      defaultIntegration: new integ.HttpLambdaIntegration('Int', fn),
    });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
```

Deploy the infra (not the app logic yet — that's Phase 5, same `cdk deploy`):

```bash
cd backend/infra
npm ci
cdk bootstrap aws://<ACCOUNT_ID>/ap-south-1   # once per account/region
cdk deploy TooticaStack-staging
```

**Also do these console/CLI steps that aren't pure IaC:**

- **SES:** verify the sending domain (`tootica.com`) + add DKIM records; request
  **production access** (sandbox only emails verified addresses).
- **Secrets Manager:** put the real values into `appSecret` — `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `JWT_ACTION_SECRET`, `SUPER_ADMIN_DELETE_CODE`, and (if
  used) Twilio creds. Generate each secret:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- **ACM certs:** request `api.tootica.com` + `app.tootica.com` in `ap-south-1`
  (CloudFront certs must be `us-east-1`). Needed in Phases 6–7.

> **`DATABASE_URL` + RDS Proxy auth:** simplest is IAM auth on the proxy
> (`proxy.grantConnect`) with an IAM-token password, or inject the DB password
> from `db.secret` into the connection string at deploy. Either way the host is
> the **proxy endpoint**, never the DB. Keep the pg pool tiny per container
> (`?connection_limit=1`) — Lambda scales by adding containers, not pooling.

---

## Phase 4 — Database migration to RDS

The migration history is a **single squashed baseline**
(`prisma/migrations/20261006000000_init`). Applying it to a fresh RDS is one
command. Run from somewhere that can reach the DB — a bastion host, CloudShell in
the VPC, or a one-off CodeBuild job. Point `DATABASE_URL` at the **DB endpoint**
(not the proxy) for migrations to avoid proxy pinning quirks.

```bash
cd backend
npm ci
npm run db:generate
export DATABASE_URL="postgresql://tootica:<PW>@<RDS_ENDPOINT>:5432/tootica"
npm run db:migrate:deploy          # applies the single init baseline
npx prisma migrate status          # → "Database schema is up to date!"
```

**Seed:**

- **Staging / demo** (⚠️ both **wipe** existing data — never on prod with real data):
  ```bash
  npm run db:provision             # 1 super admin + 2 clinics × 2 branches + staff
  npm run db:seed:appointments     # sample patients + appointments
  ```
- **Production:** skip the seeds. Onboard the real super admin via a one-off
  script (a trimmed `db:provision` variant that creates only the super admin),
  then create clinics through the app UI.

---

## Phase 5 — Deploy the backend

The Lambda code ships with the same `cdk deploy` that made the infra (CDK bundles
`src/lambda.ts` via esbuild per the stack). To redeploy just the app after a code
change:

```bash
cd backend/infra
cdk deploy TooticaStack-staging       # rebundles + updates the function
```

Then smoke the raw API stage before any DNS:

```bash
curl https://<api-id>.execute-api.ap-south-1.amazonaws.com/api/health
# → { "status": "ok" }
```

- Confirm Lambda env vars resolved (CloudWatch Logs show no "Missing required
  environment variable" from `env.ts`).
- Tune cold starts only if the UX needs it: bump memory, or add **provisioned
  concurrency** on the function. VPC-attached Lambdas have higher cold-start
  latency — acceptable for an internal dashboard; revisit if not.

---

## Phase 6 — Host the frontend

The frontend is a **Next.js 16** app (SSR + dynamic routes) that proxies `/api/*`
to `BACKEND_ORIGIN` via `next.config.ts`.

- **Easiest: AWS Amplify Hosting** (native Next.js SSR). Connect the repo, set
  the build to the `frontend/` app, and set the env var:
  - `BACKEND_ORIGIN = https://api.tootica.com` (or the raw API URL until DNS is cut).
- Keeping the `/api/*` **rewrite preserves the same-origin cookie model (A)** —
  the browser only ever sees `app.tootica.com`. This is why A is simplest.
- **Alternative:** SST + OpenNext if you want the frontend in the same IaC as the
  backend. Avoid a plain S3 static export — the app relies on server behaviour.

---

## Phase 7 — DNS cutover

- **Route 53** records:
  - `api.tootica.com` → API Gateway custom domain (attach the `ap-south-1` ACM cert).
  - `app.tootica.com` → the Amplify app domain.
- Set the API Gateway **custom domain** mapping to the HTTP API stage.
- Cut over with a **weighted / low-TTL** record so you can shift traffic
  gradually and roll back via DNS. Keep the old environment running until the new
  stack has soaked.

---

## Phase 8 — End-to-end verification

Run against the **deployed** stack (the Postman collection in `backend/postman/`
works against any base URL — just change the environment's base URL):

- [ ] `GET /api/health` → `200 { status: "ok" }`.
- [ ] `POST /api/auth/login` `{ identifier, password }` → `200`, sets httpOnly cookies.
- [ ] `GET /api/patients` with the session cookie → `200` (not `500` — catches
      Prisma client / RDS Proxy wiring issues).
- [ ] **Password reset:** `POST /api/auth/forgot-password` → OTP email arrives via
      **SES**, and a DynamoDB item appears **with a `ttl`** that auto-expires.
- [ ] **Records + S3:** open a patient's Records → upload a document → object
      lands in the **S3 bucket**; **Download** returns the presigned URL / file;
      delete removes the S3 object.
- [ ] Create an appointment, add a payment → dashboard Revenue reflects it.
- [ ] **WhatsApp inbound:** `POST /api/appointments/whatsapp/inbound` → a Pending
      appointment shows in the "WhatsApp Appointments" popup.
- [ ] **CloudWatch Logs:** no errors; DB connection count stays flat under load
      (proves RDS Proxy is pooling, not storming).

---

## Rollback

- **Traffic:** flip the Route 53 weighted record back to the old environment
  (lowest-risk, instant).
- **Database:** restore RDS from an automated snapshot if the schema/data was
  changed. Take a manual snapshot right before cutover.
- Keep the **pre-migration environment fully running** until the new stack has
  soaked for a defined period (e.g. one business week).

---

## Cost sketch

Rough monthly order-of-magnitude for a small-traffic prod (ap-south-1), to set
expectations — confirm with the AWS pricing calculator:

| Service | Driver | Ballpark |
| --- | --- | --- |
| RDS Postgres (Multi-AZ, `db.t4g.small`) | always-on | the biggest line item |
| RDS Proxy | per-vCPU-hour of the DB | modest |
| Lambda | requests + GB-s | pennies at low traffic |
| API Gateway HTTP API | per million requests | pennies |
| DynamoDB (on-demand) | per request | negligible for OTPs |
| S3 | storage + requests | negligible for documents |
| SES | per 1k emails | negligible |
| NAT Gateway | per hour + per GB | **avoid with VPC endpoints** (already in the stack) |

> Single biggest lever: use **Aurora Serverless v2** (scales to a low floor) or a
> right-sized single-AZ RDS in **staging** to avoid paying Multi-AZ there.

---

## Appendix — full env var matrix

| Variable | Local source | AWS source | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `.env` | Lambda env = `production` | turns on `Secure` cookies |
| `DATABASE_URL` | `.env` | Secrets Mgr → **RDS Proxy** endpoint | `?connection_limit=1` |
| `JWT_ACCESS_SECRET` | `.env` | Secrets Manager | |
| `JWT_REFRESH_SECRET` | `.env` | Secrets Manager | |
| `JWT_ACTION_SECRET` | `.env` | Secrets Manager | reset + invite tokens |
| `SUPER_ADMIN_DELETE_CODE` | `.env` (default `246810`) | Secrets Manager | **must override in prod** |
| `CORS_ORIGIN` | `.env` | Lambda env | SPA origin (model B only) |
| `MAIL_FROM` | `.env` | Lambda env | must be **SES-verified** |
| `STORAGE_DRIVER` | unset (`local`) | `s3` | **new** |
| `S3_BUCKET` | — | `tootica-uploads-<env>` | **new** |
| `OTP_STORE` | unset (`memory`) | `dynamodb` | **new** |
| `OTP_TABLE` | — | `tootica-otp-<env>` | **new** |
| `EMAIL_DRIVER` | unset (`smtp`) | `ses` | **new** |
| `AWS_REGION` | — | `ap-south-1` | **new** |
| `COOKIE_DOMAIN` | unset | `.tootica.com` | **new**, model B only |
| `COOKIE_SAMESITE` | unset (`lax`) | `none` | **new**, model B only |
| `SMTP_*` | `.env` (MailHog) | unused with `EMAIL_DRIVER=ses` | or SES SMTP creds |
| `OTP_*` TTLs, `*_TTL_SECONDS` | `.env` | Lambda env | unchanged |
| `TWILIO_*` | `.env` (blank) | Secrets Manager | SMS login OTP |

---

## Ordered summary (the whole thing on one screen)

1. **Phase 0** — lock account/region, DB choice, single-Lambda, domains, CDK, cookie model A.
2. **Phase 1** — in a branch: extend `env.ts`; swap 4 seams (S3 storage ⚠️, DynamoDB OTP, SES email, Secrets Mgr), all env-gated; verify local dev unchanged.
3. **Phase 2** — add esbuild bundle + `prisma generate`; test `lambda.handler` locally.
4. **Phase 3** — `cdk deploy` the infra (VPC, RDS+Proxy, S3, DynamoDB, Secrets, IAM, HTTP API); verify SES domain; fill secrets; request ACM certs.
5. **Phase 4** — `migrate deploy` the baseline to RDS; seed staging / onboard prod super admin.
6. **Phase 5** — `cdk deploy` the Lambda; smoke the raw API URL.
7. **Phase 6** — host Next.js on Amplify; point `/api/*` at the API.
8. **Phase 7** — Route 53 + ACM; weighted DNS cutover.
9. **Phase 8** — end-to-end smoke test; watch CloudWatch; keep rollback ready.
</content>
</invoke>
