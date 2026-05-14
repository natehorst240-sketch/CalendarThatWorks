# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.1] — 2026-05-14

Re-publish of 0.9.0. The 0.9.0 tarball on the registry was assembled from
a stale local `dist/` (a pre-0.8.0 build) because the publish command used
`--ignore-scripts`, which skipped `prepublishOnly` and therefore skipped
`npm run build`. The shipped tarball was missing every lazy-loaded chunk,
shipped a 2.5 KB `style.css` instead of the ~270 KB build output, and even
included the `works-calendar.umd.js` file that was deleted in 0.9.0.

This release is the actual 0.9.0 source tree rebuilt cleanly. No source or
behavior changes vs. `[0.9.0]` — same code, correct `dist/`. 0.9.0 has been
deprecated on the registry to redirect installers here.

### Fixed (packaging)

- `dist/style.css` now contains the full ~270 KB of component rules — every
  hashed CSS-module class referenced by the JS bundle resolves.
- All lazy-loaded view chunks (`AvailabilityForm`, `DayView`, `EventForm`,
  `WorkflowBuilderModal`, …) ship in `dist/` alongside the entry bundle.
- `dist/works-calendar.umd.js` is gone (it was supposed to be removed in
  0.9.0; the 0.9.0 stale-dist accident shipped it anyway).

## [0.9.0] — 2026-05-13

The "packaging + type-safety hardening" release. Tightens the published surface
(ESM-only, attw-clean), purges `any` from the codebase, and lands several
small but visible fixes (deterministic category colors, lossless saved-view
sanitization, all-day-date timezone fix).

### Added

- **`WorksCalendarConfig`** type exported from the public entries. Replaces
  the internal `AnyRecord` alias used by `ConfigPanel` and `CalendarModals`;
  the legacy `OwnerConfig` name is kept as a deprecated alias.
- **`SavedViewRecord`** type re-exported from `useSavedViewsManager` so
  `useCalendarWorkspace`'s declaration emit names it cleanly (fixes TS4058
  in downstream type-checks).
- **Structured `useSavedViews` input types** — `SaveViewOptions` now uses
  named `GroupByInput` / `SortInput` / `CollapsedGroupsInput` /
  `ZoomLevelInput` / `BaseIdsInput` / `ShowAllGroupsInput` aliases. Callers
  get compile-time signal for the shapes the sanitizers accept; the
  sanitizers themselves stay `unknown`-tolerant at the storage boundary.
- `npm run package:check` script using `@arethetypeswrong/cli` to verify the
  `exports` map and catch type-resolution regressions before publish. The
  check now runs in CI and as part of `prepublishOnly`.
- `engines.node` set to `>=18` to document the supported runtime range.
- CI: unit tests (vitest) and Playwright e2e now run on every PR. The
  previous pipeline only ran type-check and lint despite 4 300+ tests
  existing in the repo.

### Changed

- **BREAKING — ESM-only distribution.** The package now ships only ES
  modules. The `require` condition and UMD bundles (`works-calendar.umd.js`,
  `works-calendar-lite.umd.js`) have been removed from `package.json#exports`
  and the Vite build configs. CommonJS consumers should switch to dynamic
  `import()`. Node 18+ has supported ESM natively for several releases; the
  README already advertised the library as ESM-only.
- **BREAKING — `ConfigPanelProps` handler signatures tightened.** Every
  callback previously typed as `LooseHandler` (`(...args: any[]) => void`)
  now carries a precise signature: source handlers take `SourceDraft` /
  `(id, patch)`, schedule-template handlers take `ScheduleTemplateDraft`
  and return `void | Promise<void>`, employee handlers take `EmployeeRecord`
  / `EmployeeId`. Hosts whose handlers were already shaped correctly need
  no change; mis-shaped handlers will now fail at the type boundary.
- Subpath type declarations (`./integrations/*`, `./api/v1/server`, `./lite`)
  now rewrite cross-tree imports to the package root and add explicit `.js`
  extensions to relative specifiers so they resolve cleanly under `node16`
  and bundler module-resolution modes. The lite entry's `default as` re-
  exports are also rewritten so consumers don't hit TS2305 on `ScheduleView`,
  `EventStatusBadge`, `CalendarErrorBoundary`, `CalendarExternalForm`, and
  `FocusChips`.
