# Grouping & Sort API

Reference for the grouping, sorting, and group-change DnD surface added in
v0.3 ("infinite grouping").  Examples live in
[`examples/09-Grouping.jsx`](../examples/09-Grouping.jsx) and
[`examples/10-DragAndDrop.jsx`](../examples/10-DragAndDrop.jsx).

---

## Props — `<WorksCalendar>`

| Prop                 | Type                                         | Default | Notes                                                                                              |
| -------------------- | -------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `groupBy`            | `string \| string[] \| GroupConfig[]`        | —       | One, two, or three nesting levels. String shorthand reads `event[field] ?? event.meta[field]`.     |
| `sort`               | `SortConfig \| SortConfig[]`                 | —       | Ordered tiebreakers. Applied inside each leaf group.                                               |
| `showAllGroups`      | `boolean`                                    | `false` | Surface empty groups and cross-group copies (an event whose field value matches multiple groups).  |
| `onEventGroupChange` | `(event, patch) => void`                     | —       | Fires on cross-group drag-drop. `patch` is a partial event to merge: e.g. `{ resource: 'bob' }`.   |

All four flow through the engine validation + undo pipeline, and serialize
into saved views (schema v3).

---

## `GroupByInput`

```ts
type GroupByInput =
  | string             // "role"
  | string[]           // ["role", "shift"]
  | GroupConfig[];     // [{ field: "role", showEmpty: true, getLabel: ... }]
```

Arrays define nesting depth (top → bottom). Mixing string and `GroupConfig`
in one array is not supported — pick one form per invocation.

### `GroupConfig`

```ts
type GroupConfig = {
  field: string;
  label?: string;
  showEmpty?: boolean;
  getKey?:   (event: NormalizedEvent) => string | null;
  getLabel?: (key: string, events: NormalizedEvent[]) => string;
};
```

| Field       | Purpose                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| `field`     | Default key + value source. Reads `event[field]`, then `event.meta[field]`.        |
| `label`     | Display name for this **grouping dimension** (shown in UI headers, a11y labels).   |
| `showEmpty` | When true, groups with 0 events after filtering are still rendered (as 0-count).   |
| `getKey`    | Custom key extractor.  Return `null` or `''` to place the event in `(Ungrouped)`. |
| `getLabel`  | Custom display label for a resolved key — e.g. translate an id to a human name.    |

### `GroupResult`

Returned from `useGrouping` / `groupRows`:

```ts
type GroupResult = {
  key:      string;                 // raw value
  label:    string;                 // display label
  field:    string;                 // dimension
  depth:    number;                 // 0 = top-level
  events:   NormalizedEvent[];      // non-empty only on leaves
  children: GroupResult[];          // non-empty only on branches
};
```

---

## `SortConfig`

```ts
type SortConfig = {
  field:      string;
  direction:  'asc' | 'desc';
  getValue?:  (event: NormalizedEvent) => unknown;
};
```

- Multiple configs are applied as tiebreakers in array order.
- `Date`, `number`, `boolean` are compared natively; everything else falls back
  to `localeCompare` with `numeric: true`.
- `null` / `undefined` always sort last regardless of direction.

---

## Drag-and-drop between groups

`onEventGroupChange(event, patch)` fires when a user drags an event into a
different group (AgendaView) or a different resource row (TimelineView).

| View             | Target              | Emitted patch                                                                 |
| ---------------- | ------------------- | ----------------------------------------------------------------------------- |
| AgendaView       | Leaf group          | One field per `groupBy` dimension.  E.g. `{ role: 'Doctor', shift: 'Night' }`. |
| TimelineView     | Resource row        | `{ resource: <employeeId or null> }`.  `null` for the `(Unassigned)` row.     |

Same-group / same-row drops are short-circuited — the callback does **not**
fire.

Behaviour:

- Drops flow through the `CalendarEngine` as a `group-change` op, so you can
  register custom validators via `OperationContext.groupChangeValidators`
  (see below) to accept, soft-warn, or hard-reject reassignments with the
  standard validation protocol.
- When `onEventGroupChange` is absent, events are **not** draggable.  This
  keeps the DnD surface opt-in and backwards-compatible.

### `GroupChangeRule`

```ts
type GroupChangeRule = (
  change: { event: EngineEvent; patch: Readonly<Record<string, unknown>> },
  ctx:    OperationContext,
) => Violation | null;

type Violation = {
  rule:     string;
  severity: 'soft' | 'hard';
  message:  string;
};
```

Register via the engine context:

```ts
const engine = createCalendarEngine({
  groupChangeValidators: [
    ({ event, patch }) => {
      if (patch.resource && event.category === 'on-call' && patch.resource !== 'alice') {
        return { rule: 'on-call-owner', severity: 'hard', message: 'Only Alice can own on-call shifts.' };
      }
      return null;
    },
  ],
});
```

