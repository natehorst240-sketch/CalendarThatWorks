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
| `closest`         | Member with the smallest great-circle distance to `proposedLocation` (requires v2 distance filters; see below) |
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
| `within` | `{ op: 'within', path, from, miles? \| km? }` — great-circle distance (see below) |
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

### Distance: `within` clauses + the `closest` strategy

Distance filters operate on `{ lat, lon }` data the host supplies on
each resource (convention: `meta.location`). The math is great-circle
haversine — see `src/core/pools/geo.ts`.

A `within` clause narrows the candidate set; the `closest` strategy
ranks the survivors by proximity:

```ts
const pool: ResourcePool = {
  id: 'nearby-reefers',
  name: 'Nearby Reefers',
  type: 'query',
  memberIds: [],
  query: {
    op: 'and',
    clauses: [
      { op: 'eq',     path: 'capabilities.refrigerated', value: true },
      { op: 'within', path: 'meta.location',
                      from: { kind: 'proposed' },           // event location
                      miles: 50 },
    ],
  },
  strategy: 'closest',
};

resolvePool({
  pool, proposed, events, rules, resources,
  proposedLocation: { lat: 40.76, lon: -111.89 },   // pickup point
});
```

`from` accepts a literal `{ kind: 'point', lat, lon }` baked into the
query, or `{ kind: 'proposed' }` to defer to
`ResolvePoolInput.proposedLocation` at resolve time. The latter lets a
single saved query work for any pickup without rebuilding it per
submit.

The `closest` strategy throws when `proposedLocation` is missing —
the strategy has no meaning without a reference point. Resources
without a usable `meta.location` (or whatever path
`ResolvePoolInput.locationPath` overrides to) sort to the back so
they're tried last rather than silently disqualified.

### Importing coordinates: location adapters

Hosts compose `ResourceLocationAdapter`s and call `attachLocations`
at registry-build time:

```ts
import {
  attachLocations,
  createStaticLocationAdapter,
  createMetaPathLocationAdapter,
} from 'works-calendar';

const located = attachLocations(resources, [
  // Manual / config-driven coordinates win first.
  createStaticLocationAdapter({
    'truck-101': { lat: 40.7608, lon: -111.8910 },
    'truck-202': { lat: 39.7392, lon: -104.9903 },
  }),
  // Fall back to a different meta path if your registry uses it.
  createMetaPathLocationAdapter('meta.depot'),
]);
```

Resources that already carry `meta.location` are left untouched —
manual config always wins over an automated source. Adapters earlier
in the array win.

#### Plugin: `asset-tracker` (Map_Idea) bridge