- CSS-only entrypoints (`./styles`, `./styles/family/*`, etc.) now use the
  `{ "default": "./dist/<file>.css" }` form for clarity. They are excluded
  from `attw` since they intentionally resolve to `.css` rather than JS.
- **`any` purged across `src/`.** Replaced with `unknown`, real domain types,
  or `Record<string, unknown>`; removed every file-level
  `eslint-disable @typescript-eslint/no-explicit-any` banner. Three narrow
  `eslint-disable-next-line` disables remain, each documented inline.
  Includes typing the filter / saved-view layer (`filterEngine`,
  `filterSchema`, `filterState`, `conditionEngine`, `useSavedViews`)
  end-to-end.
- **`ScheduleView` rows are a discriminated union.** `FlatRow = TimelineRow
  | GroupHeaderRow` keyed on `kind`; replaces the `_type: 'groupHeader'` /
  `as any` cast pattern. Render and keyboard-navigation paths now narrow
  safely without runtime casts.

### Fixed

- **Deterministic category colors.** `eventModel` now derives the palette
  index from a pure FNV-1a hash of the category name, with the hash spread
  across 64 buckets (first 8 hit the curated palette, the rest spill into a
  golden-angle HSL hue). Two calendar instances on the same page render the
  same color for the same category regardless of mount order; colors are
  stable across reloads. Removes the cross-instance leak and test pollution
  caused by the previous module-scoped counter, and reduces palette
  collisions on small datasets.
- **`useSavedViews.sanitizeGroupBy` is lossless for every `GroupByInput`
  shape.** A single `GroupConfig` no longer collapses to `null`; bare strings
  inside mixed `Array<string | GroupConfig>` are promoted to `{ field }` form
  instead of being dropped. Saved views with mixed grouping shapes now
  round-trip without losing levels.
- **`AvailabilityForm` uses `parseISO` for date-only strings.** `new
  Date('2026-05-01')` parsed as UTC midnight and rendered as the previous
  day in negative offsets (US timezones); the modal would pre-fill and save
  the wrong date for all-day availability entries. `parseISO` preserves the
  local calendar date.
- **Event IDs use `crypto.randomUUID()`** instead of a module-scoped counter.
  Eliminates collisions across calendar instances on the same page and
  removes shared module state from `eventModel`.
- `WorksCalendar.tsx` and the entire mutation/engine hook stack now type
  their callbacks against the public domain types — `OperationResult`,
  `EngineOperation`, `NormalizedEvent`, `WorksCalendarConfig` — rather than
  `any`.

### Removed

- **UMD bundles** (`dist/works-calendar.umd.js`,
  `dist/works-calendar-lite.umd.js`) and the `require` export conditions.
  The README already documented the library as ESM-only.
- **`AnyRecord`** and **`LooseHandler`** internal type aliases.
  `AnyRecord` is replaced by `WorksCalendarConfig` (with concrete
  `FilterField[]` / `NormalizedEvent[]` types for `schema` / `items`);
  `LooseHandler` is replaced by the precise handler signatures listed under
  *Changed*. Neither alias was ever part of the public surface.

### Verified

- **MapLibre carve-out**: `maplibre-gl` and `react-map-gl` are optional peer
  dependencies; `MapView` resolves them via dynamic `import()` so they stay
  out of the core ESM bundle and core type declarations. Consumers that
  don't render the map view pay zero bundle cost for the map runtime.

## [0.8.0] — 2026-05-13

### Added

- **Reminders** (`useReminders`, `ReminderDef`, `onReminder` prop): per-event
  reminders with two delivery methods — `'browser'` (Web Notification API) and
  `'callback'` (fires `onReminder`). Timers are rebuilt from the live event list
  on every change; past reminders and all-day events are silently skipped. See
  `docs/Reminders.md`.

- **Multi-calendar source system** (`CalendarLegend`, `showCalendarLegend`,
  `useSourceStore`, `useSourceAggregator`): ICS feeds and imported CSV datasets
  each get a color-keyed identity that propagates to `NormalizedEvent.color`.
  `showCalendarLegend={true}` renders a toggle list in the sidebar; `CalendarLegend`
  is also exported for standalone use. See `docs/CalendarSources.md`.

- **Offline indicator** (`OfflineIndicator`, `useNetworkStatus`,
  `showOfflineIndicator` prop): slide-in banner driven by the browser's `online`/
  `offline` events. `useNetworkStatus` is SSR-safe (`isInitializing` guard prevents
  hydration mismatches). See `docs/OfflineSupport.md`.

