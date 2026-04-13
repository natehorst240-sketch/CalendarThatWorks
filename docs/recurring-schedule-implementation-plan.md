# Recurring Schedule Templates — Implementation Plan

## Goal
Deliver a complete "Add Schedule" workflow that uses reusable schedule templates to create recurring event series safely and quickly.

## Current status
- Recurrence engine and scope-aware recurring edits already exist.
- Event-level templates exist in `EventForm`.
- API-level schedule template contracts and instantiation utilities exist.
- Missing piece: first-class UI flow in the main calendar for adding schedules from templates.

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

## Phase 2 — Preview + safety
1. Add pre-submit preview list of generated masters.
2. Highlight obvious conflicts using existing validation pipeline.
3. Add validation for malformed anchors/template payloads and user-facing errors.

## Phase 3 — Template management and backend integration
1. Optional adapter-backed template fetching/creation flows.
2. Owner/admin template CRUD UI.
3. Tenant-level visibility and governance (`private/team/org`).

## Phase 4 — Operational hardening
1. Analytics hooks (template usage and failures).
2. Performance guardrails for large generated sets.
3. Documentation/examples and migration notes.
