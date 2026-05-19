# works-calendar reference host

A small Next.js + Supabase app that wraps `works-calendar` so a flight school
(or anything shaped like one — flying club, mobile food pantry, volunteer
EMS, small fleet ops) can deploy a working schedule + dispatch board without
writing a host app from scratch.

This is intentionally a **template**, not a SaaS. You clone it, point it at
your own Supabase project, deploy it to Vercel. You own the data, the auth,
and the URL. No subscription, no vendor account on your side.

## What's wired up today

- Email magic-link auth via Supabase
- Protected `/dashboard` route that mounts the calendar with seed flight-school
  data (1 airport, 2 aircraft, 2 CFIs, a half-dozen lessons)
- Sign-out
- Local-state event save so you can drag events around the demo

## What's not wired up yet (follow-ups)

- Persisting events to Supabase (right now `onEventSave` only updates React state)
- A `bookings` schema + row-level-security so students can only see their own
- Role-based event filtering (admin / CFI / student)
- Email notifications for booking confirmations / cancellations
- A booking form using the calendar's `externalForm` slot

## Quickstart

```bash
# 1. From the repo root, build the calendar package once. The reference host
#    consumes the source via a webpack alias for dev, but its production build
#    still expects the calendar's compiled artifacts to exist.
npm install
npm run build

# 2. Install + configure the reference host.
cd apps/reference-host
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase URL + anon key.

# 3. Run it.
npm run dev
# → http://localhost:3000
```

## Deploying

1. Create a Supabase project. From **Project Settings → API**, copy the project URL and the `anon` key.
2. In the Supabase dashboard, **Authentication → URL Configuration**, add your deployed origin (`https://your-app.vercel.app`) to **Site URL** and **Redirect URLs** (include `/auth/callback`).
3. Push this repo to your own GitHub.
4. Import the repo in Vercel. Set the **Root Directory** to `apps/reference-host`. Override the build command to `cd ../.. && npm install && npm run build && cd apps/reference-host && npm install && npm run build`.
5. In Vercel **Environment Variables**, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Why a reference host instead of a hosted SaaS?

The `works-calendar` component is the part with reusable value. Wrapping it
in a specific UX (login flow, route protection, persistence) doesn't —
every adopter will want different auth, different fields, different
notifications. Shipping the wrapping as a template you fork is honest about
that: the parts you keep are the parts you want, and you don't pay anyone
rent.
