> **Status: HISTORICAL** — Epic #219 and all sub-issues (#220–#223) closed 2026-04-21. Do not treat as active work.

# Workflow DSL — Sprint Plan to Close Epic #219

## Context

Epic #219 (Workflow / Approval DSL) is split into four phases. Current
state on 2026-04-20 (post-audit):

| Phase | Issue | State | Notes |
|---|---|---|---|
| P1 JSON schema + interpreter | #220 | **Closed** | commit `da05b47` |
| P2 Visual builder | #221 | **Closed** | shipped via PRs #237–244; closed via comment `4284955436` |
| P3 SLA timers + escalation | #222 | Not started | schema fields already present |
| P4 Branching, parallel, notify | #223 | Not started | `notify` schema + emit stub already present |

Goal: close #222, #223 (and therefore the epic #219) on fresh branches
per sprint. **Three sprints** remain (plus one optional cleanup).

### Audit-corrected state of the codebase

An earlier draft of this plan included a "Sprint B — EventBus wiring"
intermediate. That sprint was based on a **false premise** that the
`#216` bus existed but wasn't firing. The audit proved otherwise:

- **`#216` is done and wired.** `src/core/engine/eventBus.ts` (commit
  `860fa9b`) is a typed `EventBus` class with async + error-isolated
  dispatch. `CalendarEngine` already emits `booking.requested /
  approved / denied / cancelled / completed` + `assignment.created /
  removed` via `applyMutation` state diffs. Tests in
  `src/core/engine/__tests__/eventBus.test.ts` +
  `eventBusIntegration.test.ts` cover the contract.
- **Orphan `src/core/events/eventBus.ts`** — a superseded first-pass
  from the morning of 2026-04-20 (commit `cd2d58d`) under the same
  `#216` tag. It has **zero production consumers** (only its own test
  file imports it). Cleaned up in this PR.
- **`slaMinutes` / `onTimeout` fields** — already on
  `WorkflowApprovalNode` (`src/core/workflow/workflowSchema.ts:42-44`)
  and rendered in `WorkflowNodeInspector.tsx:200-236` (labelled
  "Phase-3 feature; stored but not yet enforced"). Schema work for
  #222 is done — only runtime enforcement + UI countdown remain.
- **`notify` node schema** — present
  (`src/core/workflow/workflowSchema.ts:47-52`); `advance.ts:255-261`
  already emits a `WorkflowEmitEvent` with type `'notify'`. No channel
  dispatch exists yet.
- **Expression evaluator** — `src/core/workflow/expression.ts`
  `evaluate(expr, vars)` is reusable; #223's template interpolation
  is a small wrapper that regex-extracts `{{...}}` and delegates.
- **AuditDrawer** — `src/views/AuditDrawer.tsx:87-125` already renders
  per-step times; `.entryMeta` (`AuditDrawer.module.css:130-134`) is
  the natural attachment point for an SLA countdown pill.
- **Adapter precedent** — props-callback pattern (`onApprovalAction`
  in `src/WorksCalendar.tsx:188`) is the template for #222's
  `onTick`; `CalendarAdapter.subscribeLifecycle?(bus)` is the template
  for #223's channel registry subscribing to the live engine bus.

## Branching strategy

One branch / PR per sprint. All branch off `main`.

```
main
├── claude/workflow-epic-plan-P1nAu          (plan + orphan cleanup — this branch)
├── claude/workflow-p3-sla-timers            (Sprint 1 — #222)
├── claude/workflow-p4-parallel-and-channels (Sprint 2 — #223)
└── claude/workflow-epic-close               (Sprint 3 — doc + close-out, only if needed)
```

Each PR references "Closes #NNN" so GitHub auto-closes on merge; epic
#219 closes with Sprint 3 (or via the last sub-issue's PR body if no
separate docs ship).

---

## Sprint 0 (complete) — Orphan cleanup · this branch

**Effort: ~5 min. Landing on `claude/workflow-epic-plan-P1nAu`.**

Deleted:
- `src/core/events/eventBus.ts` — orphan first-pass at #216, superseded
  by `src/core/engine/eventBus.ts` the same day.
- `src/core/events/__tests__/eventBus.test.ts` — only consumer of the
  orphan.
- Empty `src/core/events/` and `src/core/events/__tests__/` directories.

Zero production consumers affected. No test regressions possible — the
test file being deleted is the only one that referenced the module.

---

## Sprint 1 — P3 SLA timers + escalation · Closes #222

