# Sprint plan — issue #596: type the engine-op / event seam end-to-end

Tracking issue: [#596](https://github.com/WorksCalendar/CalendarThatWorks/issues/596) —
remove the remaining `type LooseValue = any` (and the file-level
`eslint-disable @typescript-eslint/no-explicit-any`) from five files that
currently bridge type mismatches across the mutation pipeline:

| File | ~`LooseValue` uses | Nature |
| --- | --- | --- |
| `src/ui/CalendarModals.tsx` | ~56 | one big props interface |
| `src/ui/CalendarViewGrid.tsx` | ~55 | one big props interface |
| `src/hooks/useEventMutations.ts` | ~43 | engine-op + event-shape seam |
| `src/hooks/useScheduleMutations.ts` | ~26 | engine-op + event-shape seam |
| `src/hooks/useScheduleTemplates.ts` | ~24 | engine-op + template seam |

The issue is *not* incrementable file-by-file (tightening one file cascades
through `WorksCalendar.tsx` and the engine adapters), but it **is**
incrementable layer-by-layer: keep `LooseValue` working as an escape hatch and
tighten one seam at a time, each sprint landing `type-check` + `lint` + `test`
green.

## Canonical shapes

- `EngineOperation` — `src/core/engine/schema/operationSchema.ts` (the engine's
  authoritative mutation type)
- `OperationResult` / `EventChange` — `src/core/engine/operations/operationResult.ts`
- `EngineEvent` — `src/core/engine/schema/eventSchema.ts`
- `WorksCalendarEvent` (public, loose) / `NormalizedEvent` (internal, strict) —
  `src/types/events.ts`
- `OwnerConfig`, `EmployeeRecord`, `EmployeeId`, `EmployeeActionInput`,
  `AvailabilitySavePayload` — `src/WorksCalendar.types.ts`

New shared module added in Sprint 1: **`src/types/engineOps.ts`** — re-exports
the engine-op/result/event types and adds:

- `EngineOpInput` — deliberately-loose hook→engine op shape (the hooks build
  op-shaped literals; the engine normalises + validates). One `as` cast at the
  engine-adapter boundary turns it into `EngineOperation`.
- `EngineOpRunner` / `RecurringOpRunner` — the `applyEngineOp` /
  `applyWithRecurringCheck` signatures.
- `GetSavedEventPayload`, `EmitEventSave` — the post-mutation lookup signatures.
- `MutationEventInput` — the "event-ish input" union the mutation hooks accept
  (`NormalizedEvent | WorksCalendarEvent | Partial<WorksCalendarEvent>`).
  *(Defined in Sprint 1, consumed from Sprint 3 on.)*
- `isCreatedChange` / `isUpdatedChange` / `isDeletedChange` — `EventChange`
  discriminant guards (needed because `Array.prototype.find` doesn't narrow a
  union).

## Sprints

### Sprint 1 — canonical types + the engine-op handler seam ✅ (this PR)

- Add `src/types/engineOps.ts`.
- In `useEventMutations.ts`, `useScheduleMutations.ts`, `useScheduleTemplates.ts`:
  retype the handler params (`applyEngineOp`, `applyWithRecurringCheck`,
  `getSavedEventPayload`, `emitEventSave`) to the shared signatures; type the
  `OperationResult` callbacks and `EventChange` handling.
- `LooseValue` stays in those three files for the event/employee/config
  parameters (Sprint 3).

### Sprint 2 — `useCalendarEngine` adoption ✅

- Adopt the canonical types in `useCalendarEngine.ts`: `UseCalendarEngineResult`
  exposes `applyEngineOp: EngineOpRunner`, `applyWithRecurringCheck:
  RecurringOpRunner`, `getSavedEventPayload: GetSavedEventPayload`;
  `opAnnouncement(op: EngineOpInput)`; the impls thread `EngineOpInput` /
  `OperationResult`, with the single `op as unknown as EngineOperation` cast at
  `engine.applyMutation` (the engine-adapter boundary) plus a narrowing cast for
  the legacy event payload. The engine-op seam is now typed end-to-end:
  `useCalendarEngine` → `useCalendarDataPipeline`/`WorksCalendar` →
  `useCalendarMutations` → the three mutation hooks.
- `useCalendarEngine.ts` still uses its private `AnyValue = any` for the event
  *list* surface (`allNormalized`, `expandedEvents`, `approvalRequestEvents`,
  `PendingAlert.violations`, …) — not `LooseValue`, not in #596's literal scope;
  it gets cleaned up alongside the views (Sprints 4–5).

### Sprint 3a — `useScheduleTemplates.ts` ✅

- Type the template surface: `scheduleTemplates: readonly ScheduleTemplateV1[]`,
  `engine: { state: { events: ReadonlyMap<string, EngineEvent> } }`, `role:
  CalendarRole`, the request/result via `ScheduleInstantiationRequestV1` /
  `ScheduleInstantiationResultV1` / `CalendarEventV1`; new exported
  `SchedulePreviewResult` / `SchedulePreviewConflict`. One boundary cast in
  `useCalendarMutations` (`scheduleTemplates as ScheduleTemplateV1[]` — host-supplied
  blobs, shape-validated downstream) and one in the adapter-reload path. **`LooseValue`
  + the `eslint-disable` removed from `useScheduleTemplates.ts`.**

### Sprint 3b — `useEventMutations.ts` + `useScheduleMutations.ts` + tighten `EngineOpInput`

- Replace the remaining `LooseValue` in `useEventMutations.ts` /
  `useScheduleMutations.ts` with `MutationEventInput`, `NormalizedEvent`,
  `EmployeeRecord`, `OwnerConfig`, etc.
- Tighten `EngineOpInput` toward `EngineOperation` (reconcile `resource` vs
  `resourceId` in patches, the extra op sources, `Date | string` starts) — either
  widen the target types or fix the literal. No new `any`.
- Where the public/engine types are genuinely too strict for what callers pass,
  loosen them (`?: T | undefined`) rather than scattering `as`.
- **Remove `type LooseValue = any` + the `eslint-disable` from these two files.**

### Sprint 4 — `CalendarViewGrid.tsx`

- Type the props (`cal`, `ownerCfg`, `perms`, the handler props, the event
  arrays) from `useCalendarSetup` / `useOwnerConfig` / `usePermissions` /
  `FilterField[]` / `NormalizedEvent[]`.
- Fix the `WorksCalendar.tsx` caller cascade.
- **Remove `LooseValue` + the `eslint-disable` from this file.**

### Sprint 5 — `CalendarModals.tsx` + final sweep

- Type the ~46-field `CalendarModalsProps` interface (events, config, the modal
  state shapes, the handler signatures).
- Fix the `WorksCalendar.tsx` caller cascade.
- **Remove `LooseValue` + the `eslint-disable` from this file.**
- Final audit: `git grep "LooseValue"` empty in the five files; no new `any`
  introduced elsewhere; `npm run type-check && npm run lint && npm test && npm run build`
  all green; CHANGELOG entry; close #596.

## Done-when (from the issue)

- No `type LooseValue = any` / `eslint-disable @typescript-eslint/no-explicit-any`
  in the five files.
- `npm run type-check`, `npm run lint`, `npm test`, `npm run build` all pass.
- No new `any` introduced elsewhere.
