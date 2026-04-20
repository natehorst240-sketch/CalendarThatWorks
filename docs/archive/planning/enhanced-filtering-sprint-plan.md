# Enhanced Filtering Sprints - Implementation Plan

## Context

WorksCalendar already has a solid schema-driven filtering system (filterSchema.ts, filterEngine.js, filterState.js, FilterBar.jsx, AdvancedFilterBuilder.jsx, useSavedViews.js). A prior viability analysis (docs/INFINITE_GROUPING_VIABILITY_ANALYSIS.md) recommended **Option B: Enhanced Filtering** as the safest, highest-value next step -- building on the existing solid infrastructure rather than attempting risky grouping work.

**Problem**: The filtering system has key gaps that limit power-user workflows:
- AdvancedFilterBuilder is hard-coded to 3 fields (Category, Person, Title) instead of being schema-driven
- Filter engine only supports AND between fields (no NOT operator)
- No relative date presets ("last 7 days", "this month")
- No shareable filter URLs
- No quick filter presets
- Long option lists in dropdowns aren't searchable
- No active filter count badge

**Goal**: Close these gaps in 4 small sprints (16 tasks), each task sized for Codex -- self-contained, 1-3 files, independently testable, under ~200 lines of changes.

**Related Issues**: #61 (FilterBar UX polish), #65 (real-world usage demos with custom filter schemas)

---

## Sprint 1: Schema-Driven AdvancedFilterBuilder (Foundation)

Making the AdvancedFilterBuilder schema-driven is the single highest-leverage change -- it unlocks all future Smart View enhancements.

### Task 1.1: Add operator definitions to filterSchema.ts

**Files**: `src/filters/filterSchema.ts` (modify), `src/filters/__tests__/filterOperators.test.ts` (create)

**Changes**:
1. Add new exported type:
   ```ts
   export type FilterOperator = {
     value: string    // 'is', 'is_not', 'contains', 'not_contains', 'before', 'after', 'between'
     label: string    // 'is', 'is not', 'contains'
     noValue?: boolean // true for operators like 'is_empty'
   }
   ```
2. Add `operators?: FilterOperator[]` to `FilterField` type
3. Add exported function `defaultOperatorsForType(type: FilterFieldType): FilterOperator[]`:
   - `multi-select`/`select`: `[{value:'is', label:'is'}, {value:'is_not', label:'is not'}]`
   - `text`: `[{value:'contains', label:'contains'}, {value:'not_contains', label:'does not contain'}, {value:'is', label:'is exactly'}]`
   - `date-range`: `[{value:'between', label:'between'}, {value:'before', label:'before'}, {value:'after', label:'after'}]`
   - `boolean`: `[{value:'is', label:'is'}]`
   - `custom`: `[]`
4. Update all field factories (`statusField`, `priorityField`, `ownerField`, `tagsField`, `metaSelectField`) to include default `operators`
5. Update `DEFAULT_FILTER_SCHEMA` entries to include operators

**Tests**: `defaultOperatorsForType` returns correct counts per type; existing filterEngine/filterState tests still pass.

### Task 1.2: Build conditionsToFilters with operator-aware logic

**Files**: `src/filters/conditionEngine.js` (create), `src/filters/__tests__/conditionEngine.test.js` (create)

**Changes**:
1. Export `conditionsToFilters(conditions, schema)` -- schema-driven conversion from visual conditions to filter state:
   - `is` on multi-select: collects values into a Set
   - `is` on select: sets value directly
   - `contains` on text: sets search string
   - `is_not`: produces negation wrapper `{ __not: true, values: Set }`
   - Unknown fields/operators are skipped gracefully
2. Export `conditionsMatchSchema(conditions, schema)` -- validates all condition field keys exist in schema, returns `{ valid, invalidKeys }`

**Tests**: Single `is` condition produces Set; `is_not` produces negation wrapper; unknown keys skipped; validation works.

### Task 1.3: Wire schema-driven fields into AdvancedFilterBuilder UI

**Files**: `src/ui/AdvancedFilterBuilder.jsx` (modify)

