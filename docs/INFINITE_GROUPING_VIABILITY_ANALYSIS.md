# Infinite Grouping, Filtering & Sorting - Viability & Architectural Impact Analysis

**Date:** 2026-04-16
**Sprint Issue:** Infinite Grouping, Filtering & Sorting (Stupid-Simple + Unlimited)
**Reviewer:** Claude Code Agent
**Status:** Architecture Review Complete

---

## Executive Summary

**Overall Viability: ⚠️ HIGH RISK - SIGNIFICANT ARCHITECTURAL CONCERNS**

The proposed "infinite grouping, filtering & sorting" feature is **architecturally ambitious but carries substantial risks** to the calendar's existing stability, performance, and maintainability. While the goals are admirable (Notion/Airtable-level flexibility), the implementation plan underestimates the complexity required to maintain backward compatibility and avoid regressions.

### Key Findings

1. ✅ **Filtering Infrastructure is Solid** - The existing schema-driven filtering system is well-architected and extensible
2. ⚠️ **Grouping is Net-New** - No existing grouping infrastructure exists; this is a ground-up feature
3. ❌ **5-Day Timeline is Unrealistic** - The scope described requires 3-4 weeks minimum for proper implementation
4. ⚠️ **Performance Concerns** - 5+ level nesting on 1000+ events will require significant optimization work
5. ⚠️ **Breaking Change Risk** - High probability of introducing regressions in existing views

---

## Current Architecture Analysis

### What Works Well

#### 1. Schema-Driven Filtering System ✅

The calendar already has an **excellent foundation** for extensible filtering:

**Location:** `src/filters/filterSchema.ts`, `src/filters/filterEngine.js`

```typescript
// Existing schema system is well-designed
export type FilterField = {
  key: string;
  label: string;
  type: 'select' | 'multi-select' | 'date-range' | 'text' | 'boolean' | 'custom';
  predicate?: (item: unknown, value: unknown) => boolean;
  getOptions?: (items: unknown[]) => FilterOption[];
  // ... extensible design
}
```

**Strengths:**
- Fully extensible without modifying core code
- Custom predicates allow unlimited complexity
- Already supports dynamic options via `getOptions`
- Has factory functions for common fields (`statusField()`, `priorityField()`, etc.)

**Current Usage:**
- `WorksCalendar.tsx:276` - Schema passed to `useCalendar` hook
- `useCalendar.js:15` - Filter state initialized from schema
- `filterEngine.js:26` - Events filtered using schema-driven pipeline

#### 2. Saved Views System ✅

**Location:** `src/hooks/useSavedViews.js`

The saved views infrastructure is **production-ready** and already handles:
- Filter persistence to localStorage
- Migration from legacy formats (v1 → v2)
- Serialization of complex filter states (Sets → Arrays)
- View metadata (color, created date, pinned view)

**Memory from repo:**
> useSavedViews load path normalizes saved views via a whitelist (normalizeSavedView), so new persisted fields must be added there to survive reloads.

**Impact:** Any new grouping config must be added to the normalization whitelist or it won't persist.

#### 3. CalendarEngine (Recurring Events) ✅

**Location:** `src/core/engine/CalendarEngine.ts`

The calendar has a **sophisticated event engine** that:
- Handles recurring event expansion
- Manages undo/redo operations
- Validates constraints (business hours, blocked windows, dependencies)
- Supports scope-based edits (single, following, series)

**Relevance:** This engine is **orthogonal** to grouping/filtering but must be respected. Any grouping system needs to work with expanded occurrences, not just raw events.

### What's Missing (Gaps for Grouping)

#### 1. No Grouping Infrastructure ❌

**Current State:**
- Events are filtered, but never grouped hierarchically
- TimelineView (`src/views/TimelineView.jsx`) has **employee-based rows**, but this is hardcoded:
  ```jsx
  // Line 97-100: Hard-coded employee grouping
  employees.forEach((emp, idx) => {
    const empEvents = events.filter(e => String(e.resource) === String(emp.id));
    // ... render row
  })
  ```

- MonthView, WeekView, DayView have **no grouping concept** at all

**Gap Analysis:**
- No `GroupConfig` type exists
- No `useGroupingEngine` hook exists
- No generic group rendering component exists
- Views don't have a concept of "nested structure" - they expect flat event arrays

