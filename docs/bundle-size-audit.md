# Bundle size audit (2026-04-14)

## What was checked

- Ran a production build (`npm run build`) to inspect emitted chunk sizes.
- Verified the Excel export path is fully lazy: base UI click handler lazy-loads export code, and public API export uses a lazy wrapper.
- Attempted to run `vite-bundle-visualizer`, but npm registry access is blocked in this environment (`403 Forbidden`).

## Current build output snapshot

From `npm run build` after this change:

- `dist/index-DxbOqCiJ.js`: **493.90 kB** (gzip **117.14 kB**)
- `dist/excelExport-DUhHt3G1.js`: **1.17 kB** (gzip **0.66 kB**)
- `dist/works-calendar.es.js` bootstrap: **3.65 kB** (gzip **1.56 kB**)

## Audit conclusion

- `xlsx` is no longer reachable via any static import path from the main entrypoint.
- Excel export is loaded on demand via dynamic import, so optional export code is excluded from the base runtime path and fetched only when needed.

## Follow-up when network-restricted policy is lifted

Run the visualizer for a full treemap breakdown:

```bash
npx vite-bundle-visualizer
```

Then confirm:

1. `lucide-react` contribution is tree-shaken to only used icons.
2. No `xlsx` code appears in the initial app/library chunk(s).