- **Workflow channel registry** (`createChannelRegistry`, `createSlackChannel`,
  `createEmailChannel`, `createWebhookChannel`, `dispatchWorkflowEvents`): Phase 4
  of the workflow engine. `notify` nodes emit transport-agnostic events; hosts
  register adapter functions and call `dispatchWorkflowEvents` to fan out. Failures
  are captured per-channel in `WorkflowDispatchReport` without aborting the batch.

- **Parallel + join workflow nodes** with `requireAll` / `requireAny` / `requireN`
  quorum modes. Fan out to N branches and rejoin once quorum is met.

- **SLA timers on approval nodes** (`onTimeout: 'escalate' | 'auto-approve' |
  'auto-deny'`). Hosts tick the workflow with `useWorkflowTicker`.

- **Booking holds** (`useBookingHold`, `createHoldRegistry`, `HoldConflictRule`):
  temporary slot reservation that expires after a configurable duration. Wire a
  `HoldConflictRule` into `evaluateConflicts` to block competing submissions.

- **Geo-conflict detection** (`evaluateGeoConflicts`, `GeoTravelFeasibilityRule`):
  checks whether a resource can physically travel between consecutive events given
  their locations and a speed assumption. Returns `GeoConflictViolation[]` with
  `distanceKm`, `gapMinutes`, and `travelMinutes` for each failure.

- **`PolicyViolationRule`** and **`AvailabilityViolationRule`** conflict rule types
  — advance-notice enforcement, duration caps, blackout dates, and unavailability
  windows.

- **`MiniCalendar`** component: compact month-grid date picker for use in sidebars
  and custom toolbars.

- **`TimezonePicker`** component: searchable select for IANA timezone strings.

- **`SearchBar`** component: debounced full-text event search, exported for use
  outside the built-in toolbar.

- **`BulkActionBar`** + **`useBulkSelect`**: multi-select event management (bulk
  delete, bulk status change) with keyboard-accessible selection.

- **`FirebaseAdapter`** (`api/v1/adapters`): Firestore real-time adapter. Supports
  both v8 namespaced and v9 modular APIs via `adapterFns`. Field mapping via
  `fromDoc`/`toDoc`; live updates via `onSnapshot`.

- **`PocketBaseAdapter`** (`api/v1/adapters`): PocketBase SSE real-time adapter.
  Custom field mapping via `fromRecord`/`toRecord`; live updates via `subscribe`.

- **`createNextHandler`** (`api/v1/server`): Next.js App Router route handler
  factory producing `{ GET, POST, PATCH, DELETE }` exports for `route.ts`. Works
  with Prisma, Drizzle, raw `pg`, or any async data layer. Optional `auth` hook.

- **Pill drag-to-reschedule** (`MonthView`): single-day pills drag to another day
  cell. Native pointer-event implementation — no third-party drag library.

- **Documentation** — new and expanded reference pages:
  `Reminders.md`, `CalendarSources.md`, `OfflineSupport.md`, `ScheduleView.md`,
  `Conflicts.md`; expanded sections in `Requirements.md`, `Workflow.md`,
  `MaintenanceAndInvoicing.md`, `CalendarConfig.md`, `ResourcePools.md`, and
  `GROUPING_API.md`. Level 3 data-flow diagrams 3h–3n added to
  `DataFlowDiagrams.md`.

### Changed

- **Owner access is now role-based** (`role` prop). Pass `role="admin"` from your
  auth layer; `useOwnerConfig` derives `isOwner` from that value. Replaces the
  deprecated SHA-256 password check.

- **`CalendarEngine` is now the sole state source** for `view` and `cursor`.
  `useCalendar` hook removed from the public API; all views read from the engine
  via `useCalendarEngine`.

- **`CalendarContext` strictly typed** — replaced `[key: string]: any` with named
  typed fields. `PermissionCaps` moved to `types/ui.ts`.

- **Dependency index lookups are now O(k)**: `_dependenciesByFromEvent` /
  `_dependenciesByToEvent` indexes added to `CalendarEngine`; `getSuccessorsOf` /
  `getPredecessorsOf` no longer scan the full dependency list.

- `package.json` exports: `./api/v1/server` entry point added for
  `createNextHandler`.

### Fixed

- **Runtime hardening** (P0–P2): engine ingestion/mutation guards, ghost-delete
  prevention, undo/redo shortcut scoped to calendar root, config persistence moved
  out of React state updaters, `calendarId`-change config reload.

