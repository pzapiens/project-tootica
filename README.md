# Tootica — Dental Management System

A multi-tenant dental practice management system. **Monorepo:** the backend API
and the frontend web app live in one git repository.

## Apps

| Folder      | Stack                                             | Dev port |
| ----------- | ------------------------------------------------- | -------- |
| `backend/`  | Express · TypeScript · Prisma 7 (Postgres) · JWT  | `4000`   |
| `frontend/` | Next.js · TypeScript · Tailwind                   | `3000`   |

Each app keeps its own `package.json` + lockfile and is installed independently
(no workspace hoisting).

## Local infrastructure (Docker)

The backend depends on two containers, defined in `backend/docker-compose.yml`:

| Service    | Purpose                   | Host ports                     |
| ---------- | ------------------------- | ------------------------------ |
| `postgres` | PostgreSQL 16 database    | `5432`                         |
| `mailhog`  | Local SMTP + email viewer | `1025` (SMTP), `8025` (web UI) |

Start them with `docker compose up -d` from `backend/` (Docker Desktop must be
running). OTP and other emails are caught by MailHog — read them at
<http://localhost:8025>.

**Postgres client** (TablePlus/DBeaver/psql): host `localhost`, port `5432`,
database `tootica`, user `tootica`, password `tootica_dev_password`.

## Running locally

Open two terminals:

Prerequisites: **Node 20+** and **Docker Desktop running**.

```bash
# Terminal 1 — backend
cd backend
npm install     # first time only (also generates the Prisma client)
npm run setup   # first time: creates .env (+ JWT secrets), starts Docker, migrates, seeds
npm run dev     # http://localhost:4000

# Terminal 2 — frontend
cd frontend
npm install                   # first time only
cp .env.example .env.local    # first time only
npm run dev                   # http://localhost:3000
```

Then open <http://localhost:3000>. Seeded logins are in `backend/README.md`
(e.g. `admin@tootica.local` / `Password123!`).

## How the two apps connect

They talk over HTTP at runtime. In development the frontend proxies API calls to
the backend so the browser sees a single origin:

```
Browser → localhost:3000 (Next.js UI)
             │  request to /api/*
             ▼
          localhost:4000 (Express API)   ← Next.js rewrite proxies here
             │
             ▼
          localhost:5432 (Postgres) · localhost:1025 (MailHog SMTP)
```

- The frontend calls **relative** paths like `/api/health`.
- `frontend/next.config.ts` rewrites `/api/*` to the backend origin
  (`BACKEND_ORIGIN` in `frontend/.env.local`, default `http://localhost:4000`).
- Auth uses httpOnly cookies — the frontend sends requests with credentials.

## Working in parallel (two devs)

- **`main` stays green and deployable.** No direct pushes to `main`.
- **Branch per change**, prefixed by area: `be/…` for backend, `fe/…` for
  frontend (e.g. `be/staff-onboarding`, `fe/login-page`). Open a PR, get a quick
  review, merge.
- **You mostly own different folders**, so day-to-day conflicts are rare. When
  both touch shared contracts, `backend/docs/API_CONTRACT.md` is the source of
  truth — update it in the same PR that changes an endpoint.
- **Pull `main` before starting** and rebase your branch often to stay current.
- **Never commit secrets.** `.env` (backend) and `.env.local` (frontend) are
  git-ignored; only the `.env.example` files are shared. Each dev generates their
  own JWT secrets locally.

## Documentation

- `backend/README.md` — backend setup, scripts, env vars, seeded accounts.
- `backend/docs/API_CONTRACT.md` — every endpoint's request/response shapes.
- `backend/docs/AWS_MIGRATION.md` — architecture + AWS (API Gateway + Lambda) plan.
- `backend/postman/` — importable Postman collection.

## Project layout

```
Project Tootica/            ← monorepo root (git repo)
├── .gitignore              (repo-wide safety net)
├── .gitattributes          (LF normalization)
├── backend/                Express API (its own .gitignore, package.json)
│   ├── docker-compose.yml  (Postgres + MailHog)
│   ├── prisma/             (schema, migrations, seed)
│   ├── docs/  postman/
│   └── src/{config,common,modules,…}  app.ts · server.ts · lambda.ts
└── frontend/               Next.js app (its own .gitignore, package.json)
    └── src/{app,lib}
```
