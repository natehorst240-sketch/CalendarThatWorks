# Sprint Roadmap: Grouping, Filtering & Sorting — Phased Implementation

**Created:** 2026-04-16
**Based on:** [Executive Summary](./GROUPING_SPRINT_EXECUTIVE_SUMMARY.md) | [Viability Analysis](./INFINITE_GROUPING_VIABILITY_ANALYSIS.md)
**Approach:** Option C — Phased (7-9 weeks, 9 sprints)
**Sprint Cadence:** 1-week sprints (5 working days)

---

## Overview

```
Phase 1: Enhanced Filtering        [Sprint 1-2]  Weeks 1-2
Phase 2: Single-Level Grouping     [Sprint 3-5]  Weeks 3-5
Phase 3: Multi-Level Grouping      [Sprint 6-9]  Weeks 6-9
```

### Event Processing Pipeline (Target Architecture)

```
rawEvents
  → normalize (eventModel.js)
  → expand recurring (CalendarEngine.ts)
  → filter (filterEngine.js)        ← Phase 1 enhances
  → sort (new: sortEngine.ts)       ← Phase 2 introduces
  → group (new: groupingEngine.ts)  ← Phase 2-3 builds
  → render (views)
```

---

## Phase 1: Enhanced Filtering (Weeks 1-2)

> Build on the existing solid filter infrastructure. Deliver immediate user value with low risk.

### Sprint 1 — Logical Filter Operators & Schema Extensions

**Goal:** Add AND/OR/NOT compound logic to the filter system.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Define `LogicalFilter` types (AND/OR/NOT tree) | `src/types/filtering.ts` (new) | 0.5d |
| 2 | Implement `evaluateLogicalFilter()` engine | `src/filters/logicalFilter.ts` (new) | 1d |
| 3 | Integrate logical filters into `applyFilters()` pipeline | `src/filters/filterEngine.js` | 0.5d |
| 4 | Add new filter field factories (date-range, numeric-range) | `src/filters/filterSchema.ts` | 1d |
| 5 | Unit tests for logical operators (20+ cases) | `src/filters/__tests__/logicalFilter.test.ts` (new) | 1d |
| 6 | Update `normalizeSavedView` whitelist for new filter shape | `src/hooks/useSavedViews.js:26-39` | 0.5d |

**Exit Criteria:**
- [ ] `applyFilters()` accepts both flat and logical filter trees
- [ ] All existing 36+ tests pass (zero regressions)
- [ ] 20+ new unit tests for logical operators at 90%+ coverage
- [ ] Saved views round-trip with new filter shapes

**Risks:** Low — additive changes only, existing filter API unchanged.

---

### Sprint 2 — FilterBuilder UI & Saved Views Enhancements

**Goal:** Ship a user-facing FilterBuilder panel and improve saved views.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Build `FilterBuilder` component (collapsible panel) | `src/ui/FilterBuilder.tsx` (new) | 1.5d |
| 2 | Add AND/OR/NOT toggle UI within FilterBuilder | `src/ui/FilterBuilder.tsx` | 0.5d |
| 3 | Wire FilterBuilder into `WorksCalendar.tsx` | `src/WorksCalendar.tsx` | 0.5d |
| 4 | Style FilterBuilder across all 8 themes | `src/styles/FilterBuilder.module.css` (new) | 1d |
| 5 | Saved views v2→v3 migration (add filter tree support) | `src/hooks/useSavedViews.js` | 0.5d |
| 6 | Integration tests + Storybook stories (3 stories) | Tests + stories | 1d |

**Exit Criteria:**
- [ ] Users can build compound filters via UI
- [ ] FilterBuilder renders correctly in all 8 themes
- [ ] Saved views migrate seamlessly from v2→v3
- [ ] 3 Storybook stories demonstrating filter combinations

**Risks:** Medium — new UI component needs theme compatibility testing.

---

## Phase 1 Milestone

**Deliverable:** Production-ready advanced filtering with AND/OR/NOT logic, FilterBuilder UI, and enhanced saved views.

**Performance Budget:** <50ms filter + logical evaluation on 1000 events.

---