**Effort: ~3–4 days. Fresh branch: `claude/workflow-p3-sla-timers`.**

### Runtime (core)

- `src/core/workflow/workflowSchema.ts`
  - Add `'timeout'` to the `EdgeGuard` union.

- `src/core/workflow/advance.ts`
  - Add `WorkflowAction` variant `{ type: 'timeout' }`. Handle per
    `approval.onTimeout`:
    - `escalate` → walk an edge with `when: 'timeout'` (validate-time
      error if none); current node exits with signal `'timeout'`.
    - `auto-approve` / `auto-deny` → walk the standard
      `approved`/`denied` edge (reuses existing `resolveNextEdge`).
  - New pure function:
    ```ts
    export function tick(
      workflow: Workflow,
      instance: WorkflowInstance,
      nowIso: string,
    ): AdvanceResult | null
    ```
    Returns a timeout advance result if the currently-awaited approval
    step's `slaMinutes` has elapsed since its `history[-1].enteredAt`;
    otherwise `null`. Pure — host drives via `setInterval` or external
    scheduler.

- `src/core/workflow/validate.ts`
  - New rule `timeout-edge-missing` (severity: **error** when
    `onTimeout === 'escalate'` and no outgoing `when:'timeout'` edge;
    severity: **warning** when `slaMinutes` is set but no `onTimeout`
    configured).
  - Extend `illegal-guard-for-source` so `'timeout'` is only valid out
    of an `approval` node that has `slaMinutes` set.

### Engine bus channel (optional, scope-dependent)

`#222` mentions a `workflow.step.timedout` bus event. Two options:
1. Add it to `src/core/engine/eventBus.ts` `BookingChannel` union.
2. Skip — tick emits the same structured `WorkflowEmitEvent` pattern
   as existing `node_exited`, which is already persisted to history.

Recommend (2) — matches the existing workflow emit pattern. Revisit if
the host needs an out-of-band timeout hook.

### Host adapter

- `src/WorksCalendar.tsx` — add optional prop:
  ```ts
  readonly onWorkflowTick?: (instance, nowIso) => AdvanceResult | null
  ```
  plus a bundled hook `useWorkflowTicker(intervalMs = 60_000)` that
  calls `tick()` on `setInterval`. Follows `onApprovalAction`
  precedent. Host opts in — silent no-op by default.

### UI

- `src/ui/WorkflowEdgeGuardPicker.tsx` — add `'timeout'` guard option
  when source is an approval node with `slaMinutes > 0`.
- `src/ui/WorkflowNodeInspector.tsx` — remove the "Phase-3 feature;
  stored but not yet enforced" copy once runtime lands
  (`WorkflowNodeInspector.tsx:200-220`).
- `src/ui/WorkflowSimulator.tsx` — new "Advance clock by…" control so
  authors can test timeout paths without real-time waits; calls
  `tick()` with a synthetic `nowIso`.
- `src/views/AuditDrawer.tsx` — SLA countdown pill on the active
  approval entry. Compute `slaMinutes - (now - enteredAt)`; render in
  `.entryMeta`. Red styling when negative.

### Templates

- `src/core/workflow/templates.ts` — extend
  `conditionalByCostWorkflow`: add `slaMinutes: 240, onTimeout:
  'escalate'` on the director step plus a `timeout` edge to a new
  `escalated` approval.

### Tests

- `src/core/workflow/__tests__/tick.test.ts` (new) — tick before SLA
  returns null; tick after SLA returns timeout action; each
  `onTimeout` behavior reaches the expected terminal; cycle-guard.
- `src/core/workflow/__tests__/validate.test.ts` — cover new rules.
- `src/ui/__tests__/WorkflowSimulator.test.tsx` — Advance-clock
  exercises timeout path.
- `tests-e2e/workflow-builder.spec.ts` — extend: author adds timeout
  edge via picker, simulates elapsed SLA, asserts `timeout` emit.

### Bundle budget

Re-run the audit. Main-chunk delta expected negligible (tick + schema
deltas are tiny); simulator-side "Advance clock" adds <0.5 kB to the
lazy builder chunk.

### Verification

- `npm run test`, `npm run type-check`, `npm run test:browser`.
- Manual: fork `conditional-by-cost`, set director SLA to 1 min,
  simulate via Advance-clock, observe `timeout` path.

Open PR, body "Closes #222."

---

## Sprint 2 — P4 parallel + channels + notify dispatch · Closes #223

