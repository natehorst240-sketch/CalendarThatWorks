# Phase 2: Single-Level Grouping — Sprint Plan

## Context

Phase 1 (Enhanced Filtering) builds on the existing schema-driven filter system. Phase 2 adds **single-level grouping** to TimelineView and AgendaView — the two views where grouping makes ergonomic sense. MonthView, WeekView, and DayView are excluded (their spatial paradigms don't benefit from row grouping).

**Problem**: Users managing teams need to group timeline rows by properties like role, department, location, or shift — but no grouping infrastructure exists. TimelineView has employee rows and resource rows, but no concept of group headers, collapse/expand, or groupBy configuration.

**Goal**: Add a `groupBy` prop that groups rows in TimelineView (with expand/collapse + virtualization) and adds secondary grouping within dates in AgendaView. Persist group config in saved views. ~1,005 lines across 15 Codex-sized tasks.

**Prerequisite**: Phase 1 does NOT need to be completed first. The grouping system is orthogonal to filtering enhancements.

---

## Architectural Decisions

### 1. Where does grouping logic live?
A pure utility module at `src/grouping/groupRows.js`. No React — just pure functions that take a row array + options and return a grouped structure. A thin `useGrouping` hook wraps collapse state and calls the pure function.

### 2. How are group headers represented?
Group headers are inserted as special entries in the flat `rows` array with `_type: 'groupHeader'`. This lets them participate in TimelineView's existing virtualization (cumulative `rowOffsets` array + visible window slicing) with zero changes to the virtualization math.

### 3. How does collapse/expand work with virtualization?
When a group is collapsed, its member rows are filtered out of the flat array before `rowOffsets` is computed. The group header stays. The cumulative offset array is recomputed from the reduced array — virtualization works identically.

### 4. Employee fields vs event fields?
In employee-mode, group by employee object fields (`emp.role`, `emp.department`). In resource-mode, group by event fields (`event.category`, `event.meta.department`). A `buildFieldAccessor` utility abstracts this.

---

## Sprint 1: Core Grouping Infrastructure

### Task 1.1: Create `groupRows` pure utility

**Files**: `src/grouping/groupRows.js` (create), `src/grouping/__tests__/groupRows.test.js` (create)

**Changes** (~180 lines):
1. Export `groupRows(rows, options)`:
   - `options.groupBy`: field name
   - `options.fieldAccessor`: `(row) => string|null` extracts the group value
   - `options.collapsedGroups`: `Set<string>` of collapsed group keys
   - `options.groupHeaderHeight`: pixel height for header pseudo-rows (default 36)
   - Returns `{ flatRows, groupOrder }`
2. `flatRows` interleaves group headers and data rows:
   - Group header: `{ _type: 'groupHeader', groupKey, groupLabel, collapsed, rowH, count }`
   - Regular row: original row unchanged
3. Null/undefined field values → `'(Ungrouped)'` group (sorted last)
4. Collapsed groups: header stays, member rows omitted

**Tests**: Groups 6 rows by `role` into 2 groups; collapsed omits members but keeps header; null values → `'(Ungrouped)'`; empty input → empty output; groupOrder reflects insertion order.

### Task 1.2: Create `useGrouping` hook

**Files**: `src/hooks/useGrouping.js` (create), `src/hooks/__tests__/useGrouping.test.js` (create)

**Changes** (~130 lines):
1. Export `useGrouping(rows, options)`:
   - Manages `collapsedGroups` state (`useState(new Set())`)
   - Calls `groupRows` in `useMemo` when `groupBy` is set
   - Returns `flatRows === rows` when `groupBy` is null (identity passthrough)
   - Returns `{ flatRows, groupOrder, collapsedGroups, toggleGroup, expandAll, collapseAll, isGrouped }`

**Tests**: `renderHook` tests — returns identity when groupBy null; grouped flatRows when set; toggleGroup adds/removes; expandAll/collapseAll work.

### Task 1.3: Create `buildFieldAccessor` utility

**Files**: `src/grouping/buildFieldAccessor.js` (create), `src/grouping/__tests__/buildFieldAccessor.test.js` (create)

**Changes** (~100 lines):
1. Export `buildFieldAccessor(fieldName, mode)`:
   - `mode === 'employee'`: reads `row.emp[fieldName]`, falls back to `row.emp.meta?.[fieldName]`
   - `mode === 'resource'`: reads first event's `event[fieldName]`, falls back to `event.meta?.[fieldName]`
   - Returns null when field missing

**Tests**: Employee mode extracts `emp.role`; falls back to `emp.meta.department`; returns null for missing. Resource mode extracts from first event's field; falls back to meta.

### Task 1.4: Add `groupBy` prop to WorksCalendarProps and thread to views

**Files**: `src/WorksCalendar.tsx` (modify), `src/index.d.ts` (modify)

**Changes** (~30 lines):
1. Add `groupBy?: string` to `WorksCalendarProps` type (line ~97) and destructured props (line ~268)
2. Pass `groupBy` to `<TimelineView>` (line ~1494) and `<AgendaView>` (line ~1492)
3. Add to `index.d.ts` `WorksCalendarProps` interface

Pure wiring — views receive but ignore the prop until Sprint 2.

---

## Sprint 2: TimelineView Grouping Integration

### Task 2.1: Wire `useGrouping` into TimelineView row pipeline

**Files**: `src/views/TimelineView.jsx` (modify)

**Changes** (~40 lines):
1. Import `useGrouping` and `buildFieldAccessor`
2. Add `groupBy` to destructured props
3. After existing `rows` useMemo (line 276), before `rowOffsets` (line 279), insert:
   ```js
   const GROUP_HEADER_H = 36;
   const fieldAccessor = useMemo(
     () => groupBy ? buildFieldAccessor(groupBy, useEmployees ? 'employee' : 'resource') : null,
     [groupBy, useEmployees],
   );
   const { flatRows, groupOrder, collapsedGroups, toggleGroup, isGrouped } = useGrouping(rows, {
     groupBy, fieldAccessor, groupHeaderHeight: GROUP_HEADER_H,
   });
   ```
4. Replace all downstream `rows` references with `flatRows`:
   - `rowOffsets` loop (line 279)
   - `totalBodyH` (line 285)
   - `visStart/visEnd` calculation (line 288)
   - `.slice(visStart, visEnd+1).map(...)` render loop (line ~465)
   - `rows.length` in keyboard nav (line 337)
   - `aria-rowcount` (line 391)
5. Keep `rows.length === 0` for empty state (check ungrouped rows, not flat)

When `groupBy` is null, `flatRows === rows` — behavior identical to before.

### Task 2.2: Render group header rows in TimelineView

**Files**: `src/views/TimelineView.jsx` (modify ~60 lines), `src/views/TimelineView.module.css` (modify ~40 lines)

**Changes**:
1. In the `.slice(...).map(...)` render loop, add early return for group headers:
   ```jsx
   if (rowData._type === 'groupHeader') {
     return (
       <div key={`gh-${rowData.groupKey}`} className={styles.groupHeaderRow}
         style={{ position: 'absolute', top: topOffset, left: 0, right: 0, height: rowData.rowH }}
         role="row" aria-rowindex={rowIdx + 2}>
         <div className={styles.groupHeaderCell} style={{ width: NAME_W + totalDays * DAY_W }}>
           <button className={styles.groupToggleBtn}
             onClick={() => toggleGroup(rowData.groupKey)}
             aria-expanded={!rowData.collapsed}
             aria-label={`${rowData.collapsed ? 'Expand' : 'Collapse'} group ${rowData.groupLabel}`}>
             <span className={styles.groupChevron} data-collapsed={rowData.collapsed || undefined}>&#9656;</span>
             <span className={styles.groupLabel}>{rowData.groupLabel}</span>
             <span className={styles.groupCount}>{rowData.count}</span>
           </button>
         </div>
       </div>
     );
   }
   ```

2. CSS uses only `--wc-*` variables (works across all 6 themes):
   - `.groupHeaderRow`: flex, border-bottom, `var(--wc-surface)` background
   - `.groupToggleBtn`: no-border button, hover state
   - `.groupChevron`: rotated triangle, transitions on collapse
   - `.groupLabel`: uppercase, small, muted
   - `.groupCount`: badge pill with count

### Task 2.3: Fix keyboard navigation to skip group headers

**Files**: `src/views/TimelineView.jsx` (modify ~25 lines)

**Changes**:
1. In `handleCellKeyDown` ArrowUp/ArrowDown cases, add while-loop to skip `_type === 'groupHeader'` entries:
   ```js
   case 'ArrowUp':
     nextRi = ri - 1;
     while (nextRi >= 0 && flatRows[nextRi]?._type === 'groupHeader') nextRi--;
     nextRi = Math.max(0, nextRi);
     if (flatRows[nextRi]?._type === 'groupHeader') nextRi = ri;
     move = true; break;
   ```
2. Same pattern for ArrowDown
3. Update `handleCellKeyDown` dependency array to include `flatRows`

### Task 2.4: TimelineView grouping integration test

**Files**: `src/views/__tests__/TimelineView.grouping.test.jsx` (create)

**Changes** (~120 lines):
- Render TimelineView with 3 employees (2 Nurses, 1 Doctor) and `groupBy='role'`
- Verify group headers "Nurse" and "Doctor" render with expand/collapse buttons
- Verify collapse hides member rows, expand shows them
- Verify group count badges (2 for Nurse, 1 for Doctor)
- Verify no group headers when `groupBy` is not set (backward compat)

---

## Sprint 3: AgendaView Grouping + Saved Views

### Task 3.1: Add secondary grouping to AgendaView

**Files**: `src/views/AgendaView.jsx` (modify ~60 lines), `src/views/AgendaView.module.css` (modify ~25 lines)

**Changes**:
1. Add `groupBy` to destructured props
2. After existing `grouped` useMemo (groups by date), add secondary grouping:
   ```js
   const secondaryGrouped = useMemo(() => {
     if (!groupBy) return null;
     return grouped.map(({ day, events: dayEvents }) => {
       const groups = new Map();
       dayEvents.forEach(ev => {
         const key = ev[groupBy] ?? ev.meta?.[groupBy] ?? '(Ungrouped)';
         if (!groups.has(key)) groups.set(key, []);
         groups.get(key).push(ev);
       });
       return { day, groups: [...groups.entries()].map(([key, evts]) => ({ key, events: evts })) };
     });
   }, [grouped, groupBy]);
   ```
3. Conditional render: when `groupBy` set, nest sub-group headers within each date section
4. CSS: `.subGroup` margin, `.subGroupLabel` uppercase/muted styling using `--wc-*` vars

### Task 3.2: AgendaView grouping test

**Files**: `src/views/__tests__/AgendaView.grouping.test.jsx` (create)

**Changes** (~80 lines):
- Render with 3 events (2 Exercise, 1 Work) on same day, `groupBy='category'`
- Verify sub-group headers render
- Verify events grouped correctly
- Verify no sub-groups when `groupBy` not set

### Task 3.3: Persist `groupBy` in saved views

**Files**: `src/hooks/useSavedViews.js` (modify ~15 lines)

**Changes**:
1. `normalizeSavedView`: add `groupBy: typeof view.groupBy === 'string' ? view.groupBy : null` to whitelist
2. `saveView`: accept `groupBy` in options object, store in saved view
3. `resaveView`: accept `groupBy` as 4th arg, preserve in update

### Task 3.4: Saved views groupBy persistence test

**Files**: `src/hooks/__tests__/useSavedViews.test.js` (modify ~40 lines)

**Tests**:
- `saveView` with `groupBy: 'department'` stores it
- `saveView` without `groupBy` defaults to null
- localStorage round-trip preserves `groupBy`
- `normalizeSavedView` strips non-string `groupBy` values

---

## Sprint 4: WorksCalendar Integration + Type Declarations

### Task 4.1: Wire saved-view groupBy into WorksCalendar apply/save flow

**Files**: `src/WorksCalendar.tsx` (modify ~30 lines)

**Changes**:
1. Add `activeGroupBy` state: `useState<string | null>(groupBy ?? null)`
2. Sync when `groupBy` prop changes: `useEffect(() => setActiveGroupBy(groupBy ?? null), [groupBy])`
3. `handleApplyView`: restore `savedView.groupBy` → `setActiveGroupBy`
4. Save/resave calls: pass `activeGroupBy` to `savedViews.saveView`/`resaveView`
5. Pass `activeGroupBy` (not raw prop) to `<TimelineView>` and `<AgendaView>`
6. Add `activeGroupBy` to dirty-check dependency array

### Task 4.2: Update `index.d.ts` with grouping types

**Files**: `src/index.d.ts` (modify ~50 lines)

**Changes**:
1. Add `groupBy: string | null` to `SavedView` interface
2. Update `useSavedViews` return type: `saveView` opts include `groupBy?`, `resaveView` adds `groupBy?` param
3. Add `GroupHeaderRow` interface
4. Add declarations for `groupRows`, `buildFieldAccessor`, `useGrouping`

### Task 4.3: Export grouping utilities from package index

**Files**: `src/index.js` (modify ~5 lines)

**Changes**:
```js
export { groupRows } from './grouping/groupRows.js';
export { buildFieldAccessor } from './grouping/buildFieldAccessor.js';
export { useGrouping } from './hooks/useGrouping.js';
```

---

## Task Dependency Map

```
Sprint 1 (sequential):  1.1 -> 1.2 -> 1.3 -> 1.4
Sprint 2 (sequential):  2.1 -> 2.2 -> 2.3 -> 2.4  (depends on Sprint 1)
Sprint 3:               3.1 -> 3.2 (sequential)
                         3.3 -> 3.4 (sequential, independent of 3.1)
                         (Sprint 3 depends on Sprint 1)
Sprint 4 (sequential):  4.1 -> 4.2 -> 4.3  (depends on Sprints 2 + 3)
```

## Summary Table

| Sprint | Task | Title | Files | Est. Lines |
|--------|------|-------|-------|------------|
| 1 | 1.1 | `groupRows` pure utility | 2 new | ~180 |
| 1 | 1.2 | `useGrouping` hook | 2 new | ~130 |
| 1 | 1.3 | `buildFieldAccessor` utility | 2 new | ~100 |
| 1 | 1.4 | `groupBy` prop wiring | 2 mod | ~30 |
| 2 | 2.1 | Wire `useGrouping` into TimelineView | 1 mod | ~40 |
| 2 | 2.2 | Render group header rows | 2 mod | ~100 |
| 2 | 2.3 | Keyboard nav skip headers | 1 mod | ~25 |
| 2 | 2.4 | TimelineView grouping test | 1 new | ~120 |
| 3 | 3.1 | AgendaView secondary grouping | 2 mod | ~85 |
| 3 | 3.2 | AgendaView grouping test | 1 new | ~80 |
| 3 | 3.3 | Persist `groupBy` in saved views | 1 mod | ~15 |
| 3 | 3.4 | Saved views groupBy tests | 1 mod | ~40 |
| 4 | 4.1 | WorksCalendar integration | 1 mod | ~30 |
| 4 | 4.2 | `index.d.ts` grouping types | 1 mod | ~50 |
| 4 | 4.3 | Package index exports | 1 mod | ~5 |

**Total**: ~1,030 lines across 15 tasks (8 new files, 13 file modifications)

## Verification

After each sprint, run:
1. `npx vitest run` — all unit tests pass
2. `npx vitest run src/grouping/` — grouping-specific tests pass
3. `npm run build` — library builds without errors
4. `npm run dev` — demo app: TimelineView with employees + `groupBy='role'` shows group headers
5. After Sprint 4: `npx playwright test` — E2E tests pass

## Critical Files Reference

- `src/views/TimelineView.jsx` — primary grouping target (859 lines, rows at 214-276, offsets at 279-283, render loop at ~465)
- `src/views/AgendaView.jsx` — secondary target (90 lines, grouped at 18-27)
- `src/WorksCalendar.tsx` — integration point (props at 97-141, TimelineView render at 1493-1506)
- `src/hooks/useSavedViews.js` — persistence (normalizeSavedView at 26-39, saveView at 190-202)
- `src/index.d.ts` — public type declarations
- `src/index.js` — public exports

## Reusable Patterns

- `createId(prefix)` from `src/core/createId.js` for generating IDs
- CSS Modules with `--wc-*` CSS variables for cross-theme styling
- `@testing-library/react` `renderHook` for hook tests
- Vitest with `describe/it/expect` and happy-dom environment
- `.js` extensions in imports even for `.ts` files (Vite plugin resolves)