## Phase 2: Single-Level Grouping (Weeks 3-5)

> Introduce grouping infrastructure. Start with TimelineView only, then extend to AgendaView.

### Sprint 3 — Grouping Types, Engine & Sort Infrastructure

**Goal:** Build the core grouping and sorting engines (no view integration yet).

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Define `GroupConfig`, `GroupResult`, `SortConfig` types | `src/types/grouping.ts` (new) | 0.5d |
| 2 | Implement `useGrouping` hook (single-level only) | `src/hooks/useGrouping.ts` (new) | 1.5d |
| 3 | Implement `sortEngine.ts` (field + direction + tiebreakers) | `src/core/sortEngine.ts` (new) | 1d |
| 4 | Build `useNormalizedConfig` hook (simple→complex upgrade) | `src/hooks/useNormalizedConfig.ts` (new) | 0.5d |
| 5 | Unit tests: grouping engine (15+ cases) + sort engine (10+ cases) | `src/hooks/__tests__/`, `src/core/__tests__/` | 1.5d |

**Key Design Decisions:**
- Group **after** filter, **after** occurrence expansion
- Work with `expandedEvents` from `WorksCalendar.tsx:406`
- `useGrouping` returns `{ groups: GroupResult[], ungrouped: Event[] }`
- Empty groups shown by default (configurable)

**Exit Criteria:**
- [ ] `useGrouping({ events, groupBy: "location" })` returns correct groups
- [ ] `sortEngine` handles field/direction/tiebreakers
- [ ] `useNormalizedConfig` upgrades `groupBy="location"` → full `GroupConfig`
- [ ] 25+ unit tests passing at 90%+ coverage

**Risks:** Low — engine-only, no view changes.

---

### Sprint 4 — TimelineView Grouping Integration

**Goal:** Wire grouping into TimelineView with group headers and collapse/expand.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Build `GroupHeader` component (name, count, collapse toggle) | `src/ui/GroupHeader.tsx` (new) | 1d |
| 2 | Refactor TimelineView employee rows to use `useGrouping` | `src/views/TimelineView.jsx:73-100` | 1.5d |
| 3 | Add `groupBy` prop to `WorksCalendar.tsx` | `src/WorksCalendar.tsx` | 0.5d |
| 4 | Collapse/expand state management | `src/hooks/useGrouping.ts` | 0.5d |
| 5 | Style GroupHeader across all 8 themes | `src/styles/GroupHeader.module.css` (new) | 0.5d |
| 6 | Integration tests: TimelineView + grouping (10+ cases) | Tests | 1d |

**Critical Path:** TimelineView currently hardcodes employee grouping (`TimelineView.jsx:97-100`). Must preserve backward compat — when no `groupBy` is set, behavior is identical to today.

**Exit Criteria:**
- [ ] `<WorksCalendar groupBy="location" view="schedule" />` renders grouped rows
- [ ] Collapse/expand works with keyboard (a11y)
- [ ] Existing TimelineView tests pass unchanged
- [ ] GroupHeader renders in all 8 themes

**Risks:** High — modifying TimelineView's rendering. Mitigated by composition (wrapper) not modification.

---

### Sprint 5 — AgendaView Grouping + Saved Views + Sort UI

**Goal:** Extend grouping to AgendaView, persist grouping in saved views, add sort controls.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Integrate `useGrouping` into AgendaView | `src/views/AgendaView.jsx` | 1d |
| 2 | Add `groupBy`, `sort` to saved views whitelist + migration | `src/hooks/useSavedViews.js` | 0.5d |
| 3 | Build sort direction toggle UI | `src/ui/SortControls.tsx` (new) | 1d |
| 4 | Wire sort controls into WorksCalendar toolbar | `src/WorksCalendar.tsx` | 0.5d |
| 5 | Performance benchmarks (500 events, single-level grouping) | `scripts/perf-benchmark.js` (new) | 0.5d |
| 6 | E2E tests: grouping + filtering + saved views (5 scenarios) | `tests-e2e/grouping.spec.ts` (new) | 1.5d |