**Effort: ~5–7 days. Fresh branch: `claude/workflow-p4-parallel-and-channels`.**

Two concerns in one issue: parallel branching *and* notify-channel
dispatch. Splittable into sub-PRs if review fatigue becomes a risk.

### Schema (additive)

- `src/core/workflow/workflowSchema.ts` — add:
  ```ts
  interface WorkflowParallelNode {
    readonly id: string
    readonly type: 'parallel'
    readonly branches: readonly string[]
    readonly mode: 'requireAll' | 'requireN' | 'requireAny'
    readonly n?: number
    readonly label?: string
  }
  interface WorkflowJoinNode {
    readonly id: string
    readonly type: 'join'
    readonly pairedWith: string
    readonly label?: string
  }
  ```
- New `EdgeGuard`: `'branch-completed'` for join-incoming edges.

### Interpreter

- `src/core/workflow/advance.ts`
  - `autoAdvance` on `parallel`: enter each branch, track branch
    states in `instance.parallelState: Record<parallelId, Set<doneBranchId>>`
    (additive field on `WorkflowInstance` — deep-frozen).
  - On child-branch completion, emit `branch-completed` edge into the
    paired join; advance join only when `mode` quorum met.
  - Keep cycle-guard; count parallel branches toward the bound.

### Channel registry

- `src/core/workflow/channels.ts` (new) — adapter interface:
  ```ts
  interface WorkflowChannelAdapter {
    readonly id: string
    dispatch(payload: { template?: string; vars: Record<string, unknown>; at: string }): Promise<void>
  }
  export function registerWorkflowChannel(adapter: WorkflowChannelAdapter): void
  export function listChannels(): readonly WorkflowChannelAdapter[]
  ```
- Built-in adapters (thin, host-configured):
  - `src/core/workflow/channels/webhook.ts` — POSTs JSON to a URL
  - `src/core/workflow/channels/slack.ts` — webhook wrapper shaping the
    Slack message payload
  - `src/core/workflow/channels/email.ts` — emits an SMTP-shaped
    payload for the host to relay
