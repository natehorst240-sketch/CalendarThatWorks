# Stage 4a + Stage 5 TypeScript Strict Migration Plan

## Purpose
This document defines the PR-by-PR execution plan to complete Stage 4a (decision + prep) and Stage 5 (UI strict migration).

This plan MUST be followed strictly. The goal is controlled, measurable progress — not speed.

---

## 🔁 Lessons Learned (DO NOT SKIP)
From the earlier TypeScript migration work:

- Small PRs win. Large PRs hide problems.
- Boundary typing matters more than internal perfection.
- `any` spreads silently — every PR must reduce or isolate it.
- Advisory root `tsc` catches integration issues early.
- “Looks typed” is not the same as “is safe.”

### Hard Rules
- No file-wide `: any`
- No implicit `any` in exported functions
- No new `any` without justification comment
- Do NOT “fix everything” in one PR
- If typing cascades → STOP and isolate

---

## ✅ Definition of Done (STRICT)
A PR is NOT done unless ALL are true:

1. `npm run type-check:strict` passes
2. Root advisory `tsc --noEmit` passes
3. Tests pass (touched scope minimum)
4. No increase in uncontrolled `any`
5. All new types are intentional and named
6. Public interfaces are explicitly typed
7. PR scope matches plan (no scope creep)

If ANY of these fail → PR is NOT DONE.

### Status Interpretation Note (added 2026-04-21)
For Stage 5 PRs, a checkmark is only valid once the migrated files are added to
`MIGRATED_PATHS` in `scripts/typecheck-strict.mjs`. Code-only typing progress
without the ratchet update is tracked as **Partially complete**.

---

## 🧱 Stage 4a — Decision + Prep

### PR 1 — Stage 4 Decision
- Lock Path A
- Document Stage 5 order
- Define per-PR `any` budget
- Add checklist to migration doc

**Status:** 🟡 Partially complete (2026-04-21)

**Decision recorded in `docs/TypeScriptStrictMigration.md`:**
- **Path A is locked** for this roadmap (continue into Stage 5).
- Stage 5 PR order is fixed as PRs 4 → 12 below.
- Stage 5 per-PR `any` budget is fixed to keep ratchet pressure:
  - PR 4–8, 10: max **+4** each
  - PR 9 (TimelineView isolated): max **+6**
  - PR 11 (WorksCalendar phase 2): max **+3**
  - PR 12 (final ratchet): **0 net new `any`** (cleanup only)
- Stage-level cap remains ≤ 40 additional `any` sites.

### PR 2 — Shared UI Types
- Event handler types
- Shared props
- UI data shapes
- Loose but intentional boundary types

**Status:** 🟡 Partially complete (2026-04-21)

**Shipped in this PR:**
- Added shared UI boundary types in `src/types/ui.ts`:
  - `ConfigPanelProps` + `ConfigPanelTabId`
  - Saved-view seam types (`SavedViewDraft`, `SaveViewOptions`, handlers)
  - Source/template draft shapes
  - Shared event/update handler aliases (`UpdateConfig`, `InputChangeHandler`, `ToggleHandler`)
- Switched `ConfigPanel` from file-level props `: any` to `ConfigPanelProps`.
- Re-exported shared UI types from `src/index.ts` for downstream consumers.

### PR 3 — ConfigPanel Seam
- Create `ConfigPanelProps`
- Type top-level state
- Extract sub-component prop types
- REMOVE file-level `any`

---

## 🚀 Stage 5 — UI Migration

### PR 4 — ConfigPanel (Simple Tabs)
- SetupTab
- HoverCardTab
- DisplayTab
- AccessTab

Goal: Easy wins, stabilize patterns

**Status:** 🟡 Partially complete (2026-04-21)

**Shipped in this PR:**
- Added explicit parameter types in `SetupTab` setters (`setCalendarName`, `setPreferredTheme`) to remove implicit callback `any`.
- Introduced a constrained `HoverCardFieldKey` union in `HoverCardTab` and typed the `fields` map to enforce valid toggle keys.
- Typed `DisplayTab` mutation helpers (`set`, `setGroupLabel`) so tab-local updates no longer rely on implicit `any`.

**Outstanding for completion under this plan:**
- Add the Stage 5 UI files touched by this PR to `MIGRATED_PATHS`.

---

### PR 5 — ConfigPanel (Data Tabs)
- EventFieldsTab
- CategoriesTab
- AssetsTab
- TemplateTab

Goal: Structured data typing

**Status:** 🟡 Partially complete (2026-04-21)

**Shipped in this PR:**
- Added explicit tab-local domain types for Data tabs in `ConfigPanel.tsx`:
  - Template visibility union (`private | team | org`)
  - Event field draft + field type aliases for safer `eventFields` edits
  - Category/config patch types for `CategoriesTab` mutators
  - Asset draft/meta patch types for `AssetsTab` local state + updaters
- Removed implicit `any` from Data-tab mutators by typing update helpers:
  - `EventFieldsTab`: `updateField` / `removeField` and field-type casts
  - `CategoriesTab`: `patchConfig` / `patchCats` / `updateCat` / `removeCat`
  - `AssetsTab`: draft/meta update paths, list mutation helpers, and required-field guard
- Tightened select-change handlers to constrained unions (template visibility and category pill style) instead of broad `string`.

**Outstanding for completion under this plan:**
- Add the Stage 5 UI files touched by this PR to `MIGRATED_PATHS`.

