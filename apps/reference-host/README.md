# works-calendar reference host

A small Next.js + Supabase app that wraps `works-calendar` so a flight school
(or anything shaped like one — flying club, mobile food pantry, volunteer
EMS, small fleet ops) can deploy a working schedule + dispatch board without
writing a host app from scratch.

This is intentionally a **template**, not a SaaS. You clone it, point it at
your own Supabase project, deploy it to Vercel. You own the data, the auth,
and the URL. No subscription, no vendor account on your side.

## Styling note (important)

The calendar needs **two** style imports (see `app/layout.tsx`):

```ts
import 'works-calendar/styles';           // REQUIRED — component layout + Tailwind utilities + default theme
import 'works-calendar/styles/aviation';  // optional — a token overlay, active when theme="aviation"
```

`works-calendar/styles` is the batteries-included base; without it the
calendar renders unstyled. The per-theme files (`/styles/aviation`,
`/styles/soft`, …) are small token overlays that only take effect when you
pass the matching `theme="…"` prop to `<WorksCalendar>`. Importing a theme
file *without* the base is the most common styling mistake.

## What's wired up today

- Email magic-link auth via Supabase
- Protected `/dashboard` route that mounts the calendar
- Events persist to a Supabase `events` table, scoped behind RLS so only signed-in users can touch the data
- Optimistic UI on drag / edit, with automatic rollback if the Supabase write fails
- A "Seed demo data" button on the first sign-in to a fresh project (1 airport, 2 aircraft, 2 CFIs, six lessons)
- Sign-out

## What's not wired up yet (follow-ups)

- Role-based row-level security (admin / CFI / student) — current policy is "any signed-in user can CRUD any event"
- A `profiles` table that maps `auth.uid()` to a role + display name
- Email notifications for booking confirmations / cancellations
- A booking form using the calendar's `externalForm` slot

## Quickstart

```bash
# 1. From the repo root, build the calendar package once. The host
#    pulls the calendar's compiled artifacts in via `file:../..`, so
#    this has to exist before the host can install or build.
npm install
npm run build

# 2. Install + configure the reference host.
cd apps/reference-host
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase URL + anon key.

# 3. Apply the schema to your Supabase project. In the Supabase dashboard:
#    SQL Editor → New Query → paste the contents of supabase/schema.sql
#    → Run. (One-time setup per project.)

# 4. Configure auth redirect URLs. In Supabase:
#    Authentication → URL Configuration. Add http://localhost:3000 to
#    Site URL and http://localhost:3000/auth/callback to Redirect URLs.

# 5. Run it.
npm run dev
# → http://localhost:3000
```

On first sign-in to a fresh Supabase project, the dashboard will show
a **Seed demo data** button. Click it once to drop the flight-school
sample dataset into your `events` table so you have something to see.

## Deploying

1. Create a Supabase project. From **Project Settings → API**, copy the project URL and the `anon` key.
2. **SQL Editor → New Query** → paste `apps/reference-host/supabase/schema.sql` → Run.
3. **Authentication → URL Configuration** → add your deployed origin (`https://your-app.vercel.app`) to **Site URL** and **Redirect URLs** (include `/auth/callback`).
4. Push this repo to your own GitHub.
5. Import the repo in Vercel. Set the **Root Directory** to `apps/reference-host`. Override the build command to `cd ../.. && npm install && npm run build && cd apps/reference-host && npm install && npm run build`.
6. In Vercel **Environment Variables**, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Why a reference host instead of a hosted SaaS?

The `works-calendar` component is the part with reusable value. Wrapping it
in a specific UX (login flow, route protection, persistence) doesn't —
every adopter will want different auth, different fields, different
notifications. Shipping the wrapping as a template you fork is honest about
that: the parts you keep are the parts you want, and you don't pay anyone
rent.