The returned `OperationResult` carries one of:

| Status                    | Meaning                                              |
| ------------------------- | ---------------------------------------------------- |
| `accepted`                | No violations. Change applied.                       |
| `accepted-with-warnings`  | Soft violations; user confirmed override.            |
| `pending-confirmation`    | Soft violations; needs `overrideSoftViolations`.     |
| `rejected`                | Hard violation. No changes emitted.                  |

---

## Saved views

Saved views persist `groupBy`, `sort`, and `showAllGroups` alongside the
filter state (schema v3).  The `useSavedViews` hook round-trips these through
JSON — see [`v0.2-to-v0.3-MIGRATION.md`](./v0.2-to-v0.3-MIGRATION.md) for the
schema change.

---

## Performance

`groupRows()` is O(n · depth) in event count.  Baseline on a 2020-era laptop
at Node 20, measured via `scripts/perf-benchmark.mjs`:

| Events | Depth   | p95    |
| ------ | ------- | ------ |
| 500    | 1-level | ~0.3ms |
| 1000   | 2-level | ~0.2ms |
| 1000   | 3-level | ~0.3ms |
| 2000   | 3-level | ~0.4ms |

Budget: p95 < 100ms at 1000ev × 3-level.  Regressions are caught by running
`node scripts/perf-benchmark.mjs` against the committed baseline in
`docs/perf-baselines.json`.

---

## Low-level exports

For apps that want to drive grouping outside of `<WorksCalendar>`:

```ts
import {
  groupRows,             // pure groupRows({ rows, groupBy, fieldAccessor, ... })
  buildFieldAccessor,    // string | string[] → accessor fn(s)
  useGrouping,           // React hook: flatRows, collapsedGroups, toggleGroup
} from 'works-calendar';
```

See `src/grouping/` and `src/hooks/useGrouping.{js,ts}` for full signatures.

---

## AssetsView — first-class assets registry

AssetsView is a Gantt-style resource timeline. Unlike the other views, its
rows are driven by a dedicated **assets registry** rather than by events —
which means an asset shows up even if it has zero events on screen. The
registry is **owner-configurable** via the ConfigPanel → Assets tab and
persists through `useOwnerConfig`. Host apps never need to redeploy to add,
rename, or regroup an asset.

### `assets` prop

```ts
type Asset = {
  id:    string;             // stable key; matches event.resource
  label: string;             // display name
  group?: string;            // optional grouping key (owner-chosen dimension)
  meta?: Record<string, unknown>;  // arbitrary metadata surfaced to getLabel etc.
};

<WorksCalendar assets={assets} /* ... */ />
```