- **10 security vulnerabilities** resolved across the public-API surface.

- **View resolution** consolidated into a single effect — eliminates flash-of-wrong-
  view on initial render.

- **Lite bundle** gzip size reduced ~48% via lazy-loading and externalization.

### Removed

- **`ownerPassword` prop** and `OwnerLock` / `OwnerLoginModal` components. Use
  `role="admin"` from your auth layer instead. `useOwnerConfig` no longer returns
  `authenticate`, `authError`, or `isAuthLoading`.

- **`config.access.viewerPassword`** and the ConfigPanel **Access** tab.
  `ConfigPanelTabId` no longer includes `'access'`.

- **`useOccurrences`** removed from the public API. Use the engine's
  `getOccurrencesInRange` via `useCalendarEngine` instead.

## [0.6.2] - 2026-05-03

### Fixed

- Restored WeekView tap-vs-drag behavior so single-day pills and multi-day span events open correctly when tapped while still supporting drag-to-move.
- Restored the demo walkthrough's Mission Alpha flow to use the real move/edit/save/conflict path.
- Fixed demo mission selection so mission details are based on the clicked event instead of a hardcoded mission.
- Improved demo hover-card edit wiring and safer metadata/resource rendering.
- Improved demo recovery from stale or corrupted browser state.

### Added

- Added a top-level demo error boundary with reload recovery.
- Added safe localStorage helpers and defensive storage usage across demo/config paths.
- Added demo feature flags / kill switches for walkthrough, MissionHoverCard, PWA registration, map widget, and workflow builder surfaces.
- Added `?resetDemo=1` recovery path to clear demo state and unregister service workers.
- Exported reusable `MissionHoverCard` UI and related helpers from the library.
- Added a single Air EMS demo filter model that derives category, filter schema, and cascade config outputs.
- Added focused tests for Air EMS demo filter config consistency.

### Changed

- Changed demo PWA behavior to support prompt/disable flows instead of relying on forced auto-update behavior.
- Derived `UNIFIED_CATEGORIES_CONFIG`, `DEMO_FILTER_SCHEMA`, and `DEMO_CASCADE_CONFIG` from one source-of-truth model.
- Simplified automated QA strategy around small, stable smoke tests.
- Moved full guided demo walkthrough verification out of brittle E2E automation and into manual release QA.

### Removed

- Removed Nightly AI QA automation.
- Removed brittle full guided walkthrough / demo-specific exploratory E2E automation from the active automated test path.
- Removed duplicated in-file Air EMS filter/cascade/category config blocks from the demo app.

### Testing / QA

- Kept automated E2E focused on stable smoke coverage.
- Added focused unit coverage for generated demo filter config consistency.
- Documented the full guided demo walkthrough as a manual release checklist instead of a blocking Playwright flow.

## [0.6.1] - 2026-05-02

MapView gains a controls?: boolean prop (default true) — set to false for compact contexts
MapView.module.css no longer enforces min-height: 320px on .mapWrap — the parent container must provide height

## [0.6.0] — 2026-05-01

The "Embedder slots + walkthrough" release. Documents the public-API
surface changes that originated in the guided-walkthrough work and the
chrome-customization additions, plus a callout for the broader main-line
work that landed since 0.5.0.

### Other changes since 0.5.0

A large body of work landed on `main` between 0.5.0 and this release
that's not enumerated here individually — strict-null migration sprints,
the asset setup flow, dispatch board, base view redesign, map layer +
integrations, invoicing integration, e2e fixes, the nightly AI QA
workflow, the visual drag-conflict overlay, and others. For the full
set, run:

```sh
git log v0.5.0..v0.6.0 --first-parent --oneline
```

The sections below cover the public-API additions / changes / breaking
items I have direct context on; consumers upgrading from 0.5.0 should
read both this section and the bulk git log together.

### Added

- **`onViewChange?: (view: CalendarView) => void`** prop on
  `<WorksCalendar>`. Fires whenever the active view changes (toolbar
  click, keyboard shortcut, programmatic `cal.setView`, saved-view
  apply). Skips the initial mount so consumers don't get a synthetic
  event for the default view.
- **`onMapWidgetOpenChange?: (open: boolean) => void`** prop on
  `<WorksCalendar>`, forwarded to the embedded `<MapPeekWidget>`. Fires
  on the open / close transition of the rail map peek's expanded modal.
