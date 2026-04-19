# Sprint Review: Infinite Grouping, Filtering & Sorting

**Date:** 2026-04-16 (initial review) · **Updated:** 2026-04-18 (Phase A+B delivery)
**Status:** ✅ Phases A + B shipped — original scope reshaped; see **Delivery Update** at bottom.
**Full Analysis:** [INFINITE_GROUPING_VIABILITY_ANALYSIS.md](./INFINITE_GROUPING_VIABILITY_ANALYSIS.md)

> **If you only read one thing, skip to the [Delivery Update](#delivery-update--2026-04-sprint) section.** The body below is preserved as the original pre-implementation risk analysis. It correctly flagged that the 5-day scope was unrealistic; the sprint reshaped into phased delivery (A/B) under GitHub issue #134.

---

## TL;DR - Key Takeaways

### 🔴 Critical Issues

1. **Unrealistic Timeline** - 5 days proposed vs 15-20 days needed (3-4 weeks)
2. **High Breaking Change Risk** - All 5 views must be modified, high regression probability
3. **Performance Unknowns** - No benchmarks, 5-level nesting on 1000 events untested
4. **Incomplete Architecture** - No grouping infrastructure exists, building from scratch

### ✅ What's Working Well

1. **Excellent Filtering Foundation** - Schema-driven system is production-ready and extensible
2. **Solid Saved Views** - Persistence, migration, and state management already work
3. **Strong Engine Pattern** - CalendarEngine for recurring events is robust

### 💡 Recommended Path Forward

**Option A: Phased Approach (7-9 weeks total)**
- Week 1-2: Enhanced filtering + FilterBuilder UI
- Week 3-4: Single-level grouping (TimelineView only)
- Week 5-9: Multi-level grouping + all views

**Option B: Minimal Grouping (2 weeks)**
- Single-level grouping only
- TimelineView and AgendaView support
- Defer multi-level nesting to future release

**Option C: Enhanced Filtering Only (2 weeks)**
- Skip grouping entirely for now
- Focus on FilterBuilder UI and logical operators (AND/OR/NOT)
- Deliver immediate user value with lower risk

---

## Risk Assessment

| Aspect | Risk Level | Notes |
|--------|-----------|-------|
| **Timeline** | 🔴 Very High | 5 days → 20 days realistic |
| **Breaking Changes** | 🟡 High | All views affected, saved views schema changes |
| **Performance** | 🟡 High | Nested rendering, virtualization needed |
| **Testing Effort** | 🟡 High | 36 existing tests, need 50+ new tests |
| **User Confusion** | 🟢 Low | Good defaults can mitigate |
| **Technical Debt** | 🟡 Medium | +1500 LOC, new maintenance burden |

---

## Why the Original Plan Won't Work

### 1. Grouping Infrastructure Doesn't Exist

**Current State:**
- TimelineView has hardcoded employee rows
- Other views have no grouping concept
- No `GroupConfig`, `useGroupingEngine`, or group rendering components

**Reality:**
- Building this from scratch takes weeks, not days
- Each view has unique rendering logic that must be adapted

### 2. View Integration is Complex

**Current Views:**
- `MonthView` - Grid layout with day cells
- `WeekView` - Weekly columns
- `DayView` - Single day
- `AgendaView` - Flat list
- `TimelineView` - Virtualized employee rows

**Challenge:**
- Grouping makes sense for Timeline and Agenda, but NOT for Month/Week/Day grids
- Forcing grouping onto all views will break their rendering paradigms
- Each view needs different grouping UX

### 3. Performance Optimization is Non-Trivial

**Proposed:** "Add React.memo + virtualized group rendering"

**Reality:**
- Nested group rendering is complex (recursive components, collapse state)
- Current virtualization is flat (TimelineView rows)
- Cross-group visibility ("showAllGroups") doubles rendered events
- No performance baselines established

### 4. Testing Scope is Underestimated

**Proposed:**
- Unit tests: `useNormalizedConfig` + `useGroupingEngine`
- E2E tests: 5 scenarios
- Target: 95% coverage

**Reality Needed:**
- 50+ unit tests for grouping edge cases
- 20+ integration tests (grouping × filtering × sorting combinations)
- 15+ E2E tests across all views
- Performance benchmarks
- Accessibility tests
- Visual regression tests

---

## What Should Happen Next

### Immediate Actions (Before Any Code is Written)

1. **Stakeholder Alignment Meeting**
   - Review this analysis
   - Decide between Option A (phased), B (minimal), or C (filtering only)
   - Get buy-in on realistic timeline

2. **Technical Spikes (1 week)**
   - Prototype nested group rendering
   - Benchmark performance with current codebase
   - Test drag-and-drop between groups
   - Validate approach before full implementation

3. **Reduce Scope for v1**
   - ✅ Keep: Single-level grouping, schema-driven config
   - ✅ Keep: TimelineView and AgendaView support
   - ❌ Remove: 5+ level nesting (start with 2 max)
   - ❌ Remove: FilterBuilder UI (defer to Phase 2)
   - ❌ Remove: All-view grouping support

### Success Criteria for Reduced Scope

**v1 - Single-Level Grouping (2 weeks):**
```jsx
<WorksCalendar
  events={events}
  employees={employees}
  groupBy="location"  // or "shift" or "specialty"
  view="schedule"
/>
```

**Delivers:**
- Users can group schedule by ONE field
- Works in TimelineView
- Integrates with saved views
- No breaking changes

**Defers:**
- Multi-level nesting (location → shift → specialty)
- FilterBuilder UI
- Cross-group visibility
- Grouping in Month/Week/Day views

---

## Architectural Recommendations

### 1. Event Processing Pipeline

**Recommended Flow:**
```
rawEvents
  → normalize (eventModel.js)
  → expand recurring (CalendarEngine)
  → filter (filterEngine.js) ← Already works well
  → sort (new: sortEngine.js)
  → group (new: groupingEngine.js)
  → render (views)
```

**Key Principle:** Each stage is independent and testable.

### 2. Backward Compatibility Strategy

**Required:**
- All new props optional with sensible defaults
- Saved views migration path (v2 → v3)
- Feature flags for gradual rollout
- Regression test suite before merge

**Storage Schema:**
```typescript
// src/hooks/useSavedViews.js:26-39
function normalizeSavedView(view) {
  return {
    id: view.id,
    name: view.name,
    filters: view.filters,
    // NEW FIELDS (must add to whitelist)
    groupBy: view.groupBy ?? null,
    sort: view.sort ?? null,
    showAllGroups: view.showAllGroups ?? false,
    // ...
  };
}
```

### 3. Performance Budget

**Targets:**
- 60fps rendering with 500 events
- <100ms grouping operation
- <50ms filter + sort operation
- Virtualization for 10+ groups

**Monitoring:**
- React DevTools Profiler during development
- Lighthouse performance scores
- Real-world usage metrics

---

## Questions for Product Team

Before proceeding, please answer:

1. **Which use case is most critical?**
   - [ ] Location → Shift → Specialty (3-level nesting)
   - [ ] Just Location OR Shift OR Specialty (single-level)
   - [ ] Cross-team visibility ("showAllGroups")
   - [ ] Advanced filtering with AND/OR logic

2. **Which views MUST support grouping?**
   - [ ] TimelineView (schedule) - Makes sense
   - [ ] AgendaView (list) - Makes sense
   - [ ] MonthView (grid) - Doesn't make sense
   - [ ] WeekView (columns) - Doesn't make sense
   - [ ] DayView (single day) - Doesn't make sense

3. **What's the acceptable timeline?**
   - [ ] 2 weeks (minimal scope - single-level grouping)
   - [ ] 4 weeks (moderate scope - 2-level grouping + sorting)
   - [ ] 8 weeks (full scope - unlimited nesting, all features)

4. **What's more important?**
   - [ ] Grouping features (location → shift nesting)
   - [ ] Filtering features (AND/OR logic, advanced filters)

---

## Conclusion

The proposed "Infinite Grouping, Filtering & Sorting" sprint is **technically achievable** but **not in 5 days**. The calendar's existing filtering architecture is excellent and ready to extend, but grouping is a ground-up feature that requires careful planning and phased rollout.

**Recommendation:**
- **Proceed with reduced scope** (single-level grouping, 2 weeks)
- **OR** focus on enhanced filtering first (2 weeks), grouping later
- **Do NOT rush** the full scope in 1 week - it will create technical debt and regressions

The calendar is a valuable product. Let's build grouping features properly, not quickly.

---

**Reviewed by:** Claude Code Agent
**Full Analysis:** [INFINITE_GROUPING_VIABILITY_ANALYSIS.md](./INFINITE_GROUPING_VIABILITY_ANALYSIS.md)
**Next Steps:** Stakeholder review + scope decision

---

## Delivery Update — 2026-04 Sprint

**Tracking issue:** [#134 — Sprint: Close the Grouping Plan A gap](https://github.com/natehorst240-sketch/calendarthatworks/issues/134)

The original 5-day "infinite grouping" ambition was correctly flagged above as
infeasible. Work landed in two phases instead, with a strict owner-config-first
principle: **every new UX surface must be tunable from ConfigPanel and persisted
to owner config with zero host-app redeploy. Host callbacks are escape hatches,
not the default path.**

### Phase A — shipped (this sprint)

| Ticket | Summary | Ships as |
|--------|---------|----------|
| #134-1 | Swap TimelineView grouping onto the TS `buildGroupTree` engine | `f1ecbba` |
| #134-2 | Persist `zoomLevel` + `collapsedGroups` in saved-views schema v3 | `832cffb` |
| #134-3 | AssetsView grouping via `useGroupingEngine` + `GroupHeader` | `c94539c` |
| #134-9 | First-class `assets[]` registry + ConfigPanel **Assets** tab | `e004c49` |
| #134-10 | On-page AssetsView toolbar — GroupBy / SortBy / "Edit assets" deep-link | `f045433` |
| #134-4 | Cross-group keyboard navigation (↑/↓ rows + headers, ←/→ tree) | `ceb6854` |
| #134-5 | Integration matrix: filter × sort × group (17 specs) | `dcb37e7` |
| #134-6 | Playwright E2E: Assets grid + zoom + saved-view round-trip | `56b3e85` |

**Net effect for operators (owners):**
- Assets tab in ConfigPanel edits the registry in place, persists via
  `useOwnerConfig`, no redeploy, no host code change.
- AssetsView toolbar deep-links to that tab via the new
  `useOwnerConfig.openConfigToTab('assets')` helper; `ConfigPanel` accepts
  `initialTab` reactively (re-applies on prop change).
- Saved views round-trip `zoomLevel` + `collapsedGroups`, so chips reproduce
  the exact Gantt state a user pinned — proven by the E2E round-trip spec.
- Keyboard contract matches WAI-ARIA tree conventions: ↑/↓ traverse headers
  and data rows without skipping; ← collapses an expanded header; →
  expands a collapsed header, or on an already-expanded header descends
  to the first child cell; ← on an already-collapsed header is a no-op.

### Phase B — shipped (this sprint)

| Ticket | Summary | Ships as |
|--------|---------|----------|
| #134-14 | Approvals tab in ConfigPanel — policy, tiers, rules, labels + v3→v4 schema migration | `0ececa2` |
| #134-13 | Conflict check + ConflictModal (owner-defined rules in `src/core/conflictEngine.ts`) | `ae345ba` |
| #134-12 | Schema-driven RequestForm, owner-configurable | `69ee3e6` |
| #134-15 | Inline approval actions on pills, driven by policy/tier config | `9a97f83` |
| #134-16 | Integration matrix: approval policy × conflict rules × request schema | `76e851f` |
| #134-8  | Docs pass — Phase B owner-config section (pairs with Tickets 12/13/14/15) | (this commit) |

**Net effect for operators:**
- Approvals, conflicts, and the request-form schema are all editable from
  ConfigPanel tabs and persist through `useOwnerConfig`. No host-code change
  is required to change who can approve from a stage, which conflict rules
  block a save, or what fields the request form displays.
- Calendar emits `onApprovalAction(event, action)` — host persists the new
  stage + audit history, calendar re-renders with the updated event. The
  calendar never mutates `meta.approvalStage` itself, keeping the storage
  story unchanged.
- Schema version bumped to 4; the migration is additive (mergeDeep folds
  in the new default blocks), so previously-persisted v3 calendars load
  untouched and the new tabs appear with defaults.

### What the original risk table got right vs. wrong

| Original risk | Outcome |
|---------------|---------|
| Timeline (5 days → weeks) | ✅ Right. Phase A alone took a full sprint; Phase B still queued. |
| All five views touched | ⚠️ Partly. Scope narrowed to Assets + Timeline — Month/Week/Day correctly left flat. |
| Performance unknowns | ✅ Mitigated. `groupRows()` budget held at p95 < 0.5ms for 2000ev × 3-level (see `perf-baselines.json`). |
| Testing scope underestimated | ✅ Addressed. Integration matrix (17 specs) + keyboard spec (7) + E2E (3) added this sprint. |
| 5-level nesting untested | ↩️ Parked. Phase A covers 1–2 levels; deeper nesting deferred until a real use case appears. |

### Where to look for the work

- **API surface:** [`GROUPING_API.md`](./GROUPING_API.md) — now includes the
  AssetsView / Assets tab section covering the `assets[]` prop shape, the
  ConfigPanel deep-link, and the cross-group keyboard contract.
- **Engine:** `src/grouping/groupRows.ts`, `src/hooks/useGrouping.ts`,
  `src/core/sortEngine.ts`, `src/filters/filterEngine.js`.
- **View:** `src/views/AssetsView.jsx`, `src/ui/GroupHeader.tsx`.
- **Owner config:** `src/hooks/useOwnerConfig.js`, `src/ui/ConfigPanel.jsx`.
- **Tests:** `src/views/__tests__/AssetsView.*.test.jsx`,
  `src/__tests__/groupingFilteringSorting.integration.test.js`,
  `tests-e2e/calendar.assets-grouping.spec.ts`.
