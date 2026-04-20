# Assets Tab — Phase 1 Sprint Plan

## Context

Phase 0 Discovery ([`docs/assets-tab-discovery.md`](./assets-tab-discovery.md)) locked in the contracts and decisions. Phase 1 builds the **AssetsView skeleton**: a new sixth view registered on WorksCalendar, with zoom controls, asset-specific sticky column (registration + sublabel + location banner), category hue mapping, and the foundational types wired through. Workflow logic (approvals, conflict modal) is deferred to Phase 2.

**Scope.** ~2 weeks across 4 sprints. Each sprint produces a reviewable, mergeable slice. No workflow UX yet — pills render from `meta.approvalStage` but the submit/approve/deny flow is stubbed.

**Out of scope for Phase 1.** 5-state approval UX, conflict modal, audit drawer, Samsara/SkyRouter reference adapters — all Phase 2/3.

---

## Architectural Decisions (carried from Phase 0)

1. **`meta.approvalStage`** (not `EventStatus` extension) — Phase 1 renders stage visuals; transitions are stubbed.
2. **Clone TimelineView skeleton** — reuse virtualization, lane stacking, grouping, collapse/expand. Asset-specific sticky column and zoom controls replace the employee column and day grid respectively.
3. **Categories in ConfigPanel** — new tab, stored in calendar config. Fallback to `DEFAULT_CATEGORIES` when absent.
4. **Responsive squish** — no mobile fallback. Sticky column narrows; zoom defaults to Day on narrow screens.
5. **Perf budget: 200 assets × ~2k requests × Quarter.** TimelineView's existing row virtualization covers this; no horizontal windowing yet.

---

## Sprint 1: Foundations (types + registry)

**Goal.** Wire all the Phase 0 contracts into the codebase without any view implementation. An empty "Assets" tab that renders a placeholder should appear on click.

### Task 1.1 — Create `src/types/assets.ts`

**Files.** `src/types/assets.ts` (create)

**Content.** Migrate the four contracts from `docs/assets-tab-discovery.md`:
- `ApprovalStageId`, `ApprovalStage`, `ApprovalHistoryEntry`
- `LocationData`, `LocationProvider`, `ManualLocationProviderOptions`
- `ConflictCheckRequest`, `ConflictCheckResult`, `ConflictingEvent`
- `CategoryDef`, `CategoriesConfig`, `DEFAULT_CATEGORIES` (const)
- `AssetsZoomLevel` (`'day' | 'week' | 'month' | 'quarter'`)

Runtime export: `DEFAULT_CATEGORIES` (5 seed categories, hex colors). Everything else is a type-only export.

### Task 1.2 — Extend `src/index.d.ts`

**Files.** `src/index.d.ts`

**Changes.**
- Add `'assets'` to `ViewType` union (line 9).
- Extend `SavedView` with `sortBy?: SortConfig[]` and `zoomLevel?: AssetsZoomLevel`.
- Add new optional `WorksCalendarProps` fields: `locationProvider`, `categoriesConfig`, `onConflictCheck`, `onApprovalAction`, `renderAssetLocation`, `renderConflictBody`.
- `export * from './types/assets';`
- Import `SortConfig` from `./types/grouping` (already internal) — re-export if not already public.

### Task 1.3 — Extend `useSavedViews` normalization

**Files.** `src/hooks/useSavedViews.js`

**Changes.**
- `normalizeSavedView()` (line 26): whitelist `sortBy` (Array — shape validated shallowly) and `zoomLevel` (must be one of `'day' | 'week' | 'month' | 'quarter'`, else `null`).
- `saveView()` (line 191): accept `sortBy` and `zoomLevel` in opts, persist.
- `resaveView()` (line 210): accept optional `sortBy`/`zoomLevel` patches.

**Test.** Extend `src/hooks/__tests__/useSavedViews.test.js` (if it exists) with a round-trip check for the two new fields. If the file doesn't exist, add a minimal one.

### Task 1.4 — Register 'assets' view

**Files.** `src/WorksCalendar.tsx`