When `assets` is provided, AssetsView renders **one row per registered asset**
in registry order (or per the toolbar's Sort-by selection). Events whose
`resource` does not match any asset `id` are treated as unassigned and
bucketed under `(Unassigned)`.

### On-page toolbar

Above the grid, AssetsView renders a toolbar with:

| Control       | Purpose                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| **Group by**  | Switches `groupBy` on the fly. Options come from asset `group` + `meta.*` fields.    |
| **Sort by**   | `registry` (default), `label`, `group`, or `lastEvent` (most recent activity first). |
| **Edit assets** | Deep-links to ConfigPanel's Assets tab. Owner-only; hidden for non-owners.         |

The Edit button calls `useOwnerConfig.openConfigToTab('assets')`, which sets
both `configOpen` and `configInitialTab`; `ConfigPanel`'s `initialTab` prop
re-applies on change, so subsequent clicks re-target the Assets tab even if
the panel is already open on another tab.

### Keyboard contract

AssetsView implements the WAI-ARIA tree-interleaved-with-grid pattern. Both
`GroupHeader` rows (role=`treeitem`) and data cells (role=`gridcell`)
participate in the same roving-tabindex chain:

| Key          | On a `treeitem` header                    | On a `gridcell`                       |
| ------------ | ----------------------------------------- | ------------------------------------- |
| `ArrowUp`    | Move to row above (header or data cell)   | Move to row above                     |
| `ArrowDown`  | Move to row below (header or data cell)   | Move to row below                     |
| `ArrowLeft`  | Expanded → collapse; collapsed → no-op    | Move one day left (existing behavior) |
| `ArrowRight` | Collapsed → expand; expanded → descend to first child cell | Move one day right |
| `Enter` / `Space` | Toggle collapse                       | (view-specific click behavior)        |

The contract is pinned by `src/views/__tests__/AssetsView.keyboardNav.test.jsx`.

### Saved-view fields

AssetsView extends the v3 saved-view schema with two Gantt-specific fields:

| Field            | Type                      | Notes                                                          |
| ---------------- | ------------------------- | -------------------------------------------------------------- |
| `zoomLevel`      | `'day' \| 'week' \| 'month' \| 'quarter'` | Restores the zoom control's aria-pressed state. |
| `collapsedGroups`| `string[]`                | Group keys to restore in the collapsed state on apply.         |

Round-trip (seed → reload → click chip → state restored) is proven end-to-end
by `tests-e2e/calendar.assets-grouping.spec.ts`.

### ConfigPanel — Assets tab

Owners can edit the registry from ConfigPanel → Assets without leaving the
calendar. Changes flow through `useOwnerConfig.updateConfig`, so saved-view
pins, group counts, and row order all refresh live. `openConfigToTab(tabId)`
is the recommended deep-link API; it validates that the requested tab id
exists in `TABS` before applying.

---

## Phase B — owner-configurable workflow blocks

Phase B extends owner config with three data-driven workflow systems. All
three ship disabled (or with safe minimal defaults) and read exclusively
from the owner-config blob — no host redeploy required to tune them.

### Schema version

`config.schemaVersion = 4`. Migration from v3 is purely additive: the
`mergeDeep` call in `loadConfig` stamps the new default blocks onto any
older stored config, so previously-persisted calendars see the new tabs
without losing state.

### 1. Request form (ticket #134-12)

Shape: `config.requestForm.fields: Array<{ key, label, type, required?, placeholder?, options? }>`.

Supported `type` values: `text`, `textarea`, `number`, `date`, `datetime`,
`select`, `checkbox`. For `select`, `options` is a comma-separated string
(e.g. `"one, two, three"`); first rendered option is an empty placeholder.

`RequestForm` emits `{ values }` on submit. Required fields (including
required-truthy checkboxes) gate submission; host-level validators remain
the escape hatch via `onSubmit` rejection. Owners edit the schema from
ConfigPanel → Request Form (CRUD + move up/down).

### 2. Conflict engine (ticket #134-13)

Shape: `config.conflicts: { enabled: boolean, rules: ConflictRule[] }`.

Supported rule types:

| `type`              | Parameters                              | Behavior                                     |
| ------------------- | --------------------------------------- | -------------------------------------------- |
| `resource-overlap`  | `ignoreCategories?: string[]`           | Flag any event on the same resource whose `[start, end)` intersects the proposed event. |
| `category-mutex`    | `categories: string[]`                  | Flag overlap on same resource when both events' categories are in the listed set.       |
| `min-rest`          | `minutes: number`                       | Flag same-resource back-to-back events closer than `minutes` apart.                     |

Each rule carries `severity?: 'soft' \| 'hard'` (default `hard`). The
engine returns `{ violations, severity, allowed }` — `allowed` is `true`
for `'soft'`/`'none'`, `false` for `'hard'`. Host apps gate their save
path on `allowed`; `ConflictModal` presents violations and a
Proceed/Cancel pair, enabling Proceed only for soft severity.

Overlap semantics are half-open: touching endpoints (A ends at T, B
starts at T) do **not** count as overlapping.

### 3. Approvals policy (ticket #134-14, #134-15)

Shape:

```ts
config.approvals = {
  enabled: boolean,
  tiers: Array<{ id, label, requires: 'any' | 'all', roles: string[] }>,
  rules: {
    [stage in 'requested' | 'approved' | 'finalized' | 'pending_higher' | 'denied']:
      { allow: Array<'approve' | 'deny' | 'finalize' | 'revoke'>, prefix: string }
  },
  labels: { approve, deny, finalize, revoke },
}
```

- **`rules[stage].allow`** drives which buttons `ApprovalActionMenu`
  renders for that stage (both the pill caret popover in AssetsView and
  the inline menu in AuditDrawer). Empty `allow` hides the caret.
- **`rules[stage].prefix`** rides on the left of the pill label, e.g.
  `Req · Flight 202`.
- **`labels`** supplies the button copy, letting owners rename
  `Approve`/`Deny`/etc. to match their organization's vocabulary.
- **`tiers[].requires`** determines quorum: `any` promotes on the first
  approver action, `all` waits for every listed role.

The calendar emits `onApprovalAction(event, action)`; the host mutates
`event.meta.approvalStage.stage` + appends to `.history`, then echoes
the updated event back. The calendar never writes stage state itself.

### Cross-cutting

`src/__tests__/phaseB.integration.test.jsx` pins the end-to-end glue
(RequestForm → conflictEngine → ConflictModal → persist + pill menu)
so any future refactor that breaks the contract between these three
systems fails loudly.
