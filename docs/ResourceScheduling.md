# Resource scheduling and asset management

How WorksCalendar models resources, pools, assignments, and the Assets
view — from the host-facing props through to engine resolution and the
localStorage helpers. For the small end-user wiring recipe see
[Resource pools](./ResourcePools.md); this doc covers the whole
subsystem and is written for people who need to extend or debug it.

## Table of contents

1. [Mental model](#mental-model)
2. [Data model](#data-model)
3. [Public API](#public-api)
4. [Assets view](#assets-view)
5. [Booking lifecycle](#booking-lifecycle)
6. [Pool resolution](#pool-resolution)
7. [Conflict evaluation](#conflict-evaluation)
8. [Workload and assignments](#workload-and-assignments)
9. [Persistence](#persistence)
10. [Error codes](#error-codes)
11. [Undo / redo](#undo--redo)
12. [Invariants](#invariants)
13. [File map](#file-map)

## Mental model

A **resource** (also called an asset) is the concrete thing a booking
consumes — a plane tail number, a meeting room, a driver, a hot-desk.
A **pool** is a virtual grouping of resources that represents
"any one of these". A booking can target a specific resource
(`resourceId`) or a pool (`resourcePoolId`); when it targets a pool,
the engine picks a concrete member at submit time using the pool's
strategy.

The Assets view is a Gantt-style month grid where every resource gets
a row and every pool gets a virtual row at the top. Clicking a cell
opens the EventForm pre-seeded with the target resource (or pool).
Saving runs through the engine, which resolves the pool to a member,
validates against conflict rules, and commits atomically.

Assignments are a parallel occupancy model: one event can hold
multiple resources at partial units (e.g. 50% of resource A and 50% of
resource B). The pool resolver reads assignments so pools never hand
out a member that is already held via an assignment.

## Data model

### `ResourcePool`

Defined in `src/core/pools/resourcePoolSchema.ts:18`.

```ts
interface ResourcePool {
  readonly id:         string;
  readonly name:       string;
  readonly memberIds:  readonly string[];      // ordered
  readonly strategy:   'first-available' | 'least-loaded' | 'round-robin';
  readonly rrCursor?:  number;                 // engine-owned
  readonly disabled?:  boolean;
}
```

`memberIds` are ids of `EngineResource` entries. The resolver does
**not** filter candidates against the registry — an unknown id is a
valid candidate and, if no conflict rule rejects it, can be committed
as the resolved `resourceId`. Validate the registry/pool integrity at
your own layer if that matters; see the "Unknown member ids" note
under [Invariants](#invariants).

### `EngineResource`

Defined in `src/core/engine/schema/resourceSchema.ts`.

```ts
interface EngineResource {
  readonly id:              string;
  readonly name:            string;
  readonly color?:          string;
  readonly capacity?:       number | null;         // used by capacity-overflow rule
  readonly timezone?:       string;
  readonly businessHours?:  ResourceBusinessHours;
  readonly availability?:   readonly AvailabilityRule[];
  readonly tenantId?:       string;
  readonly meta?:           Readonly<Record<string, unknown>>;
}
```

### `Assignment`

Defined in `src/core/engine/schema/assignmentSchema.ts:16`.

```ts
interface Assignment {
  readonly id:         string;
  readonly eventId:    string;
  readonly resourceId: string;
  readonly units:      number;                     // 100 = full; >100 = over-allocated (double-booked)
  readonly tenantId?:  string;
}
```

One `eventId` may have several `Assignment` rows across resources.
`units` is an unconstrained number: `100` is fully assigned, `50` is
half-time, and values above `100` (e.g. `200`) explicitly represent
over-allocation / double-booking for workload computation. Helpers:
`assignmentsForEvent`, `resourceIdsForEvent`, and
`workloadForResource`.

### `ResourceCalendar`

Defined in `src/core/engine/schema/resourceCalendarSchema.ts:38`. A
per-resource list of non-working entries (holidays, maintenance). Used
by the `outside-business-hours` and `availability` rules.

### `EngineEvent` pool fields

```ts
resourceId:     string | null;          // concrete; set after pool resolve
resourcePoolId: string | null;          // virtual; cleared after pool resolve
meta:           Readonly<Record<string, unknown>>;  // resolvedFromPoolId, poolEvaluated
```

## Public API

### From `works-calendar`

```ts
import {
  loadPools,
  savePools,
  clearPools,
  poolStorageKey,
  type ResourcePool,
} from 'works-calendar';
```

### WorksCalendar props

```ts
pools?:         ResourcePool[];
onPoolsChange?: (pools: ResourcePool[]) => void;
```

Controlled pattern: the host passes `pools`, listens to
`onPoolsChange`, and echoes the new list back in on the next render.
The calendar does **not** manage its own pool state.

### CalendarEngine methods

```ts
getPool(id: string):                 ResourcePool | null;
setPools(pools: readonly ResourcePool[]): void;  // atomic replace
upsertPool(pool: ResourcePool):      void;
removePool(id: string):              void;
```

Each mutation swaps the pools map by reference and fires one
subscriber notification.

### AssetsView props

```ts
pools?:            readonly ResourcePool[] | undefined;
onPoolDateSelect?: ((start: Date, end: Date, poolId: string) => void) | undefined;
```

## Assets view

`src/views/AssetsView.tsx`.

* Every `EngineResource` renders as a row with month columns.
* Every non-disabled pool renders as a virtual `PoolRow` **above** the
  asset rows (`src/views/AssetsView.tsx:645`). The row's events are the
  union of bookings on any member — an aggregate, not the pool itself.
* The row label prefixes `Pool: <name>` and the header carries a
  `POOL` chip plus a tooltip listing member labels
  (`src/views/AssetsView.tsx:1086`).
* Clicking a pool cell fires `onPoolDateSelect(start, end, poolId)`
  regardless of whether the cell looks "busy" — the resolver will try
  to find a free member. Clicking a non-pool cell uses the normal
  `onDateSelect`.
* Disabled pools are filtered out of the row list
  (`src/views/AssetsView.tsx:652`) so the user cannot start a draft
  that the resolver would reject.
* Event pills whose `meta.resolvedFromPoolId` is set get an extra line
  in the hover title showing which pool they came from
  (`src/views/AssetsView.tsx:1239`).

## Booking lifecycle

Pool → concrete member, end to end:

```
User clicks a pool cell on AssetsView
  → onPoolDateSelect(start, end, poolId)
  → WorksCalendar.handlePoolDateSelect (WorksCalendar.tsx:2019)
  → setFormEvent({ start, end, resourcePoolId: poolId })
  → EventForm opens (resourcePoolId is not surfaced in the UI)
  → user types title, clicks Save
  → onSave payload includes { ..., resourcePoolId }
  → WorksCalendar builds a `create` op (WorksCalendar.tsx:1559)
  → engine.applyMutation(op)
    → resolvePoolForOp(op, ctx)            // rewrite or reject
    → applyMutationOp(effectiveOp, ...)     // normal validation
    → commit { events, pools } atomically
    → _notify()
    → _emitBookingLifecycle(...)
  → onEventSave fires with resolved { resource, meta.resolvedFromPoolId }
  → engineVer bumps; the `pools` effect fires onPoolsChange with the
    rotated cursor (WorksCalendar.tsx:896)
```

The host's `onPoolsChange` callback is the only place the round-robin
cursor is exposed. Persisting it (e.g. via `savePools`) is what makes
the rotation survive a reload.

## Pool resolution

`src/core/pools/resolvePool.ts` implements the strategy. It is a pure
function: no mutation, deterministic for a given input.

### Strategies

| Strategy          | Candidate order                                                                              |
|-------------------|----------------------------------------------------------------------------------------------|
| `first-available` | Declaration order.                                                                           |
| `least-loaded`    | Sort ascending by `workloadFor(member, window)` with declaration-order tiebreak.             |
| `round-robin`     | `memberIds[(rrCursor + 1) % length]` onwards, wrapping. Cursor is the index of the pick.     |

Every strategy loops candidates and calls `hasHardConflict` (which
wraps `evaluateConflicts`). Members in hard conflict are skipped.
Soft conflicts (min-rest warnings, holds) do **not** disqualify.

### Submit-time wrapper

`src/core/engine/resolvePoolOnSubmit.ts` is the engine-side wrapper.
It:

1. Passes through any op whose `type` is not `'create'`
   (`resolvePoolOnSubmit.ts:68`). `update` / `group-change` ops that
   carry a `resourcePoolId` are **not** resolved today — see
   [#386](https://github.com/WorksCalendar/CalendarThatWorks/issues/386).
2. Passes through `create` ops with no `resourcePoolId`, or with an
   explicit `resourceId` already set (concrete wins).
3. Looks up the pool; rejects with `POOL_UNKNOWN` if unknown.
4. Builds the `ConflictEvent[]` for comparison — **assignment-aware**:
   an event with `resourceId: null` that holds resources via
   `Assignment` rows is expanded to one conflict entry per held
   resource (`resolvePoolOnSubmit.ts:93`), so the resolver cannot hand
   out a member that an assignment is already occupying.
5. Always includes a hard `resource-overlap` rule
   (`__pool-overlap`, `resolvePoolOnSubmit.ts:35`) plus any host-
   supplied rules.
6. On success, rewrites the op: `resourceId` set, `resourcePoolId`
   cleared, `meta.resolvedFromPoolId` and `meta.poolEvaluated` added.
7. On round-robin success, returns a `poolUpdate` with the new cursor
   so the engine can persist it atomically with the event commit.

## Conflict evaluation

`src/core/conflictEngine.ts` exposes `evaluateConflicts`. The pool
resolver uses this to decide whether a candidate member is usable —
the same machinery used by the main validator downstream. Rules
considered for pool resolution:

* `resource-overlap` — always hard, always applied.
* Any additional rules passed in `PoolResolveContext.rules` (min-rest,
  category-mutex, capacity-overflow, availability, policy, hold).

Only `hard` violations disqualify a candidate.

## Workload and assignments

### `workloadFor(resourceId, windowStart, windowEnd, events, assignments?)`

`src/core/pools/resolvePool.ts:98`. Window-scoped: only events
overlapping `[windowStart, windowEnd)` count.

* With `assignments`: sum of `units` for the resource on each
  overlapping event (fallback 100 if no assignment row exists for the
  event).
* Without: each overlapping event counts as 100.

### `CalendarEngine.workloadForResource(resourceId)`

`src/core/engine/CalendarEngine.ts:362`. Global (not window-scoped),
backed by an index (`_assignmentsByResource`) for O(k) reads. Use this
for dashboards and summary widgets; use the resolver's `workloadFor`
for pool decisions.

## Persistence

`src/core/pools/poolStore.ts`. A small localStorage adapter that
round-trips pools under `wc-pools-<calendarId>`.

```ts
savePools(calendarId, pools);                // Map or array
const restored: ResourcePool[] = loadPools(calendarId);
clearPools(calendarId);
const key = poolStorageKey(calendarId);
```

Defensive by design: every path catches and swallows storage errors
(quota, private mode, malformed JSON) and falls back to an empty list,
so a broken storage layer never prevents the calendar from mounting.
`loadPools` validates each entry (`coerce`, `poolStore.ts:71`) and
drops malformed ones silently.

Keys are scoped per `calendarId` so multi-calendar origins do not
collide.

## Error codes

All pool-related rejections carry `rule: 'pool-unresolvable'`, hard
severity, and a `details.code`:

| Code                   | Thrown from                                    | Meaning                                              |
|------------------------|------------------------------------------------|------------------------------------------------------|
| `POOL_UNKNOWN`         | `resolvePoolOnSubmit.ts:81`                    | Op references a pool id the engine doesn't know.     |
| `POOL_DISABLED`        | `resolvePool.ts:131`                           | Pool has `disabled: true`.                           |
| `POOL_EMPTY`           | `resolvePool.ts:135`                           | Pool has zero `memberIds`.                           |
| `NO_AVAILABLE_MEMBER`  | `resolvePool.ts:189`                           | Every member has a hard conflict in the window.      |

All four are returned as `{ status: 'rejected', validation: { allowed: false, severity: 'hard', violations: [...] }, changes: [] }`. Nothing
commits.

## Undo / redo

Pool state participates in snapshots so round-robin cursors rewind
correctly on undo.

* `CalendarEngine.snapshot()` captures `events` and `pools`
  (`CalendarEngine.ts:488`).
* `CalendarEngine.rollbackTo()` restores both maps and fires one
  notification (`CalendarEngine.ts:494`).
* `CalendarEngine.restoreState({ pools? })` allows external replay
  (`CalendarEngine.ts:513`).

A rolled-back pool emits `onPoolsChange` again with the restored
cursor, so the host's persisted copy stays in sync.

## Invariants

These are enforced by the resolver and the engine commit path:

* **Atomic commit**: event and pool-cursor updates land in a single
  state swap with one `_notify`. No partial writes.
* **Cursor advance only on success**: a failed resolve never rotates
  the cursor.
* **Round-robin cursor is bounded**: reads wrap with
  `((rrCursor ?? -1) + 1) % memberIds.length`, so a stale cursor from
  a shrunken pool still picks a valid starting index.
* **Concrete wins**: an op with both `resourceId` and `resourcePoolId`
  keeps the explicit resource and does not consult the pool.
* **Unknown member ids are not filtered**: the resolver iterates
  `pool.memberIds` as-is and never cross-references the `EngineResource`
  registry. An id that does not correspond to a known resource is a
  valid candidate and, if no hard rule rejects it, will be committed
  as the resolved `resourceId`. Host-side integrity checking is the
  caller's job.
* **Disabled pools never drive a draft**: filtered out of the Assets
  view and rejected on submit.
* **Assignment-aware occupancy**: the resolver sees assignment-held
  resources, so it will not hand out a member occupied via an
  assignment.

## File map

| Path                                                          | Role                                                      |
|---------------------------------------------------------------|-----------------------------------------------------------|
| `src/core/pools/resourcePoolSchema.ts`                        | `ResourcePool` and `PoolStrategy` types.                  |
| `src/core/pools/resolvePool.ts`                               | Pure strategy resolver. Returns success or error.         |
| `src/core/pools/poolStore.ts`                                 | `localStorage` persistence helpers.                       |
| `src/core/pools/__tests__/resolvePool.test.ts`                | Strategy, tiebreak, exhaustion, cursor advance.           |
| `src/core/pools/__tests__/poolStore.test.ts`                  | Round-trip, malformed data, multi-calendar keys.          |
| `src/core/engine/resolvePoolOnSubmit.ts`                      | Engine-side wrapper: op rewrite, cursor advance, reject.  |
| `src/core/engine/CalendarEngine.ts`                           | Pool CRUD, atomic commit, snapshot/restore.               |
| `src/core/engine/schema/resourceSchema.ts`                    | `EngineResource`.                                         |
| `src/core/engine/schema/assignmentSchema.ts`                  | `Assignment`, `workloadForResource`, lookup helpers.      |
| `src/core/engine/schema/resourceCalendarSchema.ts`            | `ResourceCalendar`, non-working windows.                  |
| `src/core/engine/__tests__/poolsCrud.test.ts`                 | Pool CRUD behavior on the engine.                         |
| `src/core/engine/__tests__/resolvePoolOnSubmit.test.ts`       | Submit-time rewrite, cursor rewind on undo.               |
| `src/core/conflictEngine.ts`                                  | Rule-based conflict evaluation used by the resolver.      |
| `src/views/AssetsView.tsx`                                    | Gantt view; pool rows, tooltips, click routing.           |
| `src/views/__tests__/AssetsView.pools.test.tsx`               | Pool row rendering and click behavior.                    |
| `src/WorksCalendar.tsx`                                       | Host-facing `pools` / `onPoolsChange`; form seeding.      |
| `src/__tests__/WorksCalendar.poolBooking.integration.test.tsx`| End-to-end click → save → resolved `onEventSave`.         |
| `src/index.ts`                                                | Public exports (`loadPools`, `savePools`, `ResourcePool`).|
| `docs/ResourcePools.md`                                       | End-user wiring recipe.                                   |
