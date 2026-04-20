# Phase 3 Sprint Plan — Multi-Level Grouping (with Phase 2 Catch-up)

**Created:** 2026-04-17
**Based on:** [Viability Analysis](./INFINITE_GROUPING_VIABILITY_ANALYSIS.md), [Sprint Roadmap](./SPRINT_ROADMAP.md)
**Branch:** `claude/create-phase-3-sprint-KCf36`
**Duration:** 7 one-week sprints (Phase 2 catch-up: 3 weeks; Phase 3: 4 weeks)
**Version target:** `v0.3.0`

---

## Context

The [viability analysis](./INFINITE_GROUPING_VIABILITY_ANALYSIS.md) rejected the original 5-day "unlimited grouping" sprint as unrealistic and recommended Option C — a phased rollout over 7-9 weeks. The [sprint roadmap](./SPRINT_ROADMAP.md) split that vision into Phases 1-3.

Current state (verified against `main` on 2026-04-17):

- **Phase 1 (~40% done):** `src/ui/AdvancedFilterBuilder.jsx` already ships a visual AND/OR condition builder inside ConfigPanel's saved-view editor. The `LogicalFilter` type/engine (`src/filters/logicalFilter.ts`) is still missing, so saved `conditions[]` arrays are stored but not evaluated. This is **not a blocker for Phase 3** — grouping is downstream of filtering and does not depend on logical filter evaluation.
- **Phase 2 (0% done):** No `useGrouping` hook, no `GroupHeader`, no `sortEngine`. `src/views/TimelineView.jsx:97-100` still hardcodes employee grouping via `e.resource`. Nothing in `WorksCalendar.tsx` accepts a `groupBy` prop.
- **Phase 3 (0% done):** Cannot start until Phase 2's single-level grouping is proven on TimelineView.

**Decision:** This sprint plan covers the Phase 2 catch-up (Sprints 3-5) **and** all of Phase 3 (Sprints 6-9) as a single 7-week programme. The Phase 1 LogicalFilter tail is called out as an independent follow-up, not a prerequisite.

**Intended outcome:**

```jsx
<WorksCalendar
  events={events}
  employees={employees}
  groupBy={["location", "shift", "specialty"]}
  sort={[
    { field: "start", direction: "asc" },
    { field: "priority", direction: "desc" },
  ]}
  showAllGroups
  view="schedule"
/>
```

