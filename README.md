# WorksCalendar

Drop-in embeddable React calendar with filter pills, hover cards, Excel export, and owner config panel.

## Quick start

```bash
npm install
npm run dev          # demo at http://localhost:3000
npm run examples     # examples at http://localhost:3001
```

## Build & preview

```bash
npm run build        # library → dist/
npm run build:demo   # demo app → dist-demo/
npm run preview      # serve dist-demo/ locally
```

## PWA (demo app)

The demo is a full Progressive Web App. When you run `npm run build:demo`, `vite-plugin-pwa` emits:

- `dist-demo/sw.js` — Workbox service worker (auto-updated via `registerType: 'autoUpdate'`)
- `dist-demo/manifest.webmanifest` — Web App Manifest
- Precached shell assets (JS, CSS, HTML, SVG)

Runtime caching rules:
- **Google Fonts** — `CacheFirst`, 1-year TTL
- **Static shell** — precached via Workbox, updated on every deploy

### Install prompt

Browsers that support PWA install will show an install banner when the demo is served over HTTPS. After install the app opens in standalone mode (no browser chrome).

### Update flow

When a new version is deployed, the service worker detects the change and shows a toast: **"A new version is available."** Click **Update** to reload with the latest build. Dismissing the toast defers the update until the next navigation.

### Regenerating icons

Icons live in `demo/public/` as SVG files. To generate PNG variants (for broader compatibility):

```bash
# Requires sharp or any SVG-to-PNG tool, e.g.:
npx sharp-cli -i demo/public/icon-512.svg -o demo/public/icon-512.png resize 512 512
npx sharp-cli -i demo/public/icon-192.svg -o demo/public/icon-192.png resize 192 192
```

Then update `vite.demo.config.js` to reference the `.png` files and change `type` to `image/png` in the manifest icons array.

### Known limitations

- **Dynamic event data** is generated at runtime from `localStorage`. If the app is opened offline after a previous visit, the calendar shell loads but the event list reflects the last in-memory state from that session (no server sync in the demo).
- **localStorage** is not cleared on SW update — user-saved events and profiles are preserved across deploys.
- The maskable icon uses the same asset as the regular icon; for production use a version with extra padding/safe-area.

## Library usage

```jsx
import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';         // base styles
import 'works-calendar/styles/ocean';   // optional theme

<WorksCalendar
  events={events}
  employees={employees}
  calendarId="my-calendar"
  theme="ocean"
  onEventSave={handleSave}
  onEventDelete={handleDelete}
/>
```

Available themes: `light`, `dark`, `aviation`, `soft`, `minimal`, `corporate`, `forest`, `ocean`

Owner password for config panel: `demo1234` (demo only — set your own via `ownerPassword` prop).
