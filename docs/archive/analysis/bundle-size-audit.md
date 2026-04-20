# Bundle size audit (2026-04-20 — Phase 2 visual builder)

## What was checked

- Ran a production build (`npm run build`) before and after Phase 2 to
  measure the main-chunk delta attributable to the visual workflow
  builder.
- Verified the Phase 2 code paths stay lazy:
  - `ApprovalFlowsTab` (ConfigPanel's entry into the builder) is
    `React.lazy`-imported, so `WORKFLOW_TEMPLATES`, `useSavedWorkflows`,
    and the tab's render tree only download when the owner opens the
    Approval Flows tab.
  - `WorkflowBuilderModal` is a second-tier lazy import inside
    `ApprovalFlowsTab`, so the SVG canvas, validator, layout engine,
    and simulator only download when the author actually opens a draft.

## Current build output snapshot

### Pre-Phase-2 baseline (commit `82af954`)

- `dist/index--97GcyGz.js`: **814.36 kB** (gzip **187.66 kB**)
- `dist/excelExport-BAkhDACy.js`: 1.17 kB (gzip 0.66 kB)
- `dist/works-calendar.es.js` bootstrap: 3.84 kB (gzip 1.64 kB)
- `dist/style.css`: 168.34 kB (gzip 26.42 kB)

### After Phase 2 (commit `79f97a7` + lazy-split of `ApprovalFlowsTab`)

- `dist/index-Bxr5v1SQ.js`: **815.05 kB** (gzip **187.90 kB**) — **+0.24 kB gzip**
- `dist/ApprovalFlowsTab-*.js`: 12.79 kB (gzip 3.13 kB) — new lazy chunk
- `dist/WorkflowBuilderModal-*.js`: 57.71 kB (gzip 14.70 kB) — new lazy chunk
- `dist/excelExport-*.js`: 1.17 kB (gzip 0.66 kB)
- `dist/works-calendar.es.js` bootstrap: 3.86 kB (gzip 1.65 kB)
- `dist/style.css`: 180.95 kB (gzip 28.51 kB) — **+2.09 kB gzip**

## Audit conclusion

- **Main chunk delta from Phase 2: +0.24 kB gzipped.** Inside the
  plan's ≤2 kB gzip budget for the main chunk.
- The full visual builder (validator + layout engine + canvas +
  inspector + picker + simulator + builder modal + tab UI + templates
  + persistence hook) lives entirely in two lazy chunks totalling
  17.83 kB gzipped, fetched only when the Approval Flows tab opens.
- CSS delta is +2.09 kB gzipped — from the per-component CSS modules
  introduced by Phase 2. Vite's library build emits a single
  `style.css`, so the Phase 2 styles can't be split into a separate
  file without reshaping the build config; they are a one-time cost
  on first load regardless of whether the tab opens.

## Earlier baseline (2026-04-14, Excel-export lazy audit)

Prior pass verified `xlsx` is no longer reachable via any static
import path from the main entrypoint and that Excel export is loaded
on demand via dynamic import.

## Follow-up when network-restricted policy is lifted

Run the visualizer for a full treemap breakdown:

```bash
npx vite-bundle-visualizer
```

Then confirm:

1. `lucide-react` contribution is tree-shaken to only used icons.
2. No `xlsx` code appears in the initial app/library chunk(s).
3. The `ApprovalFlowsTab` and `WorkflowBuilderModal` chunks contain
   the expected Phase 2 modules (templates, validate, layout, canvas,
   inspector, picker, simulator, hook) and nothing else.