#### 2. No Multi-Level Sorting ❌

**Current State:**
- Events are sorted implicitly by view rendering logic
- No explicit `sort` prop or sorting configuration
- TimelineView assigns lanes (`src/views/TimelineView.jsx:59-93`) but doesn't allow custom sort orders

**Gap:** Need to add:
- `SortConfig` type (field, direction, tiebreakers)
- Sort application before grouping/rendering
- UI controls for changing sort order

#### 3. Limited Cross-View Abstraction ❌

**Current State:**
Each view is mostly independent:
- `MonthView.jsx` - Grid layout
- `WeekView.jsx` - Weekly columns
- `DayView.jsx` - Single day
- `AgendaView.jsx` - List view
- `TimelineView.jsx` - Resource/employee timeline

**Challenge:**
Grouping logic needs to work across **all 5 views**. This requires either:
1. A shared `GroupedViewWrapper` component (as proposed), OR
2. Each view independently implementing grouping (maintenance nightmare)

**Risk:** The views have different rendering paradigms. Forcing a unified grouping abstraction could break view-specific optimizations.

---

## Proposed Implementation Analysis

### Day 1-2: Config Normalizer + Grouping Engine

#### Proposed Deliverables
- `src/types/grouping.ts` - New types
- `src/hooks/useNormalizedConfig.ts` - Config normalization
- `src/hooks/useGroupingEngine.ts` - Core grouping logic

#### Viability Assessment: ⚠️ MODERATE

**What's Realistic:**
- Type definitions can be completed in a few hours
- `useNormalizedConfig` for simple → complex upgrades is straightforward (1 day)

**What's Underestimated:**
- `useGroupingEngine` for unlimited nesting is **complex**:
  - Recursive grouping algorithm
  - Group metadata (counts, coverage summaries, avatars)
  - Collapse/expand state management
  - Empty group handling
  - "showAllGroups" cross-visibility logic

**Estimated Reality:** 3-4 days minimum

**Critical Question:**
> How do groups interact with the CalendarEngine's occurrence expansion?

**Recommendation:**
- Group **after** filtering, **after** occurrence expansion
- Work with `expandedEvents` from `WorksCalendar.tsx:406`

### Day 3-4: Filter Engine + Sorting + Views

#### Proposed Deliverables
- Filter Builder UI (optional collapsible panel)
- Sorting configuration
- Update all 5 views to support grouping
- Saved views integration

#### Viability Assessment: ❌ HIGH RISK

**Problems:**

1. **Filter Engine Already Exists**
   - No need for a "Filter Engine" - it's already schema-driven
   - Time budget should go to FilterBuilder UI, not engine work

2. **View Updates are Non-Trivial**
   - Each view has unique rendering logic
   - TimelineView already virtualizes rows for performance
   - Adding grouping to virtualized rendering is complex
   - MonthView displays events in day cells - grouping doesn't make sense there

3. **Saved Views Integration**
   - Must add `groups`, `sort`, `showAllGroups`, `collapsedGroups` to `normalizeSavedView` whitelist
   - Migration path for existing saved views needed

**Estimated Reality:** 5-7 days minimum

**Critical Architectural Decision:**

Should grouping apply to **all views** or only specific ones?