**Changes**:
1. Add `schema` prop (defaults to `DEFAULT_FILTER_SCHEMA`) and `items` prop (event list for dynamic options)
2. Replace hard-coded `FIELD_OPTIONS` with `useMemo` derived from schema (exclude `date-range` fields)
3. Replace hard-coded `OPERATORS` lookup with schema-derived operator map using `defaultOperatorsForType`
4. Replace `getOptions(field)` with schema-aware lookup using `field.getOptions(items)` or `field.options`
5. Import `conditionsToFilters` from `conditionEngine.js` instead of internal function
6. Reset operator/value when field type changes

### Task 1.4: Thread schema + items to AdvancedFilterBuilder consumers

**Files**: `src/ui/ConfigPanel.jsx` (modify ~3 lines), `src/WorksCalendar.tsx` (modify ~3 lines)

**Changes**:
1. ConfigPanel SmartViewsTab: pass `schema` and `items` to `<AdvancedFilterBuilder>` instead of just `categories`/`resources`
2. WorksCalendar.tsx: pass `schema={schema}` and `items={expandedEvents}` to ConfigPanel (~line 1606)

---

## Sprint 2: Logical Operators and Relative Dates

### Task 2.1: Add NOT operator support to filterEngine

**Files**: `src/filters/filterEngine.js` (modify), `src/filters/filterState.js` (modify), `src/filters/__tests__/filterEngine.test.js` (add tests)

**Changes**:
1. Add helper `isNegatedFilter(value)` -- returns true when value has `__not === true`
2. In `applyFilters`, before calling matcher, check for negation and invert result
3. Update `_defaultMatch` for negated multi-select: `!set.has(itemValue)`
4. Update `_matchSearch` for negated text: must NOT contain query
5. In `filterState.js`: `isEmptyFilterValue` treats `{ __not: true, values: new Set() }` as empty

**Tests**: Negated categories excludes matching events; negated search excludes matching titles; negated empty set passes all; combined with normal filter on another field works.

### Task 2.2: Add relative date range resolver

**Files**: `src/filters/relativeDates.js` (create), `src/filters/__tests__/relativeDates.test.js` (create)

**Changes**:
1. Export `RELATIVE_DATE_PRESETS` array:
   - Past: `last7days`, `last30days`, `lastMonth`, `lastQuarter`
   - Current: `today`, `thisWeek`, `thisMonth`, `thisQuarter`
   - Future: `tomorrow`, `next7days`, `nextWeek`, `nextMonth`, `nextQuarter`
2. Export `resolveRelativeDateRange(presetValue, referenceDate)` -- uses date-fns, returns `{ start, end }` or null
3. Export `isRelativeDateRange(value)` -- true when value has `{ __relative: string }`
4. Export `resolveFilterDateRange(value, referenceDate)` -- resolves relative, passes concrete through

**Tests**: Each preset resolves to correct date range; unknown returns null; type guards work.

### Task 2.3: Integrate relative dates into filterEngine and FilterBar

**Files**: `src/filters/filterEngine.js` (modify ~5 lines), `src/filters/filterState.js` (modify ~15 lines), `src/ui/FilterBar.jsx` (modify ~30 lines)

**Changes**:
1. `filterEngine.js`: `_matchDateRange` calls `resolveFilterDateRange(range)` before matching
2. `filterState.js`: `buildFilterSummary` detects relative ranges and shows preset label; `isEmptyFilterValue` handles `{ __relative: '' }`
3. `FilterBar.jsx`: Add preset `<select>` before date inputs populated from `RELATIVE_DATE_PRESETS`; selecting preset calls `onChange(field.key, { __relative: presetValue })`; hide manual inputs when preset active

### Task 2.4: Serialize/deserialize relative dates in saved views

**Files**: `src/hooks/useSavedViews.js` (modify ~5 lines), `src/hooks/__tests__/useSavedViews.test.js` (add tests)

