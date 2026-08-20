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

## Screens & features

Built frame-by-frame from the Figma designs. All auth screens sit on the dark
(`bg-ink`) background and are auto-scaled to fit the viewport (no page scroll)
via `FitToViewport`. Design tokens (`--color-brand`, `--color-ink`,
`--color-field-border`, `--color-field-placeholder`) live in `globals.css`;
fonts are **Manrope** (headings) + **Inter** (body).

### `/login` — Sign In
- Email + password fields, a **square "Keep me logged in" checkbox**, and a
  "Save password" action.
- **Sign In** → `/clinic-selection` (real `apiFetch("/auth/login")` is a TODO).
- **Forgot Password?** → `/forgot-password`.

### `/forgot-password` — password reset flow
One route with four connected steps (state carried across screens):
1. **Email** — request reset instructions.
2. **Verification** — 6-box OTP input (auto-advance / backspace / paste) with a
   live **resend countdown**, and the target email shown masked.
3. **Reset Password** — new + re-enter password. The button stays active even
   when they differ; on submit a **"Passwords do not match" error** is shown
   instead of blocking, and clears as you type.
4. **Login Again** — confirmation → back to `/login`.
- Every step has a **Back to Login** link. Backend calls are TODOs.

### `/clinic-selection` — post-login mini-dashboard
- Greeting header with two filters:
  - **Branch filter** dropdown ("All Branch" + each clinic).
  - **Time filter** dropdown — **All-Time / Today / custom FROM–TO range**
    (CLEAR/APPLY). The selection recomputes the stat cards by branch × time frame.
- Four **appointment stat cards** (total / completed / pending / cancelled).
- **Select Branch** searchable table (search by branch, PIC, or contact). Rows
  are a single-select radio group; the list scrolls independently when branches
  overflow. Seeded with three branches.
- **LOGOUT** → `/login`.

> Seed data (branches, per-branch/per-time-frame stats) lives at the top of
> `clinic-selection/page.tsx` — swap for a backend fetch when available.

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
├── app/                       # App Router pages, layouts, components
│   ├── layout.tsx             # Root layout, fonts (Manrope + Inter)
│   ├── globals.css            # Tailwind + design tokens
│   ├── page.tsx               # Home page
│   ├── BackendStatus.tsx      # Live backend connection badge
│   ├── login/                 # /login
│   │   ├── page.tsx
│   │   ├── LoginCard.tsx
│   │   └── FitToViewport.tsx  # Scales content to fit the viewport
│   ├── forgot-password/       # /forgot-password (4-step flow)
│   │   ├── page.tsx
│   │   └── ForgotPasswordFlow.tsx
│   └── clinic-selection/      # /clinic-selection
│       ├── page.tsx           # Seed data (branches + stats)
│       ├── DashboardTop.tsx   # Header, filters, stat cards
│       ├── BranchFilter.tsx   # "All Branch" dropdown
│       ├── TimeFilter.tsx     # Time-frame dropdown (All-Time/Today/range)
│       ├── SelectBranchSection.tsx  # Search + scrollable list
│       └── BranchList.tsx     # Single-select branch rows
└── lib/
    └── api.ts    # apiFetch() helper (uses relative /api paths)

public/
├── auth/         # Login / forgot-password icons + logo
└── clinic/       # Clinic-selection icons
```

frontend-test-git