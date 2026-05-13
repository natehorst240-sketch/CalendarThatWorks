# `CalendarConfig` — standard config.json shape

The `CalendarConfig` interface is the canonical top-level shape for
hand-authoring (or wizard-generating) a complete WorksCalendar
setup. One JSON object describes label overrides, resource and role
catalogs, the resource registry, pool definitions, requirement
templates, seed events, and top-level settings.

It's the standard output format proposed in the [#386 comment
thread](https://github.com/WorksCalendar/CalendarThatWorks/issues/386)
(*"Wizard Output: Standard config.json Structure"*). Every section
is optional so partial configs (e.g. just `{ resources: [...] }`)
are valid.

## Top-level shape

```json
{
  "profile": "trucking",
  "labels": { "resource": "Truck", "event": "Load" },
  "resourceTypes": [{ "id": "vehicle", "label": "Truck" }],
  "roles":         [{ "id": "driver",  "label": "Driver" }],
  "resources":     [{ "id": "t1", "name": "Truck 101", "type": "vehicle",
                      "capabilities": { "refrigerated": true, "capacity_lbs": 80000 },
                      "location": { "lat": 40.7608, "lon": -111.8910 } }],
  "pools": [
    {
      "id": "nearby_reefers", "name": "Nearby Reefers",
      "type": "query", "memberIds": [],
      "query": {
        "op": "and",
        "clauses": [
          { "op": "eq",     "path": "meta.capabilities.refrigerated", "value": true },
          { "op": "within", "path": "meta.location",
                            "from": { "kind": "proposed" }, "miles": 50 }
        ]
      },
      "strategy": "closest"
    }
  ],
  "requirements": [
    {
      "eventType": "load",
      "requires": [
        { "role": "driver",         "count": 1 },
        { "pool": "nearby_reefers", "count": 1 }
      ]
    }
  ],
  "events": [
    {
      "id": "e1", "title": "SLC → Denver",
      "start": "2026-04-20T09:00:00Z", "end": "2026-04-20T18:00:00Z",
      "eventType": "load", "resourcePoolId": "nearby_reefers"
    }
  ],
  "settings": { "conflictMode": "block", "timezone": "America/Denver" }
}
```

## Reading a config

```ts
import { parseConfig } from 'works-calendar';

const { config, errors, dropped } = parseConfig(JSON.parse(text));
if (errors.length > 0) {
  console.warn(`Dropped ${dropped} entries while parsing config`, errors);
}
```

`parseConfig` is **defensive** — it never throws. Malformed entries
within a section are dropped (with a count plus a human-readable
error trail) so a single bad pool doesn't reject the whole config.
A non-object root yields `{ config: {}, errors: [...], dropped: 0 }`.

Cross-section integrity (does `requirements[0].requires[0].role`
match a `roles[].id`?) is **not** checked — those references
typically come from external sources and the engine's own runtime
validators handle them when they fire.

## Validating cross-section integrity

`parseConfig` checks each section's *shape* but deliberately does
not cross-check references between them. `validateConfig(config)`
is the opt-in pass that walks the references and surfaces issues:

| Check                                  | Issue kind                  |
|----------------------------------------|------------------------------|
| `resource.type` ∈ `resourceTypes[].id` | `unknown-resource-type`     |
| `pool.memberIds[*]` ∈ `resources[].id` | `unknown-pool-member`       |
| `requirement.role` ∈ `roles[].id`      | `unknown-requirement-role`  |
| `requirement.pool` ∈ `pools[].id`      | `unknown-requirement-pool`  |
| `event.resourceId` ∈ `resources[].id`  | `unknown-event-resource`    |
| `event.resourcePoolId` ∈ `pools[].id`  | `unknown-event-pool`        |
| Duplicate ids in any catalog section   | `duplicate-id`              |

```ts
import { validateConfig } from 'works-calendar';

const { ok, issues } = validateConfig(config);
if (!ok) {
  for (const issue of issues) {
    console.warn(`${issue.path}: ${issue.kind}`);
  }
}
```

Each issue carries enough context to render
*"requirements[0].requires[1].pool: pool 'aircraft' not found"*
without stitching strings together. Useful for the wizard's review
step, CLI tools loading config files, and any consumer that wants
to fail fast on internal inconsistencies.

## Writing a config

```ts
import { serializeConfig } from 'works-calendar';

const text = JSON.stringify(serializeConfig(config), null, 2);
```

`serializeConfig` returns a plain JSON-safe object; callers stringify
themselves so they can pick formatting. Sections that are absent
from the input are **omitted** from the output — a pristine `{}`
config produces `{}`, not a noisy stub with empty arrays for every
section.

## Round-trip guarantee

`parseConfig(JSON.parse(JSON.stringify(serializeConfig(config))))`
returns `{ config, errors: [], dropped: 0 }` for any valid
`CalendarConfig`. Tests pin the contract.

## Section reference

| Section          | Type                                        | Notes |
|------------------|---------------------------------------------|-------|
| `profile`        | `string`                                    | Industry preset hint; informational only. |
| `labels`         | `{ resource?, event?, location?, [k]?: string }` | UI string overrides; free-form keys allowed. |
| `resourceTypes`  | `{ id, label }[]`                           | Catalog of resource kinds (vehicle, person, …). |
| `roles`          | `{ id, label }[]`                           | Catalog of roles (driver, dispatcher, …). |
| `resources`      | `{ id, name, type?, capabilities?, location?, meta? }[]` | The resource registry. `capabilities` and `location` map to the v2 query DSL conventions. |
| `pools`          | `ResourcePool[]`                            | Same shape as the runtime pool definitions. Manual / query / hybrid types all round-trip. |
| `requirements`   | `{ eventType, requires: ({role,count}\|{pool,count})[] }[]` | Templates declaring what each event type needs. **Not yet consumed by the runtime engine** — the type lives here so the wizard's output round-trips losslessly. |
| `events`         | `{ id, title, start, end, eventType?, resourceId?, resourcePoolId?, meta? }[]` | Seed events for demos / config-driven setup. ISO 8601 strings on the wire; the runtime parses them when loading. |
| `settings`       | `{ conflictMode?, timezone? }`              | `conflictMode` is whitelisted to `block` / `soft` / `off`. Not yet enforced at runtime. |

## Industry profile presets

Four presets ship as starting points for the wizard's first step:

| Profile     | Labels                | Catalogs                                                    |
|-------------|-----------------------|--------------------------------------------------------------|
| `trucking`  | Truck / Load / Depot   | `vehicle`, `trailer`, `person` — `driver`, `dispatcher`      |
| `aviation`  | Aircraft / Flight / Airport | `aircraft`, `pilot` — `pilot-in-command`, `second-in-command`, `dispatcher` |
| `scheduling`| Room / Booking / Building   | `room`, `equipment`, `person` — `organizer`, `attendee`     |
| `custom`    | (none)                | (none)                                                       |

```ts
import { applyProfilePreset, listProfilePresets } from 'works-calendar';

// Wizard first-step picker:
const presets = listProfilePresets();   // ProfilePreset[]

// User picks "trucking" then starts editing:
let config = applyProfilePreset('trucking');

// User adds a custom role later. Switching profiles preserves
// their additions; the new preset's entries are appended for any
// id not already in the catalog.
config = applyProfilePreset('aviation', config);
```

Merge rules:

- **`profile`** — preset always wins (switching profiles updates the field).
- **`labels`** — per-key. Base wins where set; preset fills gaps.
- **`resourceTypes` / `roles`** — base entries kept in order; preset entries appended for any id not already present.
- **`settings`** — per-key, base wins.
- **`resources`, `pools`, `requirements`, `events`** — never touched by presets. Those stay the user's job.

`applyProfilePreset` is pure — it never mutates the input.

## Wizard

The `CalendarConfig` shape is the wizard's output target. The
wizard UI itself ships in a follow-up PR; the schema lands first so
hosts who want to hand-author or generate configs from custom flows
can do so today.

## Working with Config Programmatically

### Round-trip: parse → mutate → validate → serialize

```ts
import { parseConfig, validateConfig, serializeConfig } from 'works-calendar';

// 1. Load from storage or API.
const { config, errors, dropped } = parseConfig(JSON.parse(rawText));
if (errors.length > 0) {
  // Show which sections had bad entries. The rest of the config is usable.
  console.warn(`Loaded with ${dropped} dropped entries:`, errors);
}

// 2. Mutate in place (e.g. add a resource the user just created).
config.resources = [...(config.resources ?? []), newResource];

// 3. Cross-check references before saving.
const { ok, issues } = validateConfig(config);
if (!ok) {
  for (const issue of issues) {
    // Each issue: { path: string; kind: string; detail?: string }
    console.error(`${issue.path} — ${issue.kind}`);
  }
  return; // gate the save
}

// 4. Serialize and persist.
const text = JSON.stringify(serializeConfig(config), null, 2);
await saveConfigToServer(text);
```

`validateConfig` issue kinds and what they mean:

| `kind`                    | What failed |
|---------------------------|-------------|
| `unknown-resource-type`   | `resource.type` not in `resourceTypes[].id` |
| `unknown-pool-member`     | `pool.memberIds[*]` not in `resources[].id` |
| `unknown-requirement-role`| `requirement.role` not in `roles[].id` |
| `unknown-requirement-pool`| `requirement.pool` not in `pools[].id` |
| `unknown-event-resource`  | `event.resourceId` not in `resources[].id` |
| `unknown-event-pool`      | `event.resourcePoolId` not in `pools[].id` |
| `duplicate-id`            | Two entries in the same catalog share an id |

### `getProfileSampleData` / `applyProfileSampleData`

Seed a demo or first-run calendar with profile-appropriate sample
events and resources. The wizard uses this for its "Load sample data"
button; hosts can call it from onboarding flows without re-implementing
industry-specific fixtures.

```ts
import { getProfileSampleData, applyProfileSampleData } from 'works-calendar';

// Inspect what a profile's sample data looks like:
const sample = getProfileSampleData('trucking');
// sample: { events: WorksCalendarEvent[], resources: EngineResource[] } | null
// Returns null for 'custom' (no sample data ships for that profile).

// Apply sample data onto an existing config (additive, never clears
// resources or events the user already has):
const seeded = applyProfileSampleData('aviation', config);
```

`getProfileSampleData` returns `null` for `'custom'` — that profile
has no opinionated sample set. All other profiles ship fixtures.

### `resolveLabels`

`resolveLabels` is the single source-of-truth for the label
abstraction layer. Views call it once with the active config and read
the returned `ResolvedLabels` dict for every user-visible string
(`resource`, `resources`, `event`, `events`, `location`, `locations`,
plus any free-form extras the host defines).

```ts
import { resolveLabels } from 'works-calendar';
import type { ResolvedLabels } from 'works-calendar';

const labels: ResolvedLabels = resolveLabels(config);

// Profile-aware: 'trucking' → 'Truck', 'aviation' → 'Aircraft', etc.
console.log(labels.resource);    // e.g. "Truck"
console.log(labels.resources);   // e.g. "Trucks"  (auto-pluralized)
console.log(labels.event);       // e.g. "Load"
console.log(labels.location);    // e.g. "Depot"

// Free-form extras from config.labels carry through verbatim:
// config.labels.aircraft → labels.aircraft
```

Resolution order per key:
1. `config.labels[key]` — explicit host override.
2. Profile preset default (derived from `config.profile`).
3. Built-in fallback (`'Resource'`, `'Event'`, `'Location'`).

Non-string values (numbers, nulls, booleans) from raw JSON are
coerced out — the fallback ladder takes over rather than binding a
stray `42` to a label slot. `resolveLabels` is pure and sync; the
output object can be mutated freely.
