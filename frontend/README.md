# Tootica — Frontend

Frontend for the Tootica dental management system.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · ESLint

## Requirements

- Node.js >= 20
- The [backend](https://github.com/<org>/tootica-backend) running locally on port `4000`

## Getting started

```bash
npm install
cp .env.example .env.local   # then edit if your backend runs elsewhere
npm run dev                  # http://localhost:3000
```

Open <http://localhost:3000> — the homepage shows a **Backend connection** badge
that turns green once it can reach the backend.

## How API calls work

The frontend never calls the backend's URL directly. Instead it calls **relative**
`/api/*` paths, and `next.config.ts` rewrites (proxies) those to the backend.
From the browser's perspective everything is same-origin, so there is **no CORS**
to configure and the same code works in dev and prod.

- Backend origin is set by `BACKEND_ORIGIN` in `.env.local` (default `http://localhost:4000`).
- Use the `apiFetch()` helper in `src/lib/api.ts` for API calls:

```ts
import { apiFetch, type HealthResponse } from "@/lib/api";

const health = await apiFetch<HealthResponse>("/health"); // → GET /api/health → backend
```

## Scripts

| Script          | Description                       |
| --------------- | -------------------------------- |
| `npm run dev`   | Start dev server (port 3000)     |
| `npm run build` | Production build                 |
| `npm start`     | Serve the production build       |
| `npm run lint`  | Lint with ESLint                 |

## Environment variables

See `.env.example`. Copy it to `.env.local`.

| Variable         | Default                 | Description                              |
| ---------------- | ----------------------- | ---------------------------------------- |
| `BACKEND_ORIGIN` | `http://localhost:4000` | Origin the `/api/*` proxy forwards to    |

## Project structure

```
src/
├── app/          # App Router pages, layouts, components
│   ├── page.tsx          # Home page
│   └── BackendStatus.tsx # Live backend connection badge
└── lib/
    └── api.ts    # apiFetch() helper (uses relative /api paths)
```