- `advance.ts` on entering a `notify` node: fire-and-forget
  `dispatch(...)` on the matching registered channel. Errors are
  isolated — recorded in history as an emit event with `error: string`
  but do **not** block the flow (per #223 acceptance criteria).

  Optionally publish a new `workflow.notify.dispatched` channel on the
  engine bus to enable host telemetry; gate on whether tests demand
  it.

### Template interpolation

- `src/core/workflow/templateInterpolate.ts` (new):
  ```ts
  export function interpolateTemplate(template: string, vars: Record<string, unknown>): string
  ```
  Regex-extracts `{{expr}}`, delegates to `expression.evaluate(expr, vars)`,
  stringifies results. Handles escaped `\{\{…\}\}` as a literal.
- Reuse `evaluate` at `src/core/workflow/expression.ts`.

### Validator

- New rules:
  - `parallel-join-unpaired` (error) — every `parallel` must be paired
    with exactly one `join.pairedWith = parallel.id`; every `join` must
    reference an existing `parallel`.
  - `parallel-branches-rejoin` (error) — each branch from a `parallel`
    must reach its paired `join` before any terminal.
  - `parallel-require-n-bounds` (error) — when `mode='requireN'`, `1 ≤
    n ≤ branches.length`.
  - `unknown-channel` (warning) — `notify.channel` doesn't match any
    registered adapter id (warn at validate-time — strict at runtime
    is host's call).
  - `template-syntax` (error) — `interpolateTemplate` fails to parse.

### Layout + canvas

- `src/core/workflow/layout.ts` — treat parallel as a standard fan-out
  source; join as a fan-in target. Existing BFS handles both; only
  rendering changes needed.
- `src/ui/WorkflowCanvas.tsx` — two new `kindClass` branches.
- `src/ui/WorkflowCanvas.module.css` — add `.nodeKindParallel` +
  `.nodeKindJoin` with distinct color + diamond/inverted-diamond hint
  via SVG path swap.

### Inspector + picker

- `src/ui/WorkflowNodeInspector.tsx` — add parallel (`mode`, `n`,
  `branches`-summary) and join (`pairedWith` dropdown filtered to
  parallel nodes) forms.
- `src/ui/WorkflowEdgeGuardPicker.tsx` — parallel-out edges accept
  `'default'` only; join-in edges accept `'branch-completed'` only.
- `src/ui/WorkflowBuilderModal.tsx` — add parallel/join buttons to
  node-add palette.

### Templates

- `src/core/workflow/templates.ts` — add
  `parallelSecurityAndFinanceApproval`: parallel (requireAll) fans out
  to security + finance approvals, joins, then terminal. Validates
  clean.

### Tests

- `src/core/workflow/__tests__/advance.parallel.test.ts` — 2-of-3
  requireN finalizes when 2 approve regardless of order; requireAny
  short-circuits; requireAll waits.
- `src/core/workflow/__tests__/templateInterpolate.test.ts` — happy
  path + escape + missing var passthrough.
- `src/core/workflow/__tests__/channels.test.ts` — registry
  register/list/dispatch isolation when one channel throws.
- `src/core/workflow/__tests__/validate.test.ts` — all four new rules.
- `src/ui/__tests__/WorkflowCanvas.test.tsx` — parallel/join render +
  palette buttons.
- `tests-e2e/workflow-builder.spec.ts` — fork the new parallel
  template, simulate full run, verify two simultaneous awaits.
- Slack channel e2e via mock webhook (per #223 acceptance): nock or
  simple `http.createServer` fixture in `tests-e2e/support/`.

### Bundle budget

Parallel + join add ~2 kB gzip to the lazy builder chunk; channel
registry is in the main chunk (small, ~0.5 kB gzip) since hosts may
want to register channels at app boot. Re-audit in
`docs/bundle-size-audit.md`.

### Verification

- `npm run test`, `npm run type-check`, `npm run test:browser`.
- Manual: build a parallel workflow, register a mock webhook channel,
  simulate, assert webhook receives payload with interpolated template.

Open PR, body "Closes #223."

---

## Sprint 3 — Close the epic · Closes #219

**Folded into the Sprint 2 PR on `claude/workflow-p4-parallel` — the
docs updates are small enough that a separate PR + branch was not
worth the overhead.**

Status:

1. ✅ #220, #221, #222, #223 all closed (closed 2026-04-21).
2. ✅ Summary comment posted on #219.
3. ✅ #219 closed as completed (2026-04-21).
4. ✅ Updated `README.md` feature list — SLA timers, parallel/join
   approvals with quorum, and pluggable notification channels.
5. ✅ Added `docs/bundle-size-audit.md` with the post-P4 snapshot;
   the Phase-2 audit is preserved under `docs/archive/analysis/` as
   the prior baseline.
6. ✅ Updated `docs/Workflow.md` — removed "Planned phases", marked
   all four phases as shipped, and refreshed the node-type and
   starter-template tables for P3/P4 additions.

---

## Out of scope (deferred beyond #219)

- Multi-step undo in the visual builder (single-level delete undo
  shipped in P2).
- In-flight instance migration when a saved workflow is edited (Phase
  2 surfaces a post-save toast only).
- Slack channel with OAuth token flow (P4 ships webhook-based Slack
  only — deeper integration is a separate issue).
- Per-instance SLA pause/resume (out-of-hours handling) — future
  issue.

---

## Verification across the full epic

After Sprint 2 merges (i.e. #219 substantively closed):

1. `npm run test` — all unit + component suites green (≥1700 tests
   post-P4).
2. `npm run type-check` clean under strict.
3. `npm run test:browser` — mouse, keyboard, SLA-timeout, parallel
   workflow e2e scenarios all green.
4. `npm run build` — main chunk delta vs. pre-P2 baseline ≤3 kB
   gzipped; visual-builder lazy chunk ≤25 kB gzipped; channel registry
   fits in main chunk (<1 kB gzip).
5. Manual demo walkthrough: fork `parallelSecurityAndFinanceApproval`,
   edit director SLA, register a mock webhook, simulate cost=1000 →
   approvals → notifies → completed.

## Critical files summary

**Sprint 1 (#222)** — `src/core/workflow/{workflowSchema,advance,validate,templates}.ts`, `src/ui/{WorkflowEdgeGuardPicker,WorkflowNodeInspector,WorkflowSimulator}.tsx`, `src/views/AuditDrawer.tsx`, `src/WorksCalendar.tsx`.

**Sprint 2 (#223)** — `src/core/workflow/{workflowSchema,advance,validate,templates,templateInterpolate,channels}.ts` + `channels/{webhook,slack,email}.ts`, `src/ui/{WorkflowCanvas,WorkflowNodeInspector,WorkflowEdgeGuardPicker,WorkflowBuilderModal}.tsx`, `src/ui/WorkflowCanvas.module.css`.
