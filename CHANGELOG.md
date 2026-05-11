# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Fluid pill drag-and-drop** (`MonthView`): replaced the static ghost-pill
  hover interaction with [fluid-dnd](https://github.com/carlosjorger/fluid-dnd)
  for animated lift-follow-cursor-drop behaviour. Each day cell is now a
  `DayCellPillList` component that runs an independent `useDragAndDrop` instance
  inside the shared `wc-month-pills` droppable group, enabling smooth cross-day
  moves. Multi-day span bars keep the existing pointer-event drag system.
  New CSS classes `wc-pill-is-dragging` and `wc-pill-drop-target` control the
  in-flight and drop-zone visual states.

- **`FirebaseAdapter`** (`api/v1/adapters`): Firestore real-time backend adapter.
  Supports both the Firebase JS SDK v8 namespaced API and the v9 modular API
  (pass `adapterFns`). Field mapping via `fromDoc`/`toDoc`, extra `where`
  constraints via `extraWhere`, and live updates via `onSnapshot`.

- **`PocketBaseAdapter`** (`api/v1/adapters`): PocketBase SSE real-time adapter.
  Accepts any PocketBase JS client instance. Supports custom field mapping via
  `fromRecord`/`toRecord`, composite filter strings via `extraFilter`, and live
  updates via PocketBase's `subscribe` API.

- **`createNextHandler`** (`api/v1/server`): Next.js App Router route handler
  factory. Wire up four async functions (`loadRange`, `createEvent`,
  `updateEvent`, `deleteEvent`) and receive `{ GET, POST, PATCH, DELETE }`
  exports ready for `route.ts`. Compatible with Prisma, Drizzle ORM, raw `pg`,
  or any server-side data layer. Pairs directly with `RestAdapter` on the
  client. Optional `auth` hook for request-level authentication.

- **Demo dev server**: `npm run dev` (root) starts a Vite dev server at
  `localhost:5173` rendering `WorksCalendar` with `canDrag: true` and seeded
  May 2026 events so fluid pill drag can be tested interactively.

- **GitHub Pages demo**: pushing to `claude/fluid-pill-drag-drop-bcoUE` triggers
  a GitHub Actions workflow that builds the demo and deploys to GitHub Pages.

### Changed

- `package.json` exports: added `./api/v1/server` entry point for
  `createNextHandler` and server-side utilities.

- **Owner access is now role-based** (`role` prop). `useOwnerConfig` derives
  `isOwner` from `role === 'admin'` (or `devMode`) instead of a SHA-256
  password comparison. Editing config, the setup wizard, and edit mode are
  gated on the host-supplied `role` — `WorksCalendar` is a presentation layer
  and trusts the host's auth. A browser-only password check was obfuscation,
  not security.

### Removed

- **`ownerPassword` prop** and the in-app owner login modal (`OwnerLock` /
  `OwnerLoginModal`). Pass `role="admin"` from your auth layer instead.
  `useOwnerConfig` no longer returns `authenticate`, `authError`, or
  `isAuthLoading`.
- **`config.access.viewerPassword`** and the ConfigPanel **Access** tab — the
  field was never enforced and a client-side viewer password is the same
  security theater. `ConfigPanelTabId` no longer includes `'access'`.



### Sprint 1 — Engine internals & strict typing (issues #2, #5)

- **#5 Dependency index**: Added `_dependenciesByFromEvent` / `_dependenciesByToEvent`
  lookup indexes to `CalendarEngine`, matching the existing assignment index pattern.
  `getSuccessorsOf` and `getPredecessorsOf` are now O(k) instead of O(n).
- **#2 CalendarContext typing**: Replaced `[key: string]: any` in `CalendarContextValue`
  with named, typed fields (`renderEvent`, `renderHoverCard`, `colorRules`, `businessHours`,
  `emptyState`, `permissions`, `editMode`, `conflictingEventIds`). Moved `PermissionCaps`
  to `types/ui.ts` so both `usePermissions` and `CalendarContext` share the definition.
  All eight view files updated from unsafe string-bracket access to typed dot-notation.

### Sprint 2 — Engine layer extraction (issue #6)

- **#6 Engine hook**: Extracted `useCalendarEngine` from `WorksCalendar.tsx`.
  The hook owns the `CalendarEngine` singleton, `UndoRedoManager`, engineVer subscription,
  pool sync, allNormalized→engine event sync, `expandedEvents`, `approvalRequestEvents`,
  `applyEngineOp`, `applyWithRecurringCheck`, and `getSavedEventPayload`.
  `pendingAlert` (soft/hard violation dialog) and `recurringPrompt` state are now
  managed inside the hook and surfaced to `WorksCalendar` as return values.
  `WorksCalendar.tsx` retains UI state, navigation/filter via `useCalendar`, and
  domain-specific mutation handlers (shift status, coverage, availability, schedule,
  inline edit) which depend on UI state setters.

### Sprint 3 — Engine as single state source (issues #1, #3, #4)

- **#3 Engine migration**: `CalendarEngine` is now the sole source of truth for
  `view` and `cursor`. `useCalendar` hook removed from `WorksCalendar.tsx` and
  de-exported from the public API; view/cursor state is now owned inline with sync
  effects that keep `engine.state.view` and `engine.state.cursor` accurate after
  every navigation dispatch. Extended filter state (`dayWindow`, schema-driven
  fields, source toggles) remains in React state and is not modelled by the engine.
  `CalendarView` engine type widened to include all 10 view ids; `navigateNext` /
  `navigatePrev` fixed to use a monthly step for all non-week/day views.
- **#1 Duplicate recurrence removal**: `useOccurrences` hook de-exported from the
  public API. All views use the engine's `getOccurrencesInRange` read path via
  `useCalendarEngine`; the legacy `useOccurrences` hook is no longer part of the
  published surface.
- **#4 Export wrapper consolidated**: `exportToExcelLazy.ts` deleted. `index.ts`
  now exports `exportToExcel` directly from `excelExport.ts`, which already handles
  lazy ExcelJS loading internally via `await import('exceljs')`. The extra indirection
  file had no remaining justification.

## [0.6.2] - 2026-05-03

### Fixed

- Restored WeekView tap-vs-drag behavior so single-day pills and multi-day span events open correctly when tapped while still supporting drag-to-move.
- Restored the demo walkthrough’s Mission Alpha flow to use the real move/edit/save/conflict path.
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
