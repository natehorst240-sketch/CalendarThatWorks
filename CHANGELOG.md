# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