- **`onOpenChange?: (open: boolean) => void`** prop on `MapPeekWidget`.
  Same semantics as the WorksCalendar passthrough above; useful when
  embedding the widget directly outside the calendar.
- **`leftRailExtras?: LeftRailAction[]`** prop on `<WorksCalendar>`.
  Appended after the built-in saved-views / focus / settings buttons so
  embedders can plug their own icon shortcuts (export, notifications,
  custom drawers, etc.) into the chrome. Built-in ids are reserved —
  extras with `id` matching `'saved-views'` / `'focus'` / `'settings'`
  are filtered out defensively.
- **`rightPanelExtras?: ReactNode`** prop on `<WorksCalendar>`. Appended
  after the built-in Region map + Crew on shift sections. For visual
  consistency wrap each section in
  `<RightPanelSection title="…">…</RightPanelSection>` (also exported);
  theme tokens + section dividers stay aligned with the stock chrome.
- **New public exports** to support the slot props:
  - `RightPanel`, `RightPanelSection` (components)
  - `RightPanelSectionProps`, `LeftRailAction` (types)
- **DOM hooks for host tooling**:
  - `data-wc-event-id="<id>"` on event pills in Day, Week, Month, and
    Schedule views. Lets host code (e.g. tour overlays, automated
    tests) target a specific event pill across views by id rather than
    the volatile module-scoped CSS class.
  - `data-wc-view-button="<viewId>"` on the toolbar view buttons so
    automation can pick a specific view button without relying on
    accessible-name regexes.
  - `data-wc-map-widget="peek"` on the `MapPeekWidget` host wrapper.

### Changed

- **WeekView pills no longer render duplicate time text.** The pill's
  vertical position and height already encode the start / end visually,
  and the timeRange ("8:00 AM – 4:00 PM") + Start / End rows just
  starved the title of legible space when columns were narrow. Pills
  now render the title (with ApprovalDot + EventStatusBadge prefixes)
  and Resource only. **The pill `aria-label` retains the full hour
  range for screen readers.** Visual change for any consumer asserting
  on those exact strings.
- **LeftRail + RightPanel surfaces now extend the full body height.**
  Previously the inner `.root` of each rail collapsed to content height,
  leaving a transparent gap below the buttons / sections that bled the
  parent surface through and made the rails read as "cut off" against
  a tall calendar grid. Now both inner roots `height: 100%` so their
  surface + border match the body's bottom edge.
- **Demo dataset is now date-relative.** `demo/emsData.ts` and the
  walkthrough's seed events used to hardcode the week of 2026-04-20.
  Once the system clock moved past that week, the events fell outside
  the calendar's visible window and visitors saw a blank demo.
  Replaced 26 hardcoded ISO date strings with offsets relative to
  `startOfWeek(new Date(), { weekStartsOn: 1 })`. The schedule shape
  is preserved exactly; the dataset just slides forward with real time.
  Only affects consumers who imported `emsData` directly (it's a demo
  fixture, not part of the public API surface), but called out for
  visibility.

### Breaking

- **`TimelineView` component renamed to `ScheduleView`.** The toolbar
  user-facing label has always been "Schedule" and the view id has
  always been `'schedule'`; the internal component name was an
  outlier. The public re-export is now `import { ScheduleView } from
  'works-calendar'` (was `TimelineView`). The view id stays
  `'schedule'`, so consumer config (`display.defaultView`,
  `cal.setView('schedule')`, saved views, etc.) does **not** need to
  change.
- **Dead `ScheduleView` 6-week grid component removed.** This was an
  earlier prototype that hadn't been re-rendered since the production
  ScheduleView (formerly TimelineView) shipped. It had no public
  re-export and no consumer references, but is being noted here for
  completeness in case a consumer was reaching into `src/views/`
  directly.

## [0.5.0] — 2026-04-19

The "Full TypeScript" release. The library is now written end-to-end in
strict TypeScript, with `dist/index.d.ts` generated from source by
`vite-plugin-dts` instead of a hand-maintained 826-line `.d.ts` that
silently drifted from the JS implementation. All `.js`/`.jsx` files under
`src/`, `demo/`, and `examples/` have been converted to `.ts`/`.tsx`.

### Added

- **Generated type declarations** — `dist/index.d.ts` is now produced by
  `vite-plugin-dts` from the TypeScript source, so the published types
  cannot drift from the implementation. Public types include
  `WorksCalendarEvent`, `NormalizedEvent`, `WorksCalendar`, `CalendarApi`,
  the `api/v1` engine schema, grouping types, and the assets module.
