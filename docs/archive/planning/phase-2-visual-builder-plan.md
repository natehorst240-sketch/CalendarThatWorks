# Phase 2 — Workflow Visual Builder

## Context

Phase 1 (PR #219, commit `da05b47`) shipped a JSON-only workflow DSL under `src/core/workflow/`: a typed schema (`workflowSchema.ts`), a safe Pratt-parser expression evaluator (`expression.ts`), a pure interpreter (`advance.ts`), and three starter workflows (`templates.ts`). Today there is **no UI** for owners to view, edit, or author these workflows — they must hand-write JSON. The commit message for Phase 1 explicitly defers "the visual builder, SLA timers, and parallel branches" to later phases.

Phase 2 delivers that visual builder so owners can fork a starter template, wire nodes/edges on a canvas, test it against sample variables, and save it — without writing JSON.

### User-confirmed scope

- Editor paradigm: **node-and-edge graph canvas** (hand-rolled SVG, no new deps).
- **Include simulator** that steps `advance()` against user-supplied variables.
- Host surface: **standalone modal** launched from a new Workflows tab in `ConfigPanel` (templates list + per-template Edit button + "Create blank" button).

### Hard constraints

- Shipped npm library — **no new dependencies** (stay with `date-fns` + `lucide-react`).
- Bundle impact must stay small (lazy-load the modal).
- Do not break Phase 1 tests — `Workflow` / `WorkflowNode` types stay as-is; layout coordinates live in a side-car `WorkflowLayout`, not on the nodes.
- TypeScript strict mode.

## Approach

Hand-rolled SVG canvas with BFS auto-layout as the default, per-node drag overrides stored in a separate `WorkflowLayout`. "Fork on edit" semantics — editing a starter template creates a new `SavedWorkflow` rather than mutating `WORKFLOW_TEMPLATES`. All validation reuses Phase 1 types and helpers (`findNode`, `resolveNextEdge`, `evaluate` for expression syntax checking). Modal is lazy-loaded from ConfigPanel via `React.lazy`.

## Files

### New core (pure — test-first)

- `src/core/workflow/validate.ts` — `validateWorkflow(wf): readonly ValidationIssue[]`. Save gate + inline builder badges. Each rule has an explicit severity:

  | Rule (code) | Severity |
  |---|---|
  | `duplicate-node-id` | error |
  | `start-node-missing` | error |
  | `edge-endpoint-missing` | error |
  | `no-terminal-node` | error |
  | `unreachable-node` | warning |
  | `dead-end-node` (non-terminal with no outgoing edge) | error |
  | `multiple-default-edges` (>1 default edge from same source) | error |
  | `approval-missing-signal-coverage` | error |
  | `condition-missing-signal-coverage` | error |
  | `illegal-guard-for-source` (e.g. `approved` out of a condition) | error |
  | `expression-syntax` | error |
  | `terminal-has-outgoing` | warning |

  **Signal coverage (amended from review #3)**: for each required signal a node emits (`approved`/`denied` on approvals, `true`/`false` on conditions), there must be *either* an exact-`when` edge *or* a default edge. The validator calls `resolveNextEdge(wf, nodeId, signal)` for each required signal so the check matches runtime semantics exactly. This permits e.g. `approved` + `default` edge pairs, which the earlier "both exact guards required" phrasing over-constrained.

  **Expression syntax (amended from review #2)**: small additive extension to `src/core/workflow/expression.ts` — `ExpressionError` now carries `readonly kind: 'syntax' | 'undefined-variable' | 'non-object' | 'type' | 'unknown-operator' | 'unsupported-value'`. `validateExpressionSyntax` matches on `err.kind` (ignoring the three variable-bound kinds that are expected at edit time) instead of sniffing message prefixes. Back-compat: constructor accepts the old `(message, position?: number)` signature, so the Phase 1 evaluator tests stay green.

- `src/core/workflow/layout.ts` — `layoutWorkflow(wf, overrides?): { positions, size, edgePaths }`. BFS-leveled layout (rank = depth from `startNodeId`, x = indexInRank × `COLUMN_STEP`, y = rank × `ROW_STEP`); overrides from `WorkflowLayout.positions` win per-node.

  **Corner cases (amended from review #5)**:
  - Unreachable nodes are piled into a trailing orphan lane (each on its own y below `max(reachableRank)+1`), so they always render somewhere.
  - Back-edges (target rank ≤ source rank) route through a lateral channel to the left of the graph (`M src.left → channelX → target.left`) so they're visibly distinct from forward edges.
  - Self-loops render as an SVG cubic-Bezier semicircle bulging out the right side of the node.
- `src/core/workflow/__tests__/validate.test.ts` — one `it` per rule (positive + negative). Shipped templates must validate clean.
- `src/core/workflow/__tests__/layout.test.ts` — rank assertions + override-wins.

### Schema extension (additive only)

- `src/core/workflow/workflowSchema.ts` — add and export:
  ```ts
  interface WorkflowLayout {
    readonly workflowId: string
    readonly workflowVersion: number
    readonly positions: Readonly<Record<string, { x: number; y: number }>>
  }
  ```
  `Workflow` / `WorkflowNode` unchanged. `advance()`, `findNode`, `resolveNextEdge`, `templates.ts`, and Phase 1 tests stay green.

### New UI

- `src/ui/WorkflowBuilderModal.tsx` — modal shell (focus-trap matching `ConfigPanel.focusTrap.test.tsx` pattern), owns draft `{workflow, layout}`, single-level undo (stack ≤10, cleared on close), hosts the three panes, Save disabled while any `severity:'error'` issue exists.
- `src/ui/WorkflowBuilderModal.module.css`.
- `src/ui/WorkflowCanvas.tsx` — SVG canvas: renders nodes + edges via `layoutWorkflow`, click-source-handle → click-target to connect, drag to reposition (snap 20px grid), selection state, active-node pulse when simulator hands back `currentNodeId`.
- `src/ui/WorkflowNodeInspector.tsx` — per-type forms:
  - common: read-only `id`, editable `label`
  - condition: `expr` textarea with debounced syntax check
  - approval: `assignTo`, `slaMinutes`, `onTimeout` (`escalate|auto-approve|auto-deny`)
  - notify: `channel`, `template`
  - terminal: `outcome` (`finalized|denied|cancelled`)
- `src/ui/WorkflowEdgeGuardPicker.tsx` — popover after edge creation; options filtered by source type (condition→`true`/`false`, approval→`approved`/`denied`, notify/terminal→`default`).
- `src/ui/WorkflowSimulator.tsx` — variables JSON textarea (pre-seeded `{"event":{"cost":1000},"actor":{"role":"director"}}`), Start/Approve/Deny(+reason)/Cancel/Reset buttons wired to `advance()`, current node badge, colored emit log, history table from `instance.history`. Emits `onActiveNodeChange` so canvas can highlight. **Step cap (amended from review #8)**: internal counter enforces ≤100 actions per simulator session; on reaching the cap, action buttons are disabled with a visible "step limit reached — reset to continue" banner. (Note: `advance()` is already cycle-guarded within a single call, but a user can still keep pressing Approve on a pathological graph — the UI cap covers that.)
- Component tests: `WorkflowBuilderModal.test.tsx`, `WorkflowCanvas.test.tsx`, `WorkflowSimulator.test.tsx` under `src/ui/__tests__/`.

### Persistence hook (mirrors `useSavedViews`)

- `src/hooks/useSavedWorkflows.ts` — localStorage-backed. Key `wc-saved-workflows-${calendarId}`, wrapper `{ version: 1, workflows: SavedWorkflow[] }`:
  ```ts
  interface SavedWorkflow {
    readonly id: string
    readonly name: string
    readonly createdAt: string
    readonly workflow: Workflow
    readonly layout: WorkflowLayout
  }
  ```
  Returns `{ workflows, saveWorkflow, updateWorkflow, deleteWorkflow }`. `updateWorkflow` bumps `workflow.version`.
- `src/hooks/__tests__/useSavedWorkflows.test.ts`.

**Persistence destination (amended from review #4)**:
- Owner: `useSavedWorkflows(calendarId)` is the single source of truth for saved workflows. No `ownerConfig` / ConfigPanel-side plumbing in Phase 2 — hosts who want server-side persistence subscribe to the hook's return and sync themselves.
- Layout coupling: `WorkflowLayout.positions` lives in the same `SavedWorkflow` record, keyed by `workflow.id`. On fork-from-template, the new `SavedWorkflow` gets a deep-cloned layout so the forked graph opens laid out identically to its parent; thereafter they evolve independently.
- Runtime consumption (dispatching `advance()` against saved workflows at event time) is **out of scope for Phase 2** — the builder ships as an authoring tool only. Phase 3 can wire saved workflows into the host's event lifecycle.

### ConfigPanel integration

- `src/ui/ConfigPanel.tsx` — add a **new tab id** to avoid collision with the existing `workflows` *section* id (the section already contains `templates`/`smartViews`/`approvals`/`conflicts`/`requestForm`). Use `approvalFlows`:
  1. Append `{ id: 'approvalFlows', label: 'Approval Flows' }` to the `TABS` array (`ConfigPanel.tsx:39-50`).
  2. Add `'approvalFlows'` to the `tabs` list of the `workflows` entry in `SECTIONS` (`ConfigPanel.tsx:58`) — position it right after `'approvals'` so the Approvals tab and Approval Flows builder sit side-by-side.
  3. Add a render branch `{tab === 'approvalFlows' && <ApprovalFlowsTab ... />}` next to the existing `tab === 'approvals'` branch (~`ConfigPanel.tsx:227`).
- New local `ApprovalFlowsTab` component (in `ConfigPanel.tsx` alongside `TemplatesTab`/`SmartViewsTab`):
  - reads `WORKFLOW_TEMPLATES` + `useSavedWorkflows(calendarId)`
  - renders "Starter templates" (Edit opens modal in **fork** mode — deep-clone template with fresh `createId('wf')`) and "My workflows" (Edit + Delete)
  - "Create blank workflow" button — seeds the minimal validator-clean shape: one `approval` + two `terminal` (finalized/denied) + the two guarded edges
  - owns `editing` state; when set, mounts the lazy-loaded `WorkflowBuilderModal`
- Existing tests that look up tabs by id (`ConfigPanel.approvalsTab.test.tsx`, `ConfigPanel.focusTrap.test.tsx`) continue to pass because no existing ids are renamed.

### E2E

- `tests-e2e/workflow-builder.spec.ts` — open ConfigPanel → Workflows, Edit `conditional-by-cost`, drag `notify-ops`, change `director.assignTo`, simulate with cost=1000 (Start → Approve → complete with emitted notify), Save, verify new entry under "My workflows" + localStorage contents.
- **Keyboard-only pass (amended from review #7)**: a second e2e scenario drives the same flow without using the mouse — Tab iterates nodes in BFS order, Arrow keys nudge a selected node by one `GRID_SNAP`, `Ctrl+E` enters edge-draw mode then Tab+Enter commits, Delete removes, Enter opens the inspector. Asserts focus-ring visibility and live-region announcements for node/edge changes.

## Existing helpers to reuse (do not re-implement)

- `findNode`, `resolveNextEdge` — `src/core/workflow/workflowSchema.ts`
- `advance`, `WorkflowAction`, `WorkflowEmitEvent` — `src/core/workflow/advance.ts`
- `evaluate`, `ExpressionError` — `src/core/workflow/expression.ts` (for syntax check only)
- `WORKFLOW_TEMPLATES` — `src/core/workflow/templates.ts`
- `createId` — `src/core/createId`
- Storage-versioned localStorage pattern — mirror `src/hooks/useSavedViews.ts`
- Modal/focus-trap + tab pattern — `src/ui/ConfigPanel.tsx` + `ConfigPanel.module.css`
- Condition-row form pattern + styling — `src/ui/AdvancedFilterBuilder.tsx` + `AdvancedFilterBuilder.module.css`

## Review amendments (applied 2026-04-20)

1. Truncation — full schema extension + later sections are in place above.
2. `ExpressionError.kind` field added (additive, back-compat); validator switched off prefix-sniffing. See "Expression syntax (amended from review #2)".
3. Approval/condition fan-out replaced with `resolveNextEdge`-based signal coverage. See "Signal coverage (amended from review #3)".
4. `SavedWorkflow` / `WorkflowLayout` persistence destination pinned — single localStorage hook; no ownerConfig plumbing; runtime wiring deferred. See "Persistence destination (amended from review #4)".
5. Layout spec'd for unreachable nodes (trailing lane), back-edges (lateral channel), self-loops (cubic Bezier). See "Corner cases (amended from review #5)".
6. Rule-by-rule severity table added to validator section above.
7. Keyboard-only e2e pass added to the E2E section; component tests gate Tab/Arrow/Ctrl+E/Enter/Delete on `WorkflowCanvas`.
8. Simulator UI step cap (100 actions/session) added to complement `advance()`'s existing cycle guard.

## Out of scope (deferred)

- SLA timers / `onTimeout` enforcement (Phase 3 per Phase 1 comment).
- `parallel` node type (Phase 4).
- In-flight `WorkflowInstance` migration when a saved workflow is edited — Phase 2 surfaces a post-save toast only ("Running instances continue on v{old}; new triggers use v{new}").
- Full multi-step undo (only single-level delete undo ships).
- Narrative screen-reader description of the graph (per-node labels + live-region announcements ship; full description is backlog).
- Hoisting `parse()` out of `expression.ts` — Phase 2 uses `evaluate(expr,{})` + filtered catch.

## Verification

1. **Unit** — `npm run test` must pass; new suites cover every validator rule, layout overrides, and `useSavedWorkflows` round-trip. All three shipped templates validate clean.
2. **Component** — simulator stepping through `singleApproverWorkflow`, `twoTierApproverWorkflow`, `conditionalByCostWorkflow` reaches `status: 'completed'` with expected emit events and outcomes.
3. **E2E** — `npm run test:browser` runs `workflow-builder.spec.ts`; assertions on SVG node count, drag-applied position, simulator outcomes, and localStorage persistence.
4. **Bundle** — re-run the audit in `docs/bundle-size-audit.md`; main chunk delta ≤2 KB gzipped (the builder loads lazily). Record new baseline.
5. **Type check** — `npm run type-check` clean under strict.
6. **Manual demo** — `npm run dev`, open ConfigPanel → Workflows, fork `conditional-by-cost`, edit `director.assignTo`, drag a node, simulate cost=1000 and cost=100, save, reload demo, confirm the saved workflow persists.

## Critical files

- `src/core/workflow/validate.ts` (new)
- `src/core/workflow/layout.ts` (new)
- `src/core/workflow/workflowSchema.ts` (additive: `WorkflowLayout` export)
- `src/ui/WorkflowBuilderModal.tsx` (new)
- `src/ui/WorkflowCanvas.tsx` (new)
- `src/ui/WorkflowNodeInspector.tsx` (new)
- `src/ui/WorkflowSimulator.tsx` (new)
- `src/ui/WorkflowEdgeGuardPicker.tsx` (new)
- `src/hooks/useSavedWorkflows.ts` (new)
- `src/ui/ConfigPanel.tsx` (add `approvalFlows` tab to TABS + `workflows` SECTION, render `ApprovalFlowsTab`, lazy-mount modal)
- `tests-e2e/workflow-builder.spec.ts` (new)
