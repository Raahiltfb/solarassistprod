# Solar Assist

Multi-tenant solar O&M monitoring platform — Next.js 15 + TypeScript + Supabase + Tailwind + Recharts + Zustand + next-pwa.

## Features

- Roles: Super Admin, EPC Admin, Field Technician, Client (Supabase Auth + RLS)
- Sites, Inverters, Strings, Telemetry, Alerts, Tickets, Cleaning, Uploads, OEM Integrations
- Modular OEM adapters — Solis Cloud (live HMAC-SHA1), Growatt, Sungrow (scaffolded)
- SolCast benchmark adapter for expected generation
- Resend email alerts (severity-coded, cleaning overdue)
- Ticket pipeline with SLA due, status transitions
- Technician mobile workflow: cleaning logs with before/after camera capture
- Client portal: read-only generation, PR, maintenance history, reports
- PWA installable (manifest + next-pwa service worker)

## Stack

- **Frontend**: Next.js 15 App Router, TypeScript, Tailwind, shadcn-style primitives
- **Backend**: Supabase (PostgreSQL + RLS + Auth + Storage)
- **Charts**: Recharts
- **State**: Zustand
- **Email**: Resend
- **PWA**: next-pwa

## Quick start (local)

```bash
cd /app/frontend
yarn install
```

Populate `.env.local` with your keys (already created — replace if needed):

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
RESEND_API_KEY=…
RESEND_FROM_EMAIL=alerts@yourdomain.com
SOLCAST_API_KEY=…
SOLIS_KEY_ID=…
SOLIS_KEY_SECRET=…
SOLIS_API_URL=https://www.soliscloud.com:13333
CRON_SECRET=<random>
```

## Supabase setup (one-time, 2 minutes)

1. Open https://supabase.com/dashboard → your project → **SQL Editor**.
2. Paste and run `supabase/exec_sql.sql` (enables the seed script to run SQL via RPC).
3. Paste and run `supabase/migrations/0001_init.sql` (full schema, types, RLS, trigger).
4. **Storage**: create a public bucket named `solar-uploads` (for cleaning photos).

## Seed mock data

```bash
yarn seed
```

Creates 2 orgs, 5 sites, 20 inverters with 48h hourly telemetry, alerts, tickets, cleaning logs, and four demo accounts:

| Role       | Email                        | Password     |
| ---------- | ---------------------------- | ------------ |
| Super      | super@solarassist.dev        | Solar@12345  |
| EPC Admin  | admin@heliogrid.dev          | Solar@12345  |
| Technician | tech@heliogrid.dev           | Solar@12345  |
| Client     | client@heliogrid.dev         | Solar@12345  |

## Run dev

```bash
yarn dev
# → http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project** → import repo → root is `frontend/`.
3. Paste all env vars from `.env.local` into Vercel → Settings → Environment Variables.
4. Deploy.
5. Set cron jobs (Vercel Cron) in `vercel.json` (already compatible):

   ```json
   {
     "crons": [
       { "path": "/api/cron/poll-oem?secret=$CRON_SECRET", "schedule": "*/15 * * * *" },
       { "path": "/api/cron/check-cleaning?secret=$CRON_SECRET", "schedule": "0 9 * * *" }
     ]
   }
   ```

## Architecture

```
/app/frontend
├── app/
│   ├── (dashboard)/    authenticated pages
│   ├── login/          unauthenticated
│   ├── api/            Next.js server routes (cron, health)
│   └── layout.tsx, globals.css
├── components/         shell + shadcn-style UI primitives
├── lib/
│   ├── supabase/       client / server / middleware
│   ├── integrations/   MODULAR OEM ADAPTERS
│   │   ├── types.ts    unified schema (NormalizedDevice / Telemetry / Alert)
│   │   ├── solis/      Solis Cloud HMAC-SHA1
│   │   ├── growatt/    Growatt OpenAPI scaffold
│   │   ├── sungrow/    Sungrow iSolarCloud scaffold
│   │   ├── solcast/    SolCast forecast benchmark
│   │   └── resend/     email alerts
│   ├── permissions.ts  role → permission map
│   ├── store.ts        Zustand app store
│   ├── types.ts        shared types
│   └── utils.ts
├── scripts/seed.ts     seed script
├── supabase/
│   ├── migrations/0001_init.sql
│   └── exec_sql.sql
└── public/manifest.json  PWA manifest
```

## Adding a new OEM

1. Create `lib/integrations/<oem>/index.ts` implementing `OemAdapter` from `lib/integrations/types.ts`.
2. Register it in `lib/integrations/index.ts`.
3. Insert a row into `oem_integrations` with `provider = '<oem>'` and `config = { plants: [{ plant_id, site_id }] }`.
4. The `/api/cron/poll-oem` route will pick it up on the next tick.

Data never flows straight from OEM to UI — it passes through the unified schema, ensuring the frontend stays OEM-agnostic.