**Recommendation:**
- Phase 1: Grouping for `TimelineView` (schedule view) only
- Phase 2: Extend to `AgendaView` (list view)
- **Skip:** MonthView, WeekView, DayView (grouping doesn't fit their paradigms)

### Day 5: Integration, Storybook, Docs

#### Viability Assessment: ❌ UNREALISTIC

**What's Proposed:**
- All 6 views working with grouping
- 8 Storybook stories
- Complete documentation
- Zero breaking changes verified

**Reality:**
- Integration testing alone takes 2-3 days
- Storybook stories for 8 examples: 1-2 days
- Documentation: 1 day
- Regression testing: 2-3 days

**Estimated Reality:** 5-7 days minimum

---

## Performance Impact Analysis

### Proposed Performance Strategy
> "Add React.memo + virtualized group rendering"

#### Assessment: ⚠️ INCOMPLETE

**Current Performance:**
- TimelineView already virtualizes rows (`OVERSCAN_ROWS = 3`)
- MonthView, WeekView, DayView do **not** virtualize

**New Performance Challenges:**

1. **Nested Group Expansion**
   - 5-level nesting = recursive rendering
   - Each level needs collapse/expand state
   - Re-rendering parent groups when children change

2. **Cross-Group Visibility ("showAllGroups")**
   - Showing events from OTHER groups requires:
     - Filtering by primary group
     - Collecting events from all other groups
     - Visual differentiation (grayed out, labeled)
   - This **doubles** the event count displayed

3. **Drag-and-Drop Between Nested Groups**
   - Current DnD system is simple (event → new time/resource)
   - Nested groups require:
     - Detecting target group at each level
     - Updating multiple group fields (location → shift → specialty)
     - Revalidating constraints at each level

**Missing from Plan:**
- Memoization strategy for group rendering
- Virtualization strategy for nested groups
- Debouncing for filter/group changes
- Performance benchmarks (target: 60fps on 1000 events)

**Recommendation:**
- Establish performance budgets BEFORE implementation
- Use React DevTools Profiler during development
- Add performance tests to test suite

---

## Breaking Change Risk Assessment

### Claimed: "Zero breaking changes"

#### Reality: ⚠️ HIGH RISK

**Potential Breaking Changes:**

1. **Props API Changes**
   ```typescript
   // New props to WorksCalendar
   groupBy?: string | string[] | GroupConfig[];
   groups?: GroupConfig[];
   filter?: FilterState | LogicalFilter;
   sort?: SortConfig | SortConfig[];
   showAllGroups?: boolean;
   savedViews?: SavedView[];
   defaultView?: string;
   onSaveView?: (view: SavedView) => void;
   ```

   **Risk:** These are **additive**, so technically non-breaking. BUT:
   - If internal filter state changes shape, saved views break
   - If event rendering logic changes, custom `renderEvent` props may break

2. **Internal Context Changes**
   - `CalendarContext` may need new fields
   - Views receive new props
   - Filter state structure might change

3. **localStorage Schema Changes**
   - `wc-saved-views-${id}` format must be backward compatible
   - Migration logic needed (already exists for v1→v2, need v2→v3)

4. **CSS Class Changes**
   - New group header classes
   - Nested group styling
   - Collapse/expand affordances

**Mitigation:**
- Extensive regression testing required
- Version bump to v0.3.0 appropriate (minor version)
- Feature flags to enable/disable grouping during rollout

---

## Alternative Architecture Recommendation

### Phased Approach (Lower Risk)

#### Phase 1: Enhanced Filtering (2 weeks)
**Scope:**
- Expand filter schema with more field types
- Add FilterBuilder UI component (collapsible panel)
- Add logical operators (AND/OR/NOT) to filter system
- Improve saved views with folders/tags

**Benefits:**
- Builds on existing solid infrastructure
- Low breaking change risk
- Delivers immediate user value

**Deliverables:**
- `src/components/FilterBuilder.tsx`
- `src/filters/logicalFilter.ts` (AND/OR/NOT support)
- Enhanced `useSavedViews` with folders

#### Phase 2: Single-Level Grouping (2-3 weeks)
**Scope:**
- Add `groupBy` prop (single field only)
- Implement for TimelineView and AgendaView only
- Group rendering with counts and expand/collapse

**Benefits:**
- Addresses 80% of use cases (location, shift, specialty - pick one)
- Much simpler implementation
- Easier to test and optimize

**Deliverables:**
- `src/hooks/useGrouping.ts` (single-level only)
- `src/components/GroupHeader.tsx`
- Updated TimelineView with grouping

#### Phase 3: Multi-Level Grouping (3-4 weeks)
**Scope:**
- Extend to nested grouping (2-3 levels max, not 5+)
- Add `sort` configuration
- Add `showAllGroups` cross-visibility
- Drag-and-drop between groups

**Benefits:**
- Proven architecture from Phase 2
- Incremental risk
- User feedback incorporated

**Total Timeline:** 7-9 weeks vs proposed 1 week

---

## Technical Debt Concerns

### New Code Footprint

**Proposed Files:**
```
src/types/grouping.ts
src/hooks/useNormalizedConfig.ts
src/hooks/useGroupingEngine.ts
src/components/FilterBuilder.tsx
src/components/GroupedViewWrapper.tsx (implied)
```

**Impact:**
- ~1000-1500 lines of new code
- ~500 lines of modifications to existing views
- ~400 lines of test code (if 95% coverage target met)

**Maintenance Burden:**
- New hooks to maintain
- New UI components to style across 6 themes
- Interaction testing across 5 views
- Performance testing for nested rendering

**Recommendation:**
- Ensure **comprehensive unit tests** before merging
- Add **integration tests** for grouping + filtering interactions
- Add **performance benchmarks** to CI/CD

---

## Compatibility Concerns

### Theme System Compatibility

**Current Themes:** (from `src/styles/themes.js`)
- Aviation
- Soft
- Minimal
- Corporate
- Forest
- Ocean

**New UI Elements Needed:**
- Group headers with custom styling
- Nested indentation indicators
- Collapse/expand icons
- "Others" section styling
- Drag-and-drop drop zones for groups

**Risk:** Each theme needs custom styles for all new elements.

**Recommendation:**
- Design system audit before implementation
- CSS variables for group styling
- Default styles that work across all themes

### Mobile Responsiveness

**Current State:**
- Mobile swipe navigation exists (`useTouchSwipe`)
- Views are somewhat responsive

**New Challenges:**
- Nested groups on mobile (accordion pattern needed)
- Group headers on small screens
- Drag-and-drop on touch devices

**Recommendation:**
- Mobile-first design for group UI
- Touch-optimized collapse/expand
- Consider disabling deep nesting on mobile

---

## Testing Strategy Gaps

### Proposed Test Plan

**Unit Tests:**
- `useNormalizedConfig` - 12 cases ✅ Reasonable
- `useGroupingEngine` - nesting 1-5, showAllGroups, drag ⚠️ Underestimated

**Integration Tests:**
- All combinations of groupBy + filter + sort ❌ Combinatorial explosion
- Drag-and-drop between groups ⚠️ Complex to test
- Saved view round-trip ✅ Feasible

**E2E Tests:**
- 5 test scenarios proposed ⚠️ Insufficient coverage

**Missing:**
- Performance tests (frame rate on 1000 events)
- Accessibility tests (keyboard navigation, screen readers)
- Cross-browser tests (Safari, Firefox, Edge)
- Regression tests for existing views

**Recommendation:**
- Add visual regression tests (Playwright screenshots)
- Add performance benchmarks to CI
- Increase E2E coverage to 15-20 scenarios

---

## Recommendations

### Immediate Actions (Before Implementation)

1. **Reduce Scope for v1**
   - ❌ Remove: 5+ level nesting → Limit to 2-3 levels
   - ❌ Remove: FilterBuilder UI → Defer to Phase 2
   - ❌ Remove: Grouping for all views → Start with TimelineView only
   - ✅ Keep: Schema-driven grouping config
   - ✅ Keep: Saved views integration
   - ✅ Keep: Single-level sorting

2. **Extend Timeline**
   - ❌ Current: 5 working days (1 week)
   - ✅ Realistic: 15-20 working days (3-4 weeks)

3. **Add Missing Planning**
   - Performance benchmarks and targets
   - Accessibility requirements (WCAG 2.1 AA)
   - Mobile UX designs
   - Theme styling specifications

4. **Technical Spikes Needed**
   - Prototype nested group rendering (2 days)
   - Prototype drag-and-drop between groups (2 days)
   - Performance test current codebase baseline (1 day)

### Implementation Recommendations

#### Architecture

1. **Keep Filtering Separate from Grouping**
   ```typescript
   // Events flow:
   rawEvents
     → normalize
     → expand recurring (CalendarEngine)
     → filter (existing system)
     → sort (new)
     → group (new)
     → render (views)
   ```

2. **Use Composition, Not Modification**
   - Don't modify existing views directly
   - Create wrapper components for grouped rendering
   - Allow views to opt-in to grouping support

3. **Start Simple, Iterate**
   - v1: Single-level grouping, TimelineView only
   - v2: Multi-level grouping
   - v3: Cross-view grouping support

#### Code Quality

1. **Test Coverage**
   - Minimum 90% coverage for new hooks
   - Integration tests for grouping + filtering
   - Visual regression tests for UI changes

2. **Documentation**
   - Inline JSDoc for all new functions
   - Migration guide for users
   - Storybook examples for each grouping pattern

3. **Performance**
   - Memoize group rendering
   - Virtualize nested groups
   - Debounce group state changes
   - Target: 60fps on 1000 events, 3-level nesting

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing views | High | Critical | Comprehensive regression testing |
| Performance degradation | High | High | Performance benchmarks, virtualization |
| Timeline overrun | Very High | Medium | Reduce scope, extend timeline |
| Mobile UX issues | Medium | Medium | Mobile-first design, touch testing |
| Theme compatibility | Medium | Low | CSS variables, default styles |
| Accessibility regressions | Medium | High | ARIA testing, keyboard nav testing |
| User confusion | Low | Medium | Progressive disclosure, good defaults |

---

## Final Verdict

### Is This Sprint Viable?

**As Proposed:** ❌ **NO**

The 5-day timeline with the described scope is **not realistic**. The proposal underestimates:
- Complexity of nested grouping algorithms
- Integration effort across 5 different views
- Testing and regression validation effort
- Performance optimization work

### What IS Viable?

**Alternative Scopes:**

#### Option A: Minimal Grouping (2 weeks)
- Single-level grouping only
- TimelineView support only
- Basic saved views integration
- **Deliverable:** Users can group schedule by location OR shift OR specialty

#### Option B: Enhanced Filtering (2 weeks)
- Skip grouping entirely for now
- Focus on FilterBuilder UI
- Add logical operators (AND/OR/NOT)
- Enhanced saved views with metadata
- **Deliverable:** Power-user filtering without grouping complexity

#### Option C: Phased Approach (7-9 weeks)
- Phase 1: Enhanced filtering (2 weeks)
- Phase 2: Single-level grouping (2-3 weeks)
- Phase 3: Multi-level grouping (3-4 weeks)
- **Deliverable:** Full vision, lower risk

### Recommendation to Product Team

**Proceed with Option C (Phased Approach)** or **Option A (Minimal Grouping)**

**Do NOT proceed with the 5-day sprint as described.** It will result in:
- Rushed implementation
- Inadequate testing
- Performance issues
- High regression risk
- Technical debt accumulation

---

## Conclusion

The WorksCalendar codebase has a **strong foundation** for extending filtering capabilities. The schema-driven architecture, saved views system, and CalendarEngine are all well-designed and production-ready.

However, adding **unlimited nesting grouping** is a major architectural undertaking that cannot be rushed. The proposed 5-day timeline is **unrealistic and risky**.

A **phased approach** starting with enhanced filtering and single-level grouping will deliver user value faster, with lower risk, and build confidence for the multi-level grouping work.

**The calendar is too valuable to risk on an overly ambitious sprint.**

---

## Appendix: Code References

### Key Files Reviewed
- `src/WorksCalendar.tsx` (1644 lines) - Main component
- `src/filters/filterEngine.js` (120 lines) - Filtering logic
- `src/filters/filterSchema.ts` (276 lines) - Schema system
- `src/hooks/useCalendar.js` (123 lines) - State management
- `src/hooks/useSavedViews.js` (~200 lines) - View persistence
- `src/views/TimelineView.jsx` (~500 lines) - Resource timeline
- `src/core/engine/CalendarEngine.ts` - Recurring events engine

### Architecture Patterns Identified
1. ✅ Schema-driven extensibility (filters)
2. ✅ Hook-based state management
3. ✅ Context for cross-cutting concerns
4. ✅ Engine pattern for complex logic (recurring events)
5. ⚠️ View independence (pro: flexibility, con: grouping integration challenge)

### Memory Annotations for Future Work
- Filter schema is extensible via `filterSchema` prop
- Saved views require whitelist updates in `normalizeSavedView`
- Theme system uses both `data-wc-theme` and `customTheme` props
- CalendarEngine must be consulted for any event mutations
- Virtualization exists in TimelineView but not other views

---

**Analysis completed:** 2026-04-16
**Reviewer:** Claude Code Agent
**Next step:** Review with product/engineering leads before sprint commitment