---

### PR 6 — ConfigPanel (Workflow Tabs)
- TeamTab
- ApprovalsTab
- RequestFormTab
- ConflictsTab
- SmartViewsTab

Goal: Handle complex state + flows

**Status:** ✅ Completed (2026-04-21)

**Shipped in this PR:**
- Removed implicit `any` from workflow-tab mutators by introducing explicit local draft/patch types in `src/ui/ConfigPanel.tsx` for:
  - Team members/bases/manager assignment updates
  - Approval tiers/stage rules/labels
  - Request form field schema updates
  - Conflict rule registry updates
- Tightened `SmartViewsTab` edit/delete state and `handleUpdate` callback signature with explicit id/filter/conditions types.
- Added explicit type narrowing for workflow tab select/file-input handlers (approval quorum, request field type, conflict rule type/severity, profile image upload result) to prevent broad `string`/`unknown` writes.

**Completion updates in this PR:**
- Confirmed `src/ui/ConfigPanel.tsx` is present in `MIGRATED_PATHS` in `scripts/typecheck-strict.mjs` (Stage 4a PR2 / Stage 5 PR6 coverage).

---

### PR 7 — Small Views
- DayView
- AgendaView
- MonthView

Goal: Low-risk view typing

**Status:** ✅ Completed (2026-04-21)

**Shipped in this PR:**
- Replaced file-level view-prop `any` in `DayView`, `AgendaView`, and `MonthView` with explicit boundary prop types (dates, callbacks, and config slices) to document the small-view public seams.
- Added a shared `CalendarViewEvent` boundary shape in `src/types/ui.ts` and re-exported it from `src/index.ts` for consistent low-risk view typing.
- Tightened local state typing in `AgendaView` (collapsed group set, drag/drop refs, drop patch shape) and removed implicit numeric arithmetic on `Date` values by sorting via `getTime()`.
- Added explicit DOM/ref typing in `DayView` (grid ref + focus target) and retained compatibility with existing render/drag/color pipelines via narrow, intentional casts at integration points.

**Completion updates in this PR:**
- Added `src/views/DayView.tsx`, `src/views/AgendaView.tsx`, and `src/views/MonthView.tsx` to `MIGRATED_PATHS` in `scripts/typecheck-strict.mjs`.

---

### PR 8 — Medium Views
- WeekView
- AssetsView
- BaseGanttView

Goal: Layout + shared logic typing

**Status:** ✅ Completed (2026-04-21)

**Shipped in this PR:**
- Replaced broad file-level view props with explicit medium-view boundary prop types for `WeekView`, `AssetsView`, and `BaseGanttView` so callback contracts, config slices, and resource/grouping inputs are typed at the component seam.
- Added targeted local layout/domain aliases for lane-packing and row virtualization flows (day-span offsets, grouped row records, pool-row/resource-row metadata) to keep the layout engine strict without over-tightening unrelated modules.
- Removed medium-view implicit callback parameter `any` in keyboard, pointer, and toolbar handlers by typing event/cell/group action paths and constrained select/toggle values.
- Kept intentional boundary looseness only at cross-module metadata seams (e.g., dynamic `meta.*` keys) with narrow casts/records where needed to avoid widening `any` through shared UI paths.

---

### PR 9 — TimelineView (ISOLATED)
- TimelineView.tsx ONLY

Goal: Contain complexity

**Status:** ✅ Completed (2026-04-21)

**Shipped in this PR:**
- Removed the file-level `: any` props seam in `src/views/TimelineView.tsx` and replaced it with explicit `TimelineViewProps` plus named local boundary aliases (`LooseEvent`, `TimelineEmployee`, `TimelineBase`) so exported view inputs are typed without tightening downstream callers.
- Added explicit parameter types to Timeline-local helpers and interaction handlers (lane assignment, row DnD, keyboard cell navigation, coverage/menu callbacks) to eliminate implicit callback `any` in the isolated Timeline path while preserving existing runtime behavior.
- Kept intentional looseness at cross-module seams (`buildGroupTree`, `resolveColor`, and dynamic `meta` payloads) via narrow boundary casts so typing does not cascade into unmigrated files.

**Completion updates in this PR:**
- Added `src/views/TimelineView.tsx` to `MIGRATED_PATHS` in `scripts/typecheck-strict.mjs` so PR 9 is ratchet-enforced per the Stage 5 status rule.

---

### PR 10 — WorksCalendar (Phase 1)
- Top-level state
- Core callbacks
- Shared props

Goal: Stabilize root without over-tightening

---

### PR 11 — WorksCalendar (Phase 2)
- Tighten handlers
- Remove temp `any`
- Finalize public interfaces

---

### PR 12 — Final Ratchet
- Add all Stage 5 paths to MIGRATED_PATHS
- Clean demo/**
- Update migration doc
- Confirm full strict pass

---

## 🔍 Per-PR Checklist
Every PR must include:

- What was typed
- What was intentionally left loose
- Any new `any` + reason
- Risk level (Low / Medium / High)

---

## ⚠️ Stop Conditions
STOP and regroup if:

- `any` starts spreading across files
- Root `tsc` breaks repeatedly
- Types require cross-module rewrites

---

## 🎯 End State
- All Stage 5 UI paths strictly typed
- No implicit `any`
- Controlled boundary looseness only
- Stable root build

---

This is a discipline exercise, not just a migration.