The [`asset-tracker`](https://github.com/natehorst240-sketch/Map_Idea)
library normalizes positions from many feeds (ADS-B, NMEA, Traccar,
APRS, Samsara, AIS, inReach, MQTT, GeoJSON, …) into a flat schema
keyed by `id` — a perfect match for `EngineResource.id`. The bridge
lives at `works-calendar/integrations/asset-tracker` so hosts who
don't use the tracker pay nothing in their bundle.

```ts
import { buildRegistry, samsaraAdapter } from 'asset-tracker';
import {
  fromAssetTrackerRegistry,
} from 'works-calendar/integrations/asset-tracker';

const registry = buildRegistry([samsaraAdapter()]);
await registry.refresh();   // host owns the polling cadence

const located = attachLocations(resources, [
  fromAssetTrackerRegistry(registry),
]);
```

The bridge accepts any object that implements `getById(id)` (preferred
— O(1)) or `positions()` (fallback — O(n)), so it also works with
hand-rolled registries that match the normalized-position shape.

### Round-robin and dynamic candidate sets

`round-robin` works for `query` and `hybrid` pools. The cursor anchors
to whichever array drives ordering: `pool.memberIds` for `manual` /
`hybrid`, the live query result for `query`. Members that drop out of
the candidate set (resource removed, no longer matches the filter)
don't break rotation — the modulo math wraps as before.

## UI components

`works-calendar` ships two opt-in UI components for surfacing and
editing pools. Hosts mount them wherever their config UI lives —
they take pools in / out via props and don't depend on any
particular layout.

### `PoolCard`

Read-only summary card. Renders the pool name, a type chip (Manual /
Query / Hybrid), a plain-English clause list ("refrigerated · within
50 mi of event"), and an optional live "Matches N · M excluded"
counter when a `resources` registry is provided.

```tsx
import { PoolCard } from 'works-calendar';

<PoolCard
  pool={pool}
  resources={resources}                      // optional: drives live counts
  onEdit={() => setEditing(pool)}            // optional: shows Edit button
  onToggleDisabled={() => toggle(pool.id)}   // optional: Disable / Enable
/>
```

### `PoolBuilder`

Guided create / edit modal. Walks the user through type → name →
rules → strategy with progressive disclosure:

- **Manual pools** — checkbox list of resources to include.
- **Query / hybrid pools** — capability chips (auto-derived from each
  resource's `meta.capabilities` boolean keys, or supplied as a
  curated `capabilityCatalog` prop) plus an optional radius clause
  ("within N miles of the event").
- **Strategy picker** — `first-available` / `least-loaded` /
  `round-robin` / `closest`. The builder blocks Save with an inline
  warning when `closest` is picked without a radius clause, so the
  new strategy never ships without a reference point.

A live "Matches N · M excluded" preview tracks the draft as the user
types, using `evaluateQuery` against the live registry.

```tsx
import { PoolBuilder } from 'works-calendar';

<PoolBuilder
  pool={editing}                             // null to create a new one
  resources={resources}
  capabilityCatalog={[                       // optional curation
    { id: 'refrigerated', label: 'Refrigerated' },
    { id: 'heavy_haul',   label: 'Heavy Haul' },
  ]}
  onSave={(next) => persist(next)}
  onCancel={() => setEditing(null)}
/>
```

The builder produces a concrete `ResourcePool`; persistence is the
host's problem (typically wired through `onPoolsChange`).

### Numeric ranges (capacity, weight, etc.)

The `PoolBuilder` simple form auto-discovers numeric capabilities
on the live registry and renders a **Numeric ranges** section with
min / max inputs per capability:

```
Capacity Lbs   ≥ [ 70000 ]   ≤ [ 90000 ]
```

A bound input emits a clause on save (`gte` for min, `lte` for max);
filling both produces the obvious range. Clearing both inputs drops
the row entirely. Hosts can curate the list with the
`numericCapabilityCatalog` prop (mirrors `capabilityCatalog` but
for numeric ones); pass `[]` to suppress the section even when the
fleet has numeric values.

Range clauses are recognized round-trip — opening an existing pool
that uses `gte` / `lte` on a `meta.capabilities.X` path seeds the
bound inputs, no advanced editor required.

### Advanced rules — full DSL editor

The `PoolBuilder` modal also exposes a collapsible **Advanced rules**
section for query / hybrid pools. The simple-form fields (capability
chips + radius) keep covering the common case; the advanced section
lets power users edit anything else the DSL supports —
`gt` / `gte` / `lt` / `lte`, `or`, `not`, fixed-point `within`,
arbitrary `meta` paths, etc.

The section opens automatically when an existing pool's query
contains clauses the simple form can't model (so users can see what
they're inheriting), and stays collapsed for "clean" simple-form
pools so it doesn't add visual noise.

Two opt-in components power the section and ship as standalone
exports too:

- **`AdvancedRulesEditor`** — flat list manager. Each row shows a
  plain-English summary of the clause (via `summarizeQuery`) plus
  Edit / Remove buttons. Add new rules via "+ Add rule".
- **`ClauseEditor`** — recursive single-clause editor. Op picker
  covers every DSL leaf and composite (`and` / `or` / `not`); inputs
  type themselves to whichever op is active (number for gte, lat/lon
  for fixed-point `within`, etc.).

```tsx
import { AdvancedRulesEditor } from 'works-calendar';

<AdvancedRulesEditor
  clauses={query.op === 'and' ? query.clauses : [query]}
  onChange={(next) => persist(reAndWrap(next))}
/>
```

Nesting is capped at depth 5 to keep the DOM bounded; deeper trees
can still be authored via JSON / config and round-trip safely
through `PoolBuilder` because they land in the preserved bucket.

#### Path autocomplete

Pass the live `resources` registry through to the editors and the
path inputs render an HTML5 `<datalist>` with every dotted path
the registry exposes (top-level fields plus `meta.<dot.path>`):

```tsx
import { derivePathSuggestions } from 'works-calendar';

<AdvancedRulesEditor
  clauses={preserved}
  pathSuggestions={derivePathSuggestions(resources)}
  onChange={...}
/>
```

`PoolBuilder` does this for you — its embedded
`AdvancedRulesEditor` automatically receives suggestions derived
from the same `resources` it uses for the live preview.

The list is informational only; the inputs still accept any
string, so custom paths the registry doesn't yet expose still
work.

#### Reordering composite children

Both `ClauseEditor` (for `and` / `or` children) and
`AdvancedRulesEditor` (for top-level rules) render
keyboard-accessible **Up / Down** buttons next to each row.
Buttons disable at the list bounds. No HTML5 drag-drop
dependency — the buttons stay reachable for screen readers and
touch-only sessions.

### `summarizePool` / `summarizeQuery`

Pure helpers that turn a pool or query into a `PoolSummary`
object — `{ typeLabel, strategyLabel, clauseLabels, headline }`.
Useful when you want the same plain-English text in non-React
surfaces (audit log entries, plain text emails, command-palette
hints) without re-rendering a component.

```ts
import { summarizePool } from 'works-calendar';

const { headline, clauseLabels } = summarizePool(pool);
// → "Query pool · refrigerated · within 50 mi of event"
```

### `validateClausePaths`

Soft pre-save check that flags query paths which resolve on zero
resources in the live registry. The save is never blocked — paths
may be intentionally forward-looking — but surfacing unknown paths
early prevents silent typo-driven pool misses.

```ts
import { validateClausePaths } from 'works-calendar';
import type { ValidateClausePathsResult, ClausePathIssue } from 'works-calendar';

const result: ValidateClausePathsResult = validateClausePaths(pool.query!, resources);

if (!result.ok) {
  for (const issue of result.unresolved) {
    console.warn(`Path "${issue.path}" resolves on 0 resources (${issue.count} clause(s))`);
  }
}
```

`AdvancedRulesEditor` calls this automatically when `resources` is
provided and renders a warning chip on each row whose path is in
`result.byPath`. You only need the standalone call when building a
custom editor or running a pre-save lint outside the component.

```ts
// Quick membership test — O(1) after the initial walk:
if (result.byPath.has('meta.capabilities.refrigerated')) {
  // surface a targeted warning
}
```

Path semantics mirror `evaluateQuery`:
- `meta.x` and plain `x` both resolve against `resource.meta.x`.
- Top-level fields (`id`, `name`, `capacity`, `color`, …) resolve
  against the resource root.
- Composite ops (`and` / `or` / `not`) are walked recursively; all
  leaf `path` values are collected in the order they appear.

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