renders nested, collapsible, drag-reassignable groups in TimelineView and AgendaView. MonthView, WeekView, and DayView are intentionally untouched (grid layouts don't fit grouping; confirmed by the viability analysis).

---

## Target Event Processing Pipeline

```
rawEvents
  → normalize            (src/core/eventModel.js)
  → expand recurring     (src/core/engine/CalendarEngine.ts)
  → filter               (src/filters/filterEngine.js)        existing
  → sort                 (src/core/sortEngine.ts)             Sprint 3
  → group                (src/hooks/useGrouping.ts)           Sprint 3 → 6 → 7
  → render               (views)
```

Grouping runs **after** filter and **after** occurrence expansion, consuming the `expandedEvents` memo in `src/WorksCalendar.tsx` (~line 406 — verify before edit).

---

## Architectural Rules

1. **Composition over modification.** Wrap TimelineView/AgendaView rather than rewriting. When `groupBy` is unset, behaviour must be byte-identical to today.
2. **Opt-in props.** All new props (`groupBy`, `sort`, `showAllGroups`) are additive and optional. No breaking changes to existing consumers.
3. **Grouping never mutates events.** The engine returns a tree of `GroupResult` nodes referencing events; events themselves are unchanged.
4. **Respect CalendarEngine.** DnD between groups must call into `src/core/engine/CalendarEngine.ts` for validation and for recording the mutation on the undo/redo stack — do not bypass it.
5. **Saved views whitelist is the contract.** Every persisted field (`groupBy`, `sort`, `collapsedGroups`, `showAllGroups`) must be added to `normalizeSavedView` in `src/hooks/useSavedViews.js:26-39` or it will not survive reload.

---

## Files: New vs. Modified

### New files

| File | Sprint | Purpose |
|------|--------|---------|
| `src/types/grouping.ts` | 3 | `GroupConfig`, `GroupResult`, `SortConfig` types |
| `src/core/sortEngine.ts` | 3 | Multi-field sorting with tiebreakers |
| `src/hooks/useGrouping.ts` | 3 → 6 → 7 | Single-level → 2-level → 3-level nesting engine |
| `src/hooks/useNormalizedConfig.ts` | 3 → 6 | Accept scalar/array/object `groupBy`; normalise to `GroupConfig[]` |
| `src/ui/GroupHeader.tsx` | 4 | Group row header (name, count, collapse toggle) |
| `src/ui/SortControls.tsx` | 5 | Sort field + direction UI |
| `src/styles/GroupHeader.module.css` | 4 → 8 | Theme-agnostic styles (extended for cross-group dimming in Sprint 8) |
| `scripts/perf-benchmark.js` | 5 → 7 | Baseline + multi-level benchmarks |
| `tests-e2e/grouping.spec.ts` | 5 | Phase 2 E2E suite |
| `tests-e2e/grouping-advanced.spec.ts` | 8 | Phase 3 E2E (DnD, `showAllGroups`) |

### Modified files (with anchor lines to verify before editing)

| File | Sprint | Change |
|------|--------|--------|
| `src/WorksCalendar.tsx` | 4, 5, 6, 8 | Add `groupBy`/`sort`/`showAllGroups` props; thread through `sharedViewProps` (~line 1291) and `configuredEmployees` path (~line 283) |
| `src/views/TimelineView.jsx` | 4, 6, 7, 8 | Replace hardcoded `employees.forEach` at lines 97-100 with `useGrouping`-backed rows; preserve virtualisation (`OVERSCAN_ROWS`) |
| `src/views/AgendaView.jsx` | 5, 7 | Add grouped list rendering (current file ~89 lines; simplest integration point) |
| `src/hooks/useCalendar.js` | 4, 5 | Add `groupBy` / `sort` state branches; keep existing filter state intact |
| `src/hooks/useSavedViews.js` | 5, 8 | Extend `normalizeSavedView` whitelist (line 26-39); bump storage version v2 → v3 with migration |
| `src/hooks/useDrag.js` | 8 | Augment current time-grid drag with a parallel `group-change` drag mode; do not regress the time-grid path |
| `src/core/engine/CalendarEngine.ts` | 8 | Add validation hook for group-field mutations (mirrors existing scope-based edits) |
| `src/ui/ConfigPanel.jsx` | 5 | Surface `groupBy` + `sort` controls inside the saved-view editor |

---

## Existing Utilities to Reuse

- **`src/filters/filterEngine.js:applyFilters`** — schema-driven; no changes needed. Grouping reads its output.
- **`src/filters/filterSchema.ts:FilterField`** — factory pattern to copy for `GroupField` in `src/types/grouping.ts`. Reuse `getOptions` for pulling distinct group keys out of the dataset.
- **`src/ui/AdvancedFilterBuilder.jsx`** — pattern template for `SortControls`/`GroupControls` UI (collapsible sections, condition rows, reset affordance).
- **`src/hooks/useSavedViews.js:normalizeSavedView`** (line 26-39) — add new keys here; follow the existing v1 → v2 migration style for v2 → v3.
- **`src/hooks/useDrag.js`** — preserve its pointer/bounds/undo plumbing; extend, do not replace.
- **`src/core/engine/CalendarEngine.ts`** — use its existing constraint validation (business hours, blocked windows, dependencies) when a DnD group-change is committed.
- **TimelineView virtualisation (`OVERSCAN_ROWS = 3`)** — keep when introducing nested groups; extend windowing to the group axis in Sprint 7.

---

## Sprint Breakdown

### Sprint 3 — Grouping + Sort Engines (engine-only, no view changes)

**Goal:** Ship the grouping and sort engines as pure hooks/utilities with full test coverage. No user-visible change.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Define `GroupConfig`, `GroupResult`, `SortConfig` | `src/types/grouping.ts` (new) | 0.5d |
| 2 | Implement `useGrouping` (single-level) | `src/hooks/useGrouping.ts` (new) | 1.5d |
| 3 | Implement `sortEngine` (field + direction + tiebreakers) | `src/core/sortEngine.ts` (new) | 1d |
| 4 | `useNormalizedConfig` (scalar/array/object → `GroupConfig[]`) | `src/hooks/useNormalizedConfig.ts` (new) | 0.5d |
| 5 | Unit tests: grouping (15+) + sort (10+) | `src/hooks/__tests__/`, `src/core/__tests__/` | 1.5d |

**API contract (Sprint 3 baseline):**

```ts
useGrouping({ events, groupBy: "location" })
  → { groups: GroupResult[], ungrouped: Event[] }
```

**Exit criteria:**
- [ ] All existing tests still pass (zero regressions).
- [ ] 25+ new unit tests at ≥90% coverage for new files.
- [ ] `useGrouping` produces deterministic group ordering for equal keys (tiebreak via `sortEngine`).
- [ ] Empty groups surface when `GroupConfig.showEmpty = true` (default true).

**Risk:** Low — engine-only; no component touches.

---

### Sprint 4 — TimelineView Single-Level Grouping

**Goal:** Wire `useGrouping` into TimelineView. Preserve current behaviour when `groupBy` is unset.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Build `GroupHeader` (name, count, collapse toggle) | `src/ui/GroupHeader.tsx` (new) | 1d |
| 2 | Refactor hardcoded employee rows (`TimelineView.jsx:97-100`) behind `useGrouping` with default `groupBy="resource"` when not supplied | `src/views/TimelineView.jsx` | 1.5d |
| 3 | Thread `groupBy` prop through `WorksCalendar.tsx` → `sharedViewProps` (~line 1291) and `configuredEmployees` path (~line 283) | `src/WorksCalendar.tsx`, `src/hooks/useCalendar.js` | 0.5d |
| 4 | Collapse/expand state in `useGrouping` (keyed by group path) | `src/hooks/useGrouping.ts` | 0.5d |
| 5 | `GroupHeader` theme styles (all supported themes) | `src/styles/GroupHeader.module.css` (new) | 0.5d |
| 6 | Integration tests: TimelineView + grouping (10+) | Tests | 1d |

**Critical backward-compat check:** With `groupBy` unset, TimelineView must render identical rows to the pre-refactor output. Capture a snapshot baseline **before** touching the file.

**Exit criteria:**
- [ ] `<WorksCalendar groupBy="location" view="schedule" />` renders grouped rows.
- [ ] Keyboard collapse/expand (Enter/Space on header) works.
- [ ] Existing TimelineView tests pass unchanged.
- [ ] `GroupHeader` renders correctly in Aviation, Soft, Minimal, Corporate, Forest, Ocean themes.

**Risk:** High — modifying TimelineView's rendering. Mitigation: wrap rather than rewrite; keep `OVERSCAN_ROWS` virtualisation intact.

---

### Sprint 5 — AgendaView + Saved Views + Sort UI

**Goal:** Extend single-level grouping to AgendaView; persist `groupBy`/`sort` in saved views; ship sort UI.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Integrate `useGrouping` into AgendaView | `src/views/AgendaView.jsx` | 1d |
| 2 | Add `groupBy`, `sort`, `collapsedGroups` to `normalizeSavedView` whitelist + v2→v3 migration | `src/hooks/useSavedViews.js:26-39` | 0.5d |
| 3 | `SortControls` UI (field + direction) | `src/ui/SortControls.tsx` (new) | 1d |
| 4 | Wire sort controls into the toolbar + ConfigPanel saved-view editor | `src/WorksCalendar.tsx`, `src/ui/ConfigPanel.jsx` | 0.5d |
| 5 | Perf benchmark script (500 events, single-level) | `scripts/perf-benchmark.js` (new) | 0.5d |
| 6 | E2E: group + filter + saved views (5 scenarios) | `tests-e2e/grouping.spec.ts` (new) | 1.5d |

**Exit criteria:**
- [ ] AgendaView groups events; empty groups configurable.
- [ ] Saved views round-trip `groupBy` + `sort` + `collapsedGroups`.
- [ ] v2 saved views auto-migrate to v3 on load; migration covered by test.
- [ ] Perf budget: <100ms grouping on 500 events.
- [ ] 5 E2E scenarios green.

**Risk:** Medium — AgendaView is small (~89 lines); primary risk is the saved-views migration.

---

### Sprint 6 — 2-Level Nested Grouping

**Goal:** Extend `useGrouping` to support nested grouping with 2 levels.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Recursive group builder (2 levels) | `src/hooks/useGrouping.ts` | 1.5d |
| 2 | Nested `GroupHeader` with indentation + ARIA tree pattern | `src/ui/GroupHeader.tsx` | 1d |
| 3 | Extend `useNormalizedConfig` for `groupBy: string[]` and `groupBy: GroupConfig[]` | `src/hooks/useNormalizedConfig.ts` | 0.5d |
| 4 | TimelineView nested row rendering (respect parent collapse) | `src/views/TimelineView.jsx` | 1d |
| 5 | Unit tests: 2-level nesting edge cases (15+) | Tests | 1d |
| 6 | A11y: keyboard navigation through hierarchy (Arrow keys, Home/End) | `src/ui/GroupHeader.tsx` | 0.5d |

**Exit criteria:**
- [ ] `groupBy={["location","shift"]}` produces nested trees.
- [ ] Collapsing a parent hides all descendants.
- [ ] `aria-level`, `aria-expanded`, `aria-setsize`, `aria-posinset` set correctly.
- [ ] 15+ nesting edge cases covered (empty parent, single child, duplicate keys across parents).

**Risk:** Medium — primary risk is regression in the single-level path; lock it with the Sprint 4 snapshot suite.

---

### Sprint 7 — 3-Level Nesting + Virtualisation

**Goal:** 3-level support and virtualised group rendering for large trees.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Extend engine to 3-level recursion | `src/hooks/useGrouping.ts` | 1d |
| 2 | Group-axis virtualisation (10+ top-level groups) | `src/views/TimelineView.jsx` | 1.5d |
| 3 | Memoisation strategy (stable keys, `React.memo` on headers, structural sharing) | `src/ui/GroupHeader.tsx`, views | 0.5d |
| 4 | Perf benchmarks: 1000 events × 3 levels | `scripts/perf-benchmark.js` | 0.5d |
| 5 | AgendaView 3-level rendering | `src/views/AgendaView.jsx` | 0.5d |
| 6 | Integration + visual regression tests (Playwright screenshots) | Tests | 1d |

**Perf targets:**
- 60fps rendering on 1000 events with 3-level nesting
- <100ms grouping operation
- Virtualisation engages at ≥10 top-level groups

**Exit criteria:**
- [ ] `groupBy={["location","shift","specialty"]}` works end-to-end.
- [ ] Benchmarks meet targets; numbers committed to `docs/perf-baselines.json`.
- [ ] Visual regression baseline established for grouped TimelineView + AgendaView.

**Risk:** High — virtualisation × nesting is non-trivial. Mitigation: Day-1 technical spike to validate approach before committing to it.

---

### Sprint 8 — `showAllGroups` + Drag-and-Drop Between Groups

**Goal:** Cross-group visibility and DnD event reassignment.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | `showAllGroups` logic — dim cross-group events with source label | `src/hooks/useGrouping.ts` | 1d |
| 2 | Cross-group styling (dimmed, source badge) | `src/styles/GroupHeader.module.css` | 0.5d |
| 3 | Extend `useDrag` with a `group-change` drag mode (do not regress time-grid path) | `src/hooks/useDrag.js`, views | 1.5d |
| 4 | CalendarEngine validation for group-field mutation + undo/redo entry | `src/core/engine/CalendarEngine.ts` | 0.5d |
| 5 | E2E: cross-group visibility + DnD (5 scenarios) | `tests-e2e/grouping-advanced.spec.ts` (new) | 1d |
| 6 | Mobile touch support for group drag; cap mobile to 2 levels | `src/hooks/useDrag.js` | 0.5d |

**Exit criteria:**
- [ ] `showAllGroups={true}` displays dimmed cross-group events with source group label.
- [ ] Drag from Group A to Group B updates the grouping field via CalendarEngine.
- [ ] Drop on an invalid target (constraint violation) surfaces validation feedback; original position restored.
- [ ] 5 E2E scenarios green on Chromium + Firefox + WebKit (Playwright).
- [ ] Touch drag works on the mobile viewport in Playwright.

**Risk:** Very high — the riskiest sprint in the entire phase. Mitigation: half-day spike at the start of the sprint; fallback is to ship `showAllGroups` without DnD and defer DnD to a v0.3.1 patch.

---

### Sprint 9 — Polish, Documentation, Release

**Goal:** Regression sweep, documentation, Storybook, release.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Full regression suite across all 5 views | Tests | 1d |
| 2 | Storybook stories (8 patterns: single, 2-level, 3-level, `showAllGroups`, DnD, empty groups, saved views, sort) | Stories | 1d |
| 3 | API docs + v0.2 → v0.3 migration guide | `docs/` | 0.5d |
| 4 | Perf audit + optimisation pass | All | 0.5d |
| 5 | Cross-browser QA (Chrome, Firefox, Safari, Edge) | QA | 0.5d |
| 6 | Mobile responsiveness audit | QA | 0.5d |
| 7 | Version bump to v0.3.0 + CHANGELOG | `package.json`, `CHANGELOG.md` | 0.5d |

**Exit criteria:**
- [ ] All tests green (target: 100+ total).
- [ ] 8 Storybook stories live.
- [ ] Migration guide reviewed.
- [ ] WCAG 2.1 AA — no regressions (axe-core sweep).
- [ ] Perf budgets met across browsers.

**Risk:** Medium (polish sprint); mostly QA + docs load.

---

## Risk Register (Phase 2 catch-up + Phase 3)

| Risk | Sprint | Likelihood | Impact | Mitigation |
|------|--------|-----------|--------|------------|
| TimelineView regression when `groupBy` unset | 4 | High | Critical | Snapshot tests captured before refactor; composition wrapper |
| Saved-views v2→v3 migration breaks users | 5 | Medium | High | Migration unit tests; rollback via v2 shape detection |
| 3-level virtualisation performance miss | 7 | High | High | Day-1 technical spike; perf benchmarks in CI |
| DnD between nested groups brittle | 8 | Very High | Medium | Feature-flag gate; can ship `showAllGroups` solo if DnD slips |
| Theme compat for GroupHeader + SortControls | 4, 5 | Medium | Low | CSS variables; visual test across all themes |
| Mobile UX for nested groups | 6-8 | Medium | Medium | Cap mobile to 2 levels; accordion layout |
| Phase 1 LogicalFilter arrives mid-Phase 3 | any | Low | Low | Grouping is downstream of filtering; no API coupling |

---

## Verification Plan

End-to-end proof that Phase 3 shipped successfully:

1. **Build & type-check:** `npm run build` and `npm run typecheck` clean.
2. **Unit + integration tests:** `npx vitest run` — all green, ≥90% coverage on `src/hooks/useGrouping.ts`, `src/core/sortEngine.ts`, `src/hooks/useNormalizedConfig.ts`.
3. **E2E:** `npx playwright test tests-e2e/grouping.spec.ts tests-e2e/grouping-advanced.spec.ts` on Chromium, Firefox, WebKit.
4. **Perf:** `node scripts/perf-benchmark.js` — meets budgets (<100ms grouping, 60fps render on 1000 events × 3 levels).
5. **Manual smoke:** in dev mode, open TimelineView with `groupBy={["location","shift","specialty"]}`, `showAllGroups`, and a non-trivial sort. Collapse/expand each level; drag an event between two shifts; confirm the change persists after reload (saved-view round-trip).
6. **Regression:** `<WorksCalendar />` with no new props behaves byte-identically to `v0.2.x` (snapshot suite).
7. **A11y:** axe-core scan reports zero new violations.

---

## Out of Scope

- Grouping in MonthView / WeekView / DayView (grid layouts don't fit grouping; confirmed by viability analysis).
- Groupings > 3 levels deep (hard cap enforced in `useNormalizedConfig`).
- Logical-filter (AND/OR/NOT) evaluation engine — Phase 1 tail; tracked separately.
- Saved-view folders/tags — Phase 1 tail.
- Server-side grouping — everything is client-side.

---

## Follow-Ups After Phase 3

- Complete the Phase 1 LogicalFilter engine (`src/filters/logicalFilter.ts`) and wire the AdvancedFilterBuilder `conditions[]` to real evaluation.
- Saved-view folders/tags.
- Group-level bulk actions (e.g., reassign all events in a group).
- Optional server-side grouping adapter for >10k event datasets.

---

**Next step:** Stakeholder review → Sprint 3 kickoff.
