# Requirements engine

The requirements engine is the runtime consumer for the
`CalendarConfig.requirements` templates. Given an event plus the
usual resource / assignment / pool maps, `evaluateRequirements`
returns whether the event is fully staffed and — when it isn't — a
trail of shortfalls naming each unmet slot.

## What a requirement template looks like

```ts
{
  "eventType": "load",
  "requires": [
    { "role": "driver",         "count": 1 },
    { "pool": "nearby_reefers", "count": 1 }
  ]
}
```

A `load` event needs at least one driver and one reefer truck
assigned to it. Slots are independent: a single resource that's
tagged with multiple roles **and** lives in the right pool can
satisfy multiple slots at once, which matches the natural reading
of "this event needs a driver and a truck."

## Evaluating an event

```ts
import { evaluateRequirements } from 'works-calendar';

const result = evaluateRequirements({
  event,                    // Pick<EngineEvent, 'id' | 'category'>
  requirements,             // ConfigRequirement[]
  resources,                // ReadonlyMap<id, EngineResource>
  assignments,              // ReadonlyMap<id, Assignment>
  pools,                    // ReadonlyMap<id, ResourcePool>
  proposedLocation,         // optional; required for within(proposed) pools
});

if (!result.satisfied) {
  for (const m of result.missing) {
    if (m.kind === 'role') {
      console.warn(`Need ${m.missing} more ${m.role}(s) — have ${m.assigned}/${m.required}`);
    } else {
      console.warn(`Need ${m.missing} more from pool "${m.pool}" — have ${m.assigned}/${m.required}`);
    }
  }
}
```

`event.category` is the match key. If no template matches the
category (or the event has none), the result is
`{ satisfied: true, missing: [], noTemplate: true }`. Hosts that
want to *enforce* templating ("every event must declare a type
that's in the catalog") can read `noTemplate` and react.

## Role tagging

Role membership has two layers, in priority order:

**1. Per-assignment `roleId` ("acting as"). Wins when set.**

```ts
const a: Assignment = {
  id: 'a1', eventId: 'e1', resourceId: 'alice', units: 100,
  roleId: 'dispatcher',   // Alice is acting as dispatcher *on this event*
};
```

Lets a person who's statically both driver and dispatcher be
booked as one role on Monday and the other on Tuesday without
re-tagging the underlying resource. When `assignment.roleId` is
set, the engine ignores `meta.roles` for the slot match.

**2. Static `meta.roles` on the resource (fallback).**

```ts
const alice: EngineResource = {
  id: 'alice',
  name: 'Alice Rivera',
  meta: { roles: ['driver', 'dispatcher'] },
};
```

When `assignment.roleId` is unset, the engine counts every
assignment whose resource is tagged with the slot's role. This is
the v1 contract — additive: existing assignments keep working
exactly as before.

## Pool slots

For each pool slot, the engine computes the pool's effective
member set:

| Type     | Effective members                                       |
|----------|---------------------------------------------------------|
| `manual` | `pool.memberIds`                                        |
| `query`  | `evaluateQuery(pool.query, resources, ctx).matched`     |
| `hybrid` | intersection of `pool.memberIds` and the query result   |

…then counts how many assignments to the event reference a
resource in that set. The same memoization table is reused across
slots in the same evaluation, so a requirement that names the
same pool twice ("2 trucks") only runs the query once.

### Distance-based pools

When a pool's `query` uses `from: { kind: 'proposed' }` (the
common shape for "within N miles of the event"), pass the event's
location as `proposedLocation`:

```ts
evaluateRequirements({ event, ..., proposedLocation: event.meta.location });
```

Without it, the `within(proposed)` clause fails-closed for every
resource, and the slot's effective member set will be empty — so
even a perfectly-staffed event will report a shortfall. This is
documented behavior; tests pin it.

## Defensive contract

`evaluateRequirements` never throws.

- Pool slots that reference a pool id not in the `pools` map
  surface as a shortfall with `poolUnknown: true` and `assigned: 0`.
- Query/hybrid pools with no `query` field (which `parseConfig`
  drops at load time, but hosts may still construct directly)
  resolve to zero members rather than crashing.
- Assignments whose `resourceId` isn't in the registry don't
  contribute to any role or pool slot.
- Slots are independent — a single assignment satisfies any slot
  whose criteria it meets, including multiple at once.

## Severity: hard vs soft

Each slot can be marked `severity: 'soft'` to declare a *preference*
rather than a hard requirement. When a soft slot goes unmet, the
shortfall still surfaces in `missing[]` (so hosts can render
"this load doesn't have a co-driver" as a warning), but
`satisfied` stays `true` if every *hard* slot is filled.

```ts
{
  "eventType": "load",
  "requires": [
    { "role": "driver",     "count": 1, "severity": "hard" },  // blocks
    { "role": "note-taker", "count": 1, "severity": "soft" },  // warns only
  ]
}
```

`severity` defaults to `'hard'` when omitted, preserving the v1
contract for existing templates. Engine integration (auto-reject
gating) reads this to decide whether to block.

## Out of scope (future slices)

- **Engine integration** — auto-rejecting submits with unmet hard
  requirements at the operation level. This evaluator is currently
  a standalone read; hosts decide whether to gate.
- **`validateConfig`** — cross-section integrity checks
  (`requirement.role` ∈ `roles[]`, `requirement.pool` ∈ `pools[]`)
  still need to land separately.