**Exit Criteria:**
- [ ] AgendaView groups events by specified field
- [ ] Saved views persist and restore `groupBy` + `sort` config
- [ ] Sort toggle UI works in TimelineView and AgendaView
- [ ] Performance: <100ms grouping on 500 events
- [ ] 5 E2E tests passing

**Risks:** Medium — AgendaView is simpler (89 lines) so integration is lower risk.

---

## Phase 2 Milestone

**Deliverable:** Single-level grouping in TimelineView and AgendaView, sorting controls, saved views integration.

```jsx
<WorksCalendar
  events={events}
  employees={employees}
  groupBy="location"    // or "shift" or "specialty"
  sort={{ field: "start", direction: "asc" }}
  view="schedule"
/>
```

**Performance Budget:** <100ms grouping, 60fps rendering on 500 events.

---

## Phase 3: Multi-Level Grouping (Weeks 6-9)

> Extend to nested grouping (max 3 levels), cross-group visibility, and DnD between groups.

### Sprint 6 — Multi-Level Grouping Engine (2 levels)

**Goal:** Extend grouping engine to support 2-level nesting.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Extend `useGrouping` for recursive nesting (2 levels) | `src/hooks/useGrouping.ts` | 1.5d |
| 2 | Nested `GroupHeader` with indentation levels | `src/ui/GroupHeader.tsx` | 0.5d |
| 3 | Extend `useNormalizedConfig` for array `groupBy` | `src/hooks/useNormalizedConfig.ts` | 0.5d |
| 4 | Update TimelineView for nested group rendering | `src/views/TimelineView.jsx` | 1d |
| 5 | Unit tests: 2-level nesting (15+ edge cases) | Tests | 1d |
| 6 | Accessibility: keyboard nav through nested groups | `src/ui/GroupHeader.tsx` | 0.5d |

**Exit Criteria:**
- [ ] `groupBy={["location", "shift"]}` produces nested groups
- [ ] Nested collapse/expand works correctly
- [ ] Keyboard navigation through group hierarchy (ARIA tree pattern)
- [ ] 15+ tests for nesting edge cases

---

### Sprint 7 — 3-Level Nesting + Virtualization

**Goal:** Extend to 3 levels, add virtualization for large group sets.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Extend engine to 3-level nesting | `src/hooks/useGrouping.ts` | 1d |
| 2 | Virtualized group rendering (10+ groups) | `src/views/TimelineView.jsx` | 1.5d |
| 3 | Memoization strategy for group tree rendering | `src/ui/GroupHeader.tsx`, views | 0.5d |
| 4 | Performance benchmarks (1000 events, 3-level nesting) | `scripts/perf-benchmark.js` | 0.5d |
| 5 | Update AgendaView for multi-level nesting | `src/views/AgendaView.jsx` | 0.5d |
| 6 | Integration tests + visual regression tests | Tests | 1d |

**Performance Targets:**
- 60fps rendering with 1000 events, 3-level nesting
- <100ms grouping operation
- Virtualization kicks in at 10+ top-level groups

**Exit Criteria:**
- [ ] `groupBy={["location", "shift", "specialty"]}` works
- [ ] Virtualization active for large group sets
- [ ] Performance benchmarks meeting targets
- [ ] Visual regression tests baseline established

---

### Sprint 8 — Cross-Group Visibility + DnD Between Groups

**Goal:** Add `showAllGroups` and drag-and-drop between groups.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Implement `showAllGroups` logic (grayed cross-group events) | `src/hooks/useGrouping.ts` | 1d |
| 2 | Style cross-group events (dimmed, labeled with source group) | `src/styles/GroupHeader.module.css` | 0.5d |
| 3 | DnD between groups — detect target group on drop | `src/hooks/useDrag.js`, views | 1.5d |
| 4 | DnD validation — check constraints via CalendarEngine | `src/core/engine/CalendarEngine.ts` | 0.5d |
| 5 | E2E tests: cross-group visibility + DnD (5 scenarios) | `tests-e2e/grouping-advanced.spec.ts` (new) | 1d |
| 6 | Mobile touch support for group interactions | `src/hooks/useDrag.js` | 0.5d |