- **`type-check` script** (`npm run type-check`) and CI step that runs
  `tsc --noEmit` against the strict configuration.

### Changed

- **All source converted to TypeScript** — 179 internal modules across
  `src/`, plus `demo/` and `examples/`, are now `.ts`/`.tsx`. Vite/Vitest
  configs are TypeScript too.
- **Strict-mode TypeScript enabled** — `strict: true` is now on, with
  pragmatic short-term opt-outs for `noImplicitAny` and `strictNullChecks`
  to keep the migration shippable; these will be tightened in a follow-up.
- **`tsExtensionFallback` Vite plugin removed** — internal imports are now
  extensionless and resolved by bundler module resolution.

### Breaking

- **`NormalizedEvent` import path change.** The internal-but-exported
  `NormalizedEvent` type used to be importable from
  `'works-calendar/src/index.d.ts'` (or transitively through legacy
  module-augmentation paths). It now lives at the public API surface and
  is only importable from the package root: `import type { NormalizedEvent }
  from 'works-calendar'`. Consumers reaching into `src/index.d.ts`
  directly (which never existed as a public path) must migrate.

## [0.4.0] — 2026-04-18

The "UX Polish Pass" release. Five short sprints turned a workflow-rich but
sometimes-overwhelming calendar into something faster to learn and easier to
live in day-to-day.

### Added

- **Keyboard shortcuts** for view switching (`1`–`6`), navigation
  (`j`/`k`, `ArrowLeft`/`ArrowRight`), today (`t`), and a discoverability
  cheat sheet (`?`). Shortcuts are guarded against text-input focus,
  modifier keys, and open modal dialogs. See `useKeyboardShortcuts`.
- **Keyboard help overlay** — an accessible, focus-trapped dialog listing
  every binding, opened with `?` or via the toolbar.
- **Owner login modal** — replaces the inline gear-button popover with a
  proper aria-modal dialog, complete with focus trap, password reveal
  toggle, and inline error messaging.
- **Settings IA refactor** — ConfigPanel tabs are now grouped into four
  collapsible sections (Appearance, Data, Workflows, Access) with a
  vertical sidebar layout. The active tab's section auto-expands.
- **Create-shift fallback** — Schedule view date-select now routes to the
  generic `EventForm` when the dropped cell isn't a configured employee,
  instead of silently dropping the interaction.
- **`assetRequestCategories` prop** on `<WorksCalendar>` (optional).
  When provided alongside an `assets` registry, AssetsView renders a
  primary "Request Asset" toolbar button that opens a focused modal
  (`AssetRequestForm`). Submissions route through the normal
  `onEventSave` path with `meta.approvalStage = { stage: 'requested' }`,
  so the existing approvals state machine handles the rest
  (approve / deny / finalize / escalate to higher). Categories are
  constrained to the host-configured ids — the demo ships
  `['maintenance', 'pr', 'training', 'aircraft-movement']` with a new
  Aircraft Movement category.
- **`strictAssetFiltering` prop** on `<WorksCalendar>` (default `false`).
  When `true` and an `assets` registry is provided, AssetsView keeps
  only events whose `resource` matches a registered asset id — drops
  both foreign-id events (e.g. employees in a unified calendar) and
  null/empty-resource events (e.g. team-wide meetings that belong on
  Schedule). This mirrors TimelineView's implicit scoping to the
  `employees` prop, letting host apps feed one unified event list to a
  calendar that shows people on Schedule and aircraft on Assets.
- **Unified demo** — `demo/App.jsx` no longer has a separate
  Engineering/Fleet dataset toggle. Both people (on-call rotations,
  incidents, PTO) and aircraft (charters, maintenance with approval
  workflow) now live in one event array, rendered together via the new
  `strictAssetFiltering` flag.

### Fixed

- **Agenda view multi-day events (#148)** — events that span multiple
  calendar days now render on every day they cover, not just their start
  day. Multi-day timed events show a `MMM d, h:mm a → MMM d, h:mm a` meta
  string; multi-day all-day events show `All day · MMM d → MMM d`.

### Notes

- Test suite expanded by 30+ unit tests covering the new shortcut hook,
  help overlay, owner login modal, ConfigPanel focus trap, and the
  agenda multi-day regression.
