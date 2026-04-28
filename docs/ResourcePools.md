# Resource pools

A `ResourcePool` lets bookings target **"any available member"** instead
of a specific asset or employee. When an event carries a
`resourcePoolId`, the engine resolves it to a concrete `resource` at
submit time using a configurable strategy.

Use pools when the customer doesn't care who runs the job — just that
it gets run:

- "Any West-region aircraft" for charter dispatch
- "Any available driver" for fleet routing
- "Any hot-desk in the SF office" for coworking

## Data shape

```ts
export interface ResourcePool {
  id:         string;
  name:       string;
  memberIds:  string[];                 // ids from the asset/employee registry
  strategy:   'first-available' | 'least-loaded' | 'round-robin';
  rrCursor?:  number;                   // round-robin only; engine-owned
  disabled?:  boolean;                  // history stays; new bookings rejected
}
```

Members are referenced by registry id, not by label. By default the
resolver does *not* cross-reference `memberIds` against the live
resource registry — a typo'd or removed id will be tried like any
other member, and a `first-available` pool can return that id as the
winning resource. Two ways to opt into stricter behavior:

- Pass `strictMembers: true` to `resolvePool` to filter unknown ids out
  of the candidate set at submit time. They never appear in the
  evaluated trail.
- Run `validatePools(pools, resources)` at admin time to surface a
  `PoolIntegrityReport` listing every `(poolId, memberId)` pair that
  no longer maps to a known resource. Useful for "the cursor on
  `fleet-west` keeps skipping a slot" debugging.

## Wiring

Pass the pool list and an `onPoolsChange` callback to `WorksCalendar`.
Persist the pools wherever you keep calendar config (`localStorage`, a
JSON file in S3, a settings table). The round-robin cursor advances
inside the engine and echoes back through `onPoolsChange` on every
commit so the rotation survives a reload.

```tsx
import { WorksCalendar } from 'works-calendar';
import { loadPools, savePools } from 'works-calendar';

const CALENDAR_ID = 'fleet-ops';

function FleetCalendar() {
  const [pools, setPools] = useState(() => {
    const persisted = loadPools(CALENDAR_ID);
    return persisted.length > 0 ? persisted : DEFAULT_POOLS;
  });

  const handlePoolsChange = (next) => {
    setPools(next);
    savePools(CALENDAR_ID, next);
  };

  return (
    <WorksCalendar
      assets={assets}
      pools={pools}
      onPoolsChange={handlePoolsChange}
      events={events}
      onEventSave={onEventSave}
    />
  );
}

const DEFAULT_POOLS = [
  {
    id:        'fleet-west',
    name:      'West Fleet',
    memberIds: ['N121AB', 'N505CD'],
    strategy:  'round-robin',
  },
  {
    id:        'fleet-central',
    name:      'Central Fleet',
    memberIds: ['N88QR', 'N733XY'],
    strategy:  'first-available',
  },
];
```

The demo app at `demo/App.tsx` wires the exact snippet above against
`localStorage`; use it as a reference implementation.

## Booking flow

1. The Assets view renders each pool as a virtual row at the top, with
   a `POOL` chip and a hover tooltip listing its members.
2. Clicking an empty day cell on a pool row opens the EventForm with
   `resourcePoolId` seeded; the form doesn't expose the field, so the
   user fills in a title as usual and saves.
3. On submit, the engine:
   - picks a concrete member via the pool's strategy,
   - runs the normal conflict/overlap validators against the resolved
     member,
   - commits the event with `resource = <member>` and
     `meta.resolvedFromPoolId = <pool id>`.
4. `onEventSave` fires with the resolved payload, so the host sees the
   concrete member, not the pool id.

The pool row aggregates member bookings — any event on any member
appears on the pool row. Click a "busy" cell anyway; the resolver will
still find a free member if one exists.

## Strategies

| Strategy          | Picks                                                    |
|-------------------|----------------------------------------------------------|
| `first-available` | First member, in declared order, with no hard conflict   |
| `least-loaded`    | Member with the lowest `workloadForResource()` in window (extend with `lookaheadMs` to tally past the proposed end) |
| `round-robin`     | Next member after the stored cursor, skipping conflicts  |

`round-robin` persists its cursor (`rrCursor`) on the pool itself. The
engine advances the cursor atomically with the booking commit and
includes the updated pool in the next `onPoolsChange`.

If every member is in hard conflict, the submit is rejected with a
`NO_AVAILABLE_MEMBER` violation — nothing is written and no member
rotates. An unknown pool id rejects with `POOL_UNKNOWN`; a disabled
pool rejects with `POOL_DISABLED`; a pool with zero members rejects
with `POOL_EMPTY`. Every rejection carries `details.evaluated`, the
ordered list of members the resolver actually attempted (empty for
`POOL_DISABLED` / `POOL_EMPTY`, populated for `NO_AVAILABLE_MEMBER`).

Trying to *introduce* a pool reassignment via an `update` or
`group-change` op (a patch that sets `resourcePoolId` to a non-null
value without also pinning a concrete `resourceId`) rejects with
`POOL_REASSIGN_UNSUPPORTED`. The resolver only runs on `create` ops
today; submit a fresh create against the pool, or include a concrete
`resourceId` in the patch. Patches that null `resourcePoolId` or that
don't touch the field pass through unchanged.

## Sharing members across pools

Two pools may list the same member id. Pools are independent: the
resolver for pool A does not know or care that member `M` also belongs
to pool B. If your host submits two pool-backed bookings in parallel
against overlapping time windows and both happen to resolve to `M`,
the normal `resource-overlap` rule will reject the second submit —
but only when the second submit actually runs. There is **no
cross-pool mutual exclusion or holding phase**; if you need one, do
it at your host layer (queue submits, or wrap them in an optimistic
transaction).