**Changes.**
- Line 75: extend `CalendarView` type to include `'assets'`.
- Line 158 `VIEWS` array: add `{ id: 'assets', label: 'Assets' }`.
- Line 180 `viewRange()`: handle `'assets'` — default to Month range for now, zoom-aware in Sprint 2.
- Line 1532 view switch: add `cal.view === 'assets' && <AssetsPlaceholder />` — a 3-line stub component inside the file that says "Assets view — coming in Phase 1 Sprint 2." This keeps the tab clickable without breaking types.

**Why a placeholder.** Sprint 1 is foundation-only; shipping the tab without a placeholder leaves a blank `<div>` which is worse UX than a clear "under construction" message during internal QA.

### Task 1.5 — Verify no regressions

**Run.** `npm test` and `npm run build` (if applicable). All existing tests pass unchanged. No new runtime code paths exercised.

**Acceptance.** Click "Assets" tab → placeholder shows. Click "Schedule" → TimelineView still renders. Saved view with `zoomLevel: 'week'` round-trips through localStorage.

---

## Sprint 2: AssetsView skeleton

**Goal.** Replace the placeholder with a working horizontal timeline: sticky asset column, zoomable day grid, pill bars sourced from events grouped by `resource`. Grouping, filters, and saved views already flow through from the main calendar state.

### Task 2.1 — Clone TimelineView → AssetsView

**Files.** `src/views/AssetsView.jsx` (create), `src/views/AssetsView.module.css` (create)

**Approach.** Start from `src/views/TimelineView.jsx` verbatim. Strip employee-specific code paths (shift coverage, on-call, PTO quick actions). Keep: `assignLanes()`, row virtualization, group header rendering, keyboard nav, scroll observer.

### Task 2.2 — Zoom control

**Files.** `src/views/AssetsView.jsx`

Add zoom state `'day' | 'week' | 'month' | 'quarter'` with a segmented control in the view header. Each level maps to a `pxPerDay` value (Day: 80px, Week: 30px, Month: 10px, Quarter: 4px). Visible date range scales accordingly. Zoom level flows from `SavedView.zoomLevel` when a saved view is applied.

### Task 2.3 — Sticky asset column

**Files.** `src/views/AssetsView.jsx`, `src/views/AssetsView.module.css`

Replace the 188px employee column with a configurable (default 220px) sticky column showing:
- Line 1: asset id / registration (`event.resource` or `resource.name`)
- Line 2: sublabel (generic free-text — `resource.meta.sublabel`, e.g. "5,955.4 TT" for aviation)
- Line 3: location banner (placeholder in Sprint 2, wired to `LocationProvider` in Sprint 3)

### Task 2.4 — Category hue mapping

**Files.** `src/views/AssetsView.jsx`

Pills use `categoriesConfig.categories[event.category].color` for fill, falling back to existing `colorRules` pipeline, then to `DEFAULT_CATEGORIES`, then to the theme token. `pillStyle` (`'hue' | 'stripe' | 'border'`) toggles render mode.

### Task 2.5 — Stage visuals (no logic yet)

**Files.** `src/views/AssetsView.jsx`, `src/views/AssetsView.module.css`

Read `event.meta.approvalStage.stage` and render:
- `requested` → `opacity: 0.5`, label "REQUESTED"
- `approved` → solid, title as-is
- `finalized` → solid, label "FINALIZED"
- `pending_higher` → `opacity: 0.5` + dashed border
- `denied` → strikethrough + `opacity: 0.4`
- absent → treat as `finalized` (back-compat for hosts not using workflow)

Click on `denied` opens a stub audit drawer (Sprint 4 proper implementation). No approve/deny actions yet.

### Task 2.6 — Tests

**Files.** `src/views/__tests__/AssetsView.test.jsx` (create)

Cover: view renders with no events; pills render at correct positions; zoom changes pxPerDay; stage visuals apply expected classnames; grouping groups rows with headers.

---

## Sprint 3: ManualLocationProvider + banner wiring

**Goal.** Ship a working `LocationProvider` plugin surface with a default manual provider. Reference the contract; no third-party adapters yet.

### Task 3.1 — `ManualLocationProvider`

**Files.** `src/providers/ManualLocationProvider.ts` (create), `src/providers/__tests__/ManualLocationProvider.test.ts` (create)

