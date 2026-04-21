# Bundle size audit (2026-04-21 — Phase 4 workflow close-out)

Post-merge snapshot for the workflow DSL close-out (epic #219). Covers
the runtime additions from #222 (SLA timers + escalation) and #223
(parallel/join nodes, channel registry, notify dispatch, template
interpolation) on top of the Phase-2 visual builder baseline.

Prior snapshot: [Phase 2 baseline (archived)](./archive/analysis/bundle-size-audit.md).

## What was checked

- Ran `npm run build` on the tip of `claude/workflow-p4-parallel`
  (commit `8b25faf`) after the Codex review fixes landed.
- Verified the Phase-2 lazy boundaries still hold:
  - `ApprovalFlowsTab` is `React.lazy`-imported from ConfigPanel.
  - `WorkflowBuilderModal` is a second-tier lazy import inside
    `ApprovalFlowsTab`; the SVG canvas, validator, layout engine,
    inspector, guard picker, simulator, parallel/join forms, and
    per-type CSS modules only download when the author opens a draft.
- Confirmed the P3/P4 additions land in the library's main chunk
  (`dist/index-*.js`) because `src/index.ts` re-exports the engine,
  channel factories, validator, and templates as public API.

## Current build output snapshot

### Post-P4 (commit `8b25faf`)

- `dist/index-DWst08WI.js`: **898.31 kB** (gzip **209.83 kB**)
- `dist/WorkflowBuilderModal-l6Z1_J2-.js`: 50.31 kB (gzip 12.48 kB)
- `dist/ApprovalFlowsTab-BAXXubUJ.js`: 10.86 kB (gzip 2.81 kB)
- `dist/excelExport-BtyGrHgh.js`: 1.17 kB (gzip 0.66 kB)
- `dist/works-calendar.es.js` bootstrap: 5.37 kB (gzip 2.21 kB)
- `dist/works-calendar.umd.js`: 620.66 kB (gzip 178.47 kB)
- `dist/style.css`: 182.95 kB (gzip 28.86 kB)

### Delta vs. Phase-2 baseline

| Chunk | Phase 2 (gzip) | Phase 4 (gzip) | Δ |
| --- | --- | --- | --- |
| `index-*.js` (main) | 187.90 kB | 209.83 kB | **+21.93 kB** |
| `WorkflowBuilderModal-*.js` | 14.70 kB | 12.48 kB | −2.22 kB |
| `ApprovalFlowsTab-*.js` | 3.13 kB | 2.81 kB | −0.32 kB |
| `style.css` | 28.51 kB | 28.86 kB | +0.35 kB |
| `works-calendar.es.js` bootstrap | 1.65 kB | 2.21 kB | +0.56 kB |

## Audit conclusion

- **Main chunk grew by ~22 kB gzipped across P3 + P4** — larger than
  the ≤2 kB budget used for the visual builder in Phase 2, but that
  budget was scoped to the builder UI. P3/P4 add *runtime* surface
  that is public API by design:
  - SLA timer state + `tick()` + timeout/escalate semantics (#222).
  - Parallel frame machinery (`enterParallel`, `walkBranchForward`,
    `settleFrame`, branch quorum) + `join` resolution (#223).
  - Channel registry, dispatch pipeline, 3 built-in adapters (Slack,
    email, webhook), + template interpolation (#223).
  - New validator rules, templates, and `useWorkflowTicker` hook.
  Callers that do not import the workflow API continue to tree-shake
  these out of their own bundles.
- **The visual builder chunks shrank slightly** despite gaining
  parallel/join inspector forms, the node palette, and canvas kind
  styling — the previous `esbuild`→`oxc` toolchain switch is the
  likely source of the win.
- **CSS delta is +0.35 kB gzipped** — the parallel/join node kind
  classes and the add-node palette styles.
- The `WorkflowBuilderModal` chunk stays well under the 25 kB gzip
  budget called out in the close-out plan (12.48 kB actual).

## Follow-up when network-restricted policy is lifted

Run the visualizer for a full treemap breakdown:

```bash
npx vite-bundle-visualizer
```

Then confirm:

1. `lucide-react` contribution stays tree-shaken to only used icons.
2. No `xlsx` code appears in the initial app/library chunk(s).
3. The `ApprovalFlowsTab` and `WorkflowBuilderModal` chunks contain
   the expected Phase-2 + P4 modules (templates, validate, layout,
   canvas, inspector, picker, simulator, parallel/join inspector
   forms, palette) and nothing else.
4. The main-chunk P3/P4 delta is dominated by `src/core/workflow/`
   (advance, channels, templateInterpolate, validate) as expected.