## Disabled pools

Flip `disabled: true` to retire a pool. History stays searchable but:

- the Assets view stops rendering the pool row (no more drafts get
  started against it),
- API submits that still reference the pool id are rejected with
  `POOL_DISABLED`.

Re-enable by clearing the flag.

## Audit trail

Every pool-resolved event carries `meta.resolvedFromPoolId` so the
audit lineage is never lost. The Assets view surfaces this on the
event pill's hover tooltip, including the pool name when it can be
looked up, so an operator scanning utilization can see at a glance
which bookings originated from a pool.

## Storage helper

`works-calendar` ships a tiny `localStorage` adapter that
round-trips the pool list. It's deliberately small — swap it out for
your own adapter if you need server-backed persistence.

```ts
import { loadPools, savePools, clearPools } from 'works-calendar';

savePools('calendar-1', pools);
const restored = loadPools('calendar-1');
clearPools('calendar-1');
```

Keys are namespaced by calendar id, so multiple calendars on the same
origin don't collide.

### Surfacing dropped entries

`loadPools` silently discards malformed entries (unknown strategy,
shape drift) so a bad deploy doesn't brick the calendar. Hosts that
need the count — e.g. to log "lost the cursor on N pools after the
schema change" — call `loadPoolsDetailed` instead:

```ts
import { loadPoolsDetailed } from 'works-calendar';

const { pools, dropped, storageError } = loadPoolsDetailed('calendar-1');
if (dropped > 0) console.warn(`Dropped ${dropped} pool(s) on load`);
```

`storageError` is `true` when the storage layer itself failed (private
mode Safari, JSON parse error, non-array payload).

## v2: query and hybrid pools

A pool can describe **what kind of resource it needs** instead of (or
in addition to) listing concrete `memberIds`. The resolver evaluates
the query against the live `EngineResource` registry at submit time.

```ts
const reefer80k: ResourcePool = {
  id:        'nearby-reefers',
  name:      'Nearby Reefers',
  type:      'query',          // 'manual' (default) | 'query' | 'hybrid'
  memberIds: [],               // ignored for type: 'query'
  query: {
    op: 'and',
    clauses: [
      { op: 'eq',  path: 'type',                       value: 'vehicle' },
      { op: 'eq',  path: 'capabilities.refrigerated',  value: true },
      { op: 'gte', path: 'capabilities.capacity_lbs',  value: 80000 },
    ],
  },
  strategy: 'first-available',
};
```

| Type     | Candidate set                                            |
|----------|----------------------------------------------------------|
| `manual` | `pool.memberIds` (v1 behavior; default when `type` omitted) |
| `query`  | resources matching `pool.query`                          |
| `hybrid` | intersection of `pool.memberIds` and `pool.query`        |

### Query DSL

`ResourceQuery` is a small structural DSL — no string parsing, no
expression language. Hosts compose plain objects; the evaluator walks
them. See `src/core/pools/poolQuerySchema.ts` for the full type.

| Op       | Shape                                                  |
|----------|--------------------------------------------------------|
| `eq`     | `{ op: 'eq', path, value }` — strict equality          |
| `neq`    | `{ op: 'neq', path, value }` — strict inequality       |
| `in`     | `{ op: 'in', path, values: [...] }`                    |
| `gt`/`gte`/`lt`/`lte` | `{ op, path, value }` — numeric only      |
| `exists` | `{ op: 'exists', path }`                               |
| `and`/`or` | `{ op, clauses: [...] }` — empty `and` is true, empty `or` is false |
| `not`    | `{ op: 'not', clause }`                                |

`path` accepts top-level `EngineResource` keys (`id`, `name`,
`tenantId`, `capacity`, `color`, `timezone`) and `meta.<dot.path>` for
arbitrary host attributes. The leading `meta.` is optional —
`capabilities.refrigerated` reads `resource.meta.capabilities.refrigerated`.

Comparators on a missing path return false; only `exists` surfaces
presence directly.

### Readiness explainability

Every `query`/`hybrid` resolve — success or failure — returns a
`queryExcluded` trail listing each filtered-out resource and the first
clause that failed:

```ts
const result = resolvePool({ pool, proposed, events, rules, resources });
if (!result.ok) {
  for (const x of result.queryExcluded ?? []) {
    console.log(`${x.id}: ${x.reason}`);   // e.g. "truck-202: gte(capabilities.capacity_lbs)"
  }
}
```

The same data drives the issue's "1 too far · 1 capacity too low ·
2 available" UX without re-running the query.

### Admin-time check

`evaluateQuery(query, resources)` is exported separately so hosts can
preview matches before saving a pool — useful for the "live preview"
panel in a pool builder UI.

```ts
import { evaluateQuery } from 'works-calendar';

const { matched, excluded } = evaluateQuery(query, resources);
console.log(`Matches ${matched.length} resources, excludes ${excluded.length}`);
```

### Round-robin and dynamic candidate sets

`round-robin` works for `query` and `hybrid` pools. The cursor anchors
to whichever array drives ordering: `pool.memberIds` for `manual` /
`hybrid`, the live query result for `query`. Members that drop out of
the candidate set (resource removed, no longer matches the filter)
don't break rotation — the modulo math wraps as before.

## Sequence counter on onPoolsChange

`onPoolsChange(pools, meta)` receives a monotonic `meta.sequence`
counter scoped to the WorksCalendar instance. Hosts persisting
asynchronously can dedupe out-of-order writes:

```tsx
const lastSeq = useRef(0);
const handlePoolsChange = (next, { sequence }) => {
  if (sequence < lastSeq.current) return; // stale callback
  lastSeq.current = sequence;
  void persist(next);
};
```