Reads `resource.meta.location` (or configurable `metaKey`) and returns it as `LocationData`. Never polls (`refreshIntervalMs: 0`). Exports a factory `createManualLocationProvider(options?)`.

### Task 3.2 — Provider runtime in AssetsView

**Files.** `src/views/AssetsView.jsx`, `src/hooks/useResourceLocations.ts` (create)

Build `useResourceLocations(resourceIds, provider)`:
- On mount, calls `provider.init?()` once.
- For each visible resource, subscribes if `provider.subscribe` exists; otherwise polls `fetchLocation` at `refreshIntervalMs` (clamped to 5000ms min).
- Returns `Map<resourceId, LocationData>`.
- Cleans up subscriptions / intervals on unmount.

Wire return value into the sticky-column banner. Honor `renderAssetLocation?` render prop for host-custom banner.

### Task 3.3 — Provider prop on WorksCalendar

**Files.** `src/WorksCalendar.tsx`

Thread `locationProvider` prop (default: `createManualLocationProvider()`) into AssetsView. Thread `renderAssetLocation` too.

### Task 3.4 — Docs + example

**Files.** `docs/LocationProvider.md` (create), `examples/assets-custom-provider/` (create)

Document the interface, polling vs. subscribe semantics, and show a stub "fake SkyRouter" provider in `examples/`.

---

## Sprint 4: ConfigPanel Categories tab + polish

**Goal.** Owner-configurable categories via existing ConfigPanel UI. `categoriesConfig` prop wins when provided; otherwise ConfigPanel edits the stored config.

### Task 4.1 — ConfigPanel Categories tab

**Files.** `src/ui/ConfigPanel.jsx`

Add a "Categories" tab. Fields per category row: `id` (readonly if in use), `label`, `color` picker, `description`, `approvalTier` (1|2|none), `disabled` toggle. Drag-to-reorder. Validates: unique ids; color is valid hex.

### Task 4.2 — Config persistence + prop override

**Files.** `src/core/configSchema.js`, `src/WorksCalendar.tsx`

Extend config schema with `categories: CategoriesConfig`. `WorksCalendar` reads `props.categoriesConfig ?? ownerConfig.categories ?? { categories: DEFAULT_CATEGORIES }`.

### Task 4.3 — Audit drawer (denied pills)

**Files.** `src/ui/AuditDrawer.jsx` (create)

Right-side slide-in drawer triggered by clicking a `denied` pill. Shows `ApprovalHistoryEntry[]` in reverse chronological order. Read-only. No actions.

### Task 4.4 — A11y + visual QA

- `aria-label` on pills including category, title, stage, resource, and range.
- Keyboard nav: `Tab` / `Arrow` across pills within a row, `PageUp` / `PageDown` across rows, `Home` / `End` jumps to first / last pill.
- Run `npm run qa:visual` with a new fixture page in `examples/` covering 5 stages × 4 zoom levels.

### Task 4.5 — Demo page

**Files.** `demo/App.jsx`

Add an "Assets" section that seeds ~20 resources × ~200 requests across varying categories and stages, plus the ManualLocationProvider wired to `resource.meta.location`.

---

## Verification (end of Phase 1)

- `npm test` — all existing tests pass; new AssetsView and ManualLocationProvider tests pass.
- `npm run test:browser` — Playwright spec drives the Assets tab: zoom, grouping, filters, saved views round-trip with `zoomLevel` and `sortBy`.
- `npm run qa:visual` — fixture covers all pill stages × zoom levels.
- `npm run dev` — demo shows Assets tab with seeded data, category hues, stage visuals, sticky column with manual location banner.

**Exit criteria.** The Assets view renders, is reachable from the view toggle, honors the contracts (category hue, stage visuals, zoom, grouping), and the provider surface is live with the default manual implementation. Workflow actions are stubs — user can see pills but can't approve/deny yet. That's Phase 2.

---

## Sprint 1 execution — tracked in this session

Sprint 1 Tasks 1.1 – 1.5 execute as part of the current session. Sprints 2–4 are scoped for follow-on PRs.
