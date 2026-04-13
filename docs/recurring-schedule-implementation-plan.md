# Recurring Schedule Templates — Implementation Plan

## Goal
Deliver a complete "Add Schedule" workflow that uses reusable schedule templates to create recurring event series safely and quickly.

## Current status
- Recurrence engine and scope-aware recurring edits already exist.
- Event-level templates exist in `EventForm`.
- API-level schedule template contracts and instantiation utilities exist.
- Missing piece: first-class UI flow in the main calendar for adding schedules from templates.

## Phase 0 — Recurring engine contract baseline (started)
1. Document the engine-level recurring behavior we depend on for Add Schedule flows.
2. Add baseline regression tests for:
   - deterministic occurrence identity,
   - `EXDATE` suppression during expansion,
   - safety caps on occurrence generation.
3. Keep this phase scoped to test/documentation hardening (no product UI changes).

### Definition of done
- A dedicated recurring baseline test file exists and passes in CI.
- Recurring expansion invariants are captured in code comments and test names.
- Follow-on phases can build UI confidently on top of a locked expansion contract.

## Phase 1 — Foundation + MVP creation flow (in progress)
1. Add a dedicated `Add Schedule` dialog in the main toolbar.
2. Accept schedule templates via component props.
3. Allow users to:
   - pick template,
   - pick anchor date/time,
   - override resource/category,
   - instantiate into event masters.
4. Create generated masters via the engine mutation pipeline.
5. Add focused UI tests for dialog behavior.

### Definition of done
- `Add Schedule` button is visible when templates are provided and user can add events.
- Dialog submits valid requests and creates generated recurring masters.
- Core callbacks (`onEventSave`) fire for generated events.
- Tests cover template selection and instantiate callback payload.

### Phase 1 kickoff notes (April 13, 2026)
- Added `WorksCalendar` integration coverage ensuring the `Add Schedule` action only appears when visible schedule templates exist.
- Added a focused flow test that opens the schedule dialog, submits template generation, and verifies `onEventSave` receives generated master payloads.

### Phase 0 kickoff notes (April 13, 2026)
- Added a dedicated recurring expansion baseline test suite at `src/core/engine/__tests__/recurringPhase0Baseline.test.ts`.
- Locked deterministic occurrence ID behavior across repeated expansion calls for the same query window.
- Added explicit regression coverage for `EXDATE` filtering and `maxPerSeries` generation caps.

## Phase 2 — Preview + safety (started)
1. Add pre-submit preview list of generated masters.
2. Highlight obvious conflicts using existing validation pipeline.
3. Add validation for malformed anchors/template payloads and user-facing errors.

### Phase 2 kickoff notes (April 13, 2026)
- Added per-entry conflict details in `ScheduleTemplateDialog` preview rows so users can see validation messages before creation.
- Hardened `instantiateScheduleTemplate` with explicit validation for invalid anchors and malformed schedule template entries.
- Added regression tests for preview conflict rendering and template/anchor validation failures.

## Phase 3 — Template management and backend integration
1. Optional adapter-backed template fetching/creation flows.
2. Owner/admin template CRUD UI.
3. Tenant-level visibility and governance (`private/team/org`).

## Phase 4 — Operational hardening (started)
1. ✅ Analytics hooks (template usage and failures).
2. ✅ Performance guardrails for large generated sets.
3. 🚧 Documentation/examples and migration notes.

### Phase 4 kickoff notes (April 13, 2026)
- Added `onScheduleTemplateAnalytics` callback support in `WorksCalendar` to emit lifecycle events for opening the dialog, preview generation success/failure, and instantiate success/failure.
- Added schedule generation guardrails with default limits (`previewMax=200`, `createMax=200`) and a configurable `scheduleInstantiationLimits` prop.
- Preview now fails fast with a user-visible error when template expansion exceeds the configured preview threshold.
- Added migration guidance for adopters in `docs/schedule-phase4-migration-notes.md`.