**Changes**:
1. In `deserializeFilters`: if `result.dateRange?.__relative`, preserve as-is (don't attempt Date conversion)
2. `serializeFilters` already handles plain objects correctly -- no change needed

**Tests**: Round-trip preserves `{ __relative: 'last7days' }`; existing concrete date range tests still pass.

---

## Sprint 3: Filter URL Serialization and Quick Presets

### Task 3.1: Filter URL serializer/deserializer

**Files**: `src/filters/filterUrl.js` (create), `src/filters/__tests__/filterUrl.test.js` (create)

**Changes**:
1. Export `filtersToSearchParams(filters, schema)` -- encodes filter state to URLSearchParams:
   - Multi-select Sets: `?categories=Meeting,PTO`
   - Text: `?search=quarterly`
   - Date ranges: `?dateRange=2026-04-01..2026-04-30` or `?dateRange=~last7days` (relative)
   - Negated: prefix with `!` -- `?categories=!PTO`
2. Export `searchParamsToFilters(params, schema)` -- reverses encoding
3. Export `filtersToQueryString(filters, schema)` -- convenience wrapper

**Tests**: Round-trip equivalence; negated values; relative dates; unknown params ignored.

### Task 3.2: useFilterUrl hook for URL sync

**Files**: `src/hooks/useFilterUrl.js` (create), `src/hooks/__tests__/useFilterUrl.test.js` (create)

**Changes**:
1. Export `useFilterUrl({ filters, schema, replaceFilters, enabled = false })`:
   - On mount (if enabled + URL has params): calls `replaceFilters`
   - On filter change: debounced (300ms) `history.replaceState` with updated params
   - Returns `{ filterUrl: string }`

**Tests**: Disabled by default; reads URL on mount when enabled; writes on change; clears query when filters empty.

### Task 3.3: Quick filter presets component

**Files**: `src/ui/QuickFilterPresets.jsx` (create), `src/ui/QuickFilterPresets.module.css` (create), `src/WorksCalendar.tsx` (modify ~10 lines)

**Changes**:
1. Small component (~40 lines): renders horizontal pill buttons from `presets` prop array `[{ label, filters }]`
2. Highlights active preset when current filters match
3. WorksCalendar.tsx: accept `filterPresets` prop, render between ProfileBar and FilterBar

### Task 3.4: Active filter count badge

**Files**: `src/filters/filterState.js` (modify), `src/ui/FilterBar.jsx` (modify), `src/index.js` (modify)

**Changes**:
1. New function `countActiveFilters(filters, schema)` -- counts non-empty filter values (multi-select counts each selected value)
2. FilterBar: show count in "Clear filters" button: `Clear filters (3)`
3. Export from index.js

**Tests**: Empty = 0; multi-select counts each value; text counts as 1.

---

## Sprint 4: Saved Views Improvements and Searchable Dropdowns

### Task 4.1: Searchable dropdown options in FilterBar

**Files**: `src/ui/FilterBar.jsx` (modify ~30 lines), `src/ui/FilterBar.module.css` (modify ~15 lines)

**Changes**:
1. Add `dropdownSearch` state, reset when openGroup changes
2. When option count > 8, render search input at top of dropdown (sticky)
3. Filter displayed options by search term
4. Auto-focus search input on open

### Task 4.2: "Copy link" button for saved views

**Files**: `src/ui/ProfileBar.jsx` (modify ~20 lines)

**Changes**:
1. In ViewChip manage panel, add "Copy link" button
2. Computes `filtersToQueryString(deserializeFilters(savedView.filters, schema), schema)` and copies to clipboard
3. Brief "Copied!" feedback (2s timeout, existing pattern)

**Depends on**: Task 3.1 (filterUrl.js)

### Task 4.3: Persist AdvancedFilterBuilder conditions correctly

**Files**: `src/filters/conditionEngine.js` (modify), `src/hooks/useSavedViews.js` (modify ~5 lines)

**Changes**:
1. New export `filtersToConditions(filters, schema)` -- reverse of `conditionsToFilters`:
   - Multi-select Set: one `is` condition per value
   - Text search: one `contains` condition
   - Negated: `is_not` conditions
   - Enables "edit" mode to reconstruct conditions from filter state created via FilterBar
2. `normalizeSavedView`: validate each condition's `field` and `operator` are strings; strip invalid conditions

**Tests**: Round-trip `conditionsToFilters(filtersToConditions(filters))` produces equivalent state.

### Task 4.4: Export new public utilities from index.js / index.d.ts

**Files**: `src/index.js` (modify), `src/index.d.ts` (modify)

**Changes**: Add exports for all new public APIs:
- `countActiveFilters`, `buildFilterSummary` from filterState
- `filtersToSearchParams`, `searchParamsToFilters`, `filtersToQueryString` from filterUrl
- `RELATIVE_DATE_PRESETS`, `resolveRelativeDateRange` from relativeDates
- `conditionsToFilters`, `filtersToConditions`, `conditionsMatchSchema` from conditionEngine
- `defaultOperatorsForType`, `FilterOperator` type from filterSchema

---

## Task Dependency Map

```
Sprint 1 (sequential):  1.1 -> 1.2 -> 1.3 -> 1.4
Sprint 2:               2.1 (independent)
                         2.2 -> 2.3 -> 2.4 (sequential)
Sprint 3:               3.1 -> 3.2 (sequential)
                         3.3, 3.4 (independent)
Sprint 4:               4.1 (independent)
                         4.2 (depends on 3.1)
                         4.3 (depends on 1.2)
                         4.4 (last -- depends on all new exports)
```

## Summary Table

| Sprint | Task | Title | Files | Est. Lines |
|--------|------|-------|-------|------------|
| 1 | 1.1 | Add operator definitions to filterSchema.ts | 1 mod, 1 new | ~140 |
| 1 | 1.2 | Build conditionsToFilters with operator-aware logic | 2 new | ~220 |
| 1 | 1.3 | Wire schema-driven fields into AdvancedFilterBuilder | 1 mod | ~80 |
| 1 | 1.4 | Thread schema + items to AdvancedFilterBuilder consumers | 2 mod | ~25 |
| 2 | 2.1 | Add NOT operator support to filterEngine | 2 mod | ~120 |
| 2 | 2.2 | Add relative date range resolver | 2 new | ~190 |
| 2 | 2.3 | Integrate relative dates into filterEngine and FilterBar | 3 mod | ~125 |
| 2 | 2.4 | Serialize/deserialize relative dates in saved views | 1 mod | ~35 |
| 3 | 3.1 | Filter URL serializer/deserializer | 2 new | ~230 |
| 3 | 3.2 | useFilterUrl hook for URL sync | 2 new | ~140 |
| 3 | 3.3 | Quick filter presets component | 2 new, 1 mod | ~70 |
| 3 | 3.4 | Active filter count badge | 3 mod | ~58 |
| 4 | 4.1 | Searchable dropdown options in FilterBar | 2 mod | ~45 |
| 4 | 4.2 | "Copy link" button for saved views | 1 mod | ~25 |
| 4 | 4.3 | Persist AdvancedFilterBuilder conditions correctly | 2 mod | ~115 |
| 4 | 4.4 | Export new public utilities | 2 mod | ~65 |

**Total**: ~1,683 lines across 16 Codex-sized tasks

## Verification

After each sprint, run:
1. `npx vitest run` -- all unit tests pass
2. `npx vitest run src/filters/` -- filter-specific tests pass
3. `npm run build` -- library builds without errors
4. `npm run dev` -- demo app loads, FilterBar renders, saved views work
5. After Sprint 4: `npx playwright test` -- E2E tests pass

## Critical Files Reference

- `src/filters/filterSchema.ts` -- types, factories, DEFAULT_FILTER_SCHEMA
- `src/filters/filterEngine.js` -- applyFilters, matchers, extractors
- `src/filters/filterState.js` -- pure state helpers
- `src/ui/FilterBar.jsx` -- main filter UI
- `src/ui/AdvancedFilterBuilder.jsx` -- Smart View condition builder
- `src/ui/ProfileBar.jsx` -- saved view chips
- `src/hooks/useCalendar.js` -- filter state management
- `src/hooks/useSavedViews.js` -- localStorage persistence
- `src/WorksCalendar.tsx` -- integration point (~lines 276, 305-330, 411-425)
- `src/index.js` / `src/index.d.ts` -- public exports

## Reusable Patterns

- `createId(prefix)` from `src/core/createId.js` for generating IDs
- CSS Modules with `--wc-*` CSS variables for theming
- lucide-react for icons (already a dependency)
- date-fns for all date operations (already a dependency)
- Vitest with `describe/it/expect` for tests
- `.js` extensions in imports even for `.ts` files (Vite plugin resolves)