**Exit Criteria:**
- [ ] `showAllGroups={true}` displays dimmed cross-group events
- [ ] Drag event from Group A to Group B updates event field
- [ ] CalendarEngine validates group-change constraints
- [ ] 5 E2E scenarios passing
- [ ] Touch drag works on mobile

**Risks:** High — DnD between nested groups is the most complex feature in the roadmap.

---

### Sprint 9 — Polish, Documentation & Release

**Goal:** Final integration, docs, Storybook, and release prep.

| # | Task | Files | Est |
|---|------|-------|-----|
| 1 | Full regression test suite (all 5 views) | Tests | 1d |
| 2 | Storybook stories (8 stories covering all patterns) | Stories | 1d |
| 3 | API documentation + migration guide | `docs/` | 0.5d |
| 4 | Performance audit + optimization pass | All | 0.5d |
| 5 | Cross-browser testing (Chrome, Firefox, Safari, Edge) | QA | 0.5d |
| 6 | Mobile responsiveness audit | QA | 0.5d |
| 7 | Version bump to v0.3.0 + changelog | `package.json`, `CHANGELOG.md` | 0.5d |

**Exit Criteria:**
- [ ] All existing + new tests passing (target: 100+ total tests)
- [ ] 8 Storybook stories demonstrating all grouping patterns
- [ ] Migration guide for v0.2.x → v0.3.0
- [ ] Performance budgets met across browsers
- [ ] No accessibility regressions (WCAG 2.1 AA)

---

## Phase 3 Milestone

**Deliverable:** Full multi-level grouping (up to 3 levels), cross-group visibility, DnD between groups, complete documentation.

```jsx
<WorksCalendar
  events={events}
  employees={employees}
  groupBy={["location", "shift", "specialty"]}
  sort={[
    { field: "start", direction: "asc" },
    { field: "priority", direction: "desc" }
  ]}
  showAllGroups={true}
  view="schedule"
/>
```

---

## Summary: New Files Created

| File | Phase | Purpose |
|------|-------|---------|
| `src/types/filtering.ts` | 1 | LogicalFilter types |
| `src/types/grouping.ts` | 2 | GroupConfig, SortConfig types |
| `src/filters/logicalFilter.ts` | 1 | AND/OR/NOT evaluation |
| `src/core/sortEngine.ts` | 2 | Multi-field sorting |
| `src/hooks/useGrouping.ts` | 2 | Grouping engine hook |
| `src/hooks/useNormalizedConfig.ts` | 2 | Config normalization |
| `src/ui/FilterBuilder.tsx` | 1 | Filter UI component |
| `src/ui/GroupHeader.tsx` | 2 | Group header component |
| `src/ui/SortControls.tsx` | 2 | Sort toggle UI |

## Summary: Modified Files

| File | Phase | Change |
|------|-------|--------|
| `src/filters/filterEngine.js` | 1 | Integrate logical filter evaluation |
| `src/filters/filterSchema.ts` | 1 | New field factories |
| `src/hooks/useSavedViews.js` | 1-2 | Whitelist + v3 migration |
| `src/WorksCalendar.tsx` | 1-2 | New props, pipeline integration |
| `src/views/TimelineView.jsx` | 2-3 | Grouped rendering |
| `src/views/AgendaView.jsx` | 2-3 | Grouped rendering |
| `src/hooks/useDrag.js` | 3 | Cross-group DnD |

## Risk Register

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|-----------|--------|------------|
| Timeline regression in existing views | 2 | High | Critical | Composition over modification; full regression suite |
| Performance degradation at 3 levels | 3 | High | High | Virtualization; performance benchmarks in CI |
| Saved views migration breaks | 1-2 | Medium | High | v2→v3 migration tested; rollback path |
| DnD between nested groups complexity | 3 | High | Medium | Technical spike in Sprint 8; fallback to single-level DnD |
| Theme compat for new UI components | 1-2 | Medium | Low | CSS variables; test across all 8 themes |
| Mobile UX for nested groups | 3 | Medium | Medium | Limit mobile to 2 levels; accordion pattern |

---

**Next Step:** Stakeholder review → scope decision → Sprint 1 kickoff.
