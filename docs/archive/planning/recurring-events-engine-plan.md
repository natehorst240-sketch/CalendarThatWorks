> **Status: HISTORICAL** — Recurring events engine shipped. Do not treat as active work.

# Recurring Events Engine + Template-Based Event/Schedule Creation Plan

This project already has a strong recurrence foundation in the engine layer (`expandOccurrences`, `splitSeries`, `detachOccurrence`, and recurring edit scope resolution). This plan describes what it would take to:

1. Formalize a robust recurring-events engine contract, and
2. Add **template-driven create flows** for both single events and recurring schedules.

## 1) Product outcomes

Users should be able to:

- Create recurring events quickly from reusable templates (e.g., “Daily standup”, “Mon/Wed/Fri class”).
- Create recurring schedules (sets of recurring events) from templates (e.g., “Clinic schedule”, “Team on-call rotation”).
- Choose edit scope when modifying generated recurring items:
  - This event only
  - This and following
  - Entire series
- Save personal/org templates and re-use them in Add Event / Add Schedule flows.

## 2) Domain model to support templates

Current event model already supports:

- `rrule`
- `exdates`
- `seriesId`
- detached occurrence metadata

Add template entities:

### 2.1 `EventTemplate`

- `id`
- `name`
- `description`
- `defaults`:
  - `title`
  - `durationMinutes`
  - `allDay`
  - `location`
  - `owner`
  - optional `rrulePreset` (or rule builder config)
  - optional default reminders / tags / color
- `visibility`: `private | team | org`
- `createdBy`, `updatedAt`

### 2.2 `ScheduleTemplate`

A schedule template is a collection of event template entries with offsets.

- `id`, `name`, `description`, `timezone`
- `entries[]` where each entry has:
  - `title`
  - `startOffset` or concrete local time (for weekly patterns)
  - `durationMinutes`
  - `rrule` (or builder config)
  - optional location/owner/metadata
- optional constraints:
  - active date window
  - blackout dates

## 3) Recurrence engine hardening checklist

The codebase already includes recurrence expansion and edit-scope operations. To productionize at scale, verify the following:

- **Timezone safety**: guarantee expansion is local-time aware and DST-safe for all supported zones.
- **Cap controls**: keep occurrence expansion safety caps (already configurable) and expose guardrail errors in UI.
- **Deterministic IDs**: preserve stable `occurrenceId` derivation for diffing and UI virtualization.
- **Series mutation semantics**:
  - single edit => exdate + detached event
  - future edit => split series
  - all edit => update master
- **Validation rules**:
  - `COUNT` and `UNTIL` mutual behavior
  - illegal BY* combinations
  - start/end consistency
- **Performance**:
  - lazy expansion by visible range
  - memoized selectors per view range

## 4) Template application workflow

### 4.1 Add Event with template

1. User clicks **Add Event**.
2. UI offers **Start from Template**.
3. User picks template.
4. Form pre-populates fields + recurrence preset.
5. User can tweak date/time/rule and save.
6. Save writes one master event (`rrule` present if recurring).

### 4.2 Add Schedule with template

1. User clicks **Add Schedule**.
2. Picks a schedule template.
3. Chooses anchor date/timezone and optional owner/resource.
4. System instantiates N master events from template entries.
5. Optionally links them with `scheduleInstanceId` for grouped operations.

## 5) UI/UX changes needed

- Add template picker to `EventForm` (quick search + “blank” option).
- Add recurrence preset chips:
  - Daily
  - Weekdays
  - Weekly on selected day(s)
  - Monthly (nth weekday / date)
  - Custom
- For Add Schedule, provide wizard steps:
  - select template
  - review generated events
  - conflict check
  - create
- Reuse recurring scope dialog for edits after generation.

## 6) API / persistence additions

Add endpoints (or equivalent data layer methods):

- `GET /templates/events`
- `POST /templates/events`
- `GET /templates/schedules`
- `POST /templates/schedules`
- `POST /schedules/instantiate` (input: templateId + anchor + overrides)

Recommended storage strategy:

- Keep canonical recurrence as RRULE + EXDATE for interoperability.
- Store template “builder config” only for UX editing convenience.
- Derive RRULE from builder config on save; store both if needed.

## 7) Suggested implementation sequence (low risk)

1. **Template schema + store layer**
2. **Event template picker in Add Event**
3. **RRULE preset builder in form**
4. **Schedule template creation + instantiate API**
5. **Add Schedule wizard + preview**
6. **Conflict detection + bulk confirmation UX**
7. **Telemetry + usage analytics**

## 8) Acceptance criteria

- User creates recurring event from template in < 20 seconds.
- User creates recurring schedule template that generates >= 3 series at once.
- Recurring edit scope works on generated series with no data corruption.
- DST boundary tests pass for template-generated recurring events.
- Expansion remains performant for large schedule windows.

## 9) Risks and mitigations

- **RRULE complexity in UI** → hide complexity behind presets + advanced mode.
- **DST edge-case bugs** → use fixture-driven tests around transitions.
- **Template drift** (template edited after instances created) → copy-on-instantiate; keep instances immutable from template unless explicit sync action.
- **Large instantiations** → server-side batching + async job mode for very large sets.

## 10) What it would take (effort estimate)

For one experienced full-stack engineer familiar with this codebase:

- MVP (event templates + recurring presets): ~1–2 weeks
- Schedule templates + instantiation wizard: +1–2 weeks
- Hardening, performance tuning, analytics, rollout: +1 week

Total: approximately **3–5 weeks** for production-ready delivery, depending on QA depth and backend integration constraints.
