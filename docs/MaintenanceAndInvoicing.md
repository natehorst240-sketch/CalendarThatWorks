# Maintenance & Invoicing Integration

WorksCalendar plugs into your existing accounting and maintenance
systems instead of trying to replace them. You get:

- **Typed metadata** that hangs off your existing events
  (`event.meta.billing` / `event.meta.maintenance`).
- **Pure helpers** that compute due-status and project next-due
  values — no event storage, no async, easy to unit-test.
- **UI components** for asset-row badges and an in-form maintenance
  section so service work is logged in the same place as everything else.
- **Export helpers** that emit clean CSVs for QuickBooks, Stripe,
  Excel, or fleet tools.

The library does not produce invoices and does not store meter readings
— those live wherever you want. WorksCalendar surfaces, schedules, and
exports.

## Use cases

Built with these operators in mind:

- Small trucking companies (mileage-driven service intervals)
- Flight schools (Hobbs / tach-time intervals + annual inspections)
- Equipment / porta-potty rental shops (date-based service rotations)
- Anyone running scheduling in WorksCalendar and invoicing somewhere else

## Data shapes

Billing meta lives on the event:

```ts
import type { BillableMeta } from 'works-calendar';

const event = {
  title: 'ABC Logistics — transit',
  start: new Date(...),
  end:   new Date(...),
  resource: 'truck-12',
  meta: {
    billing: {
      billable: true,
      customer: 'ABC Logistics',
      rate: 120,            // numeric; units are your call (per hour, per job, …)
      quantity: 5,          // optional — defaults to event duration
      currency: 'USD',
      invoiceStatus: 'unbilled',  // 'unbilled' | 'invoiced' | 'paid' | 'void'
      description: 'Transit',
    },
  },
};
```

Maintenance rules are owned by the consumer:

```ts
import type { MaintenanceRule } from 'works-calendar';

const oilChange: MaintenanceRule = {
  id: 'oil-10k',
  assetType: 'truck',
  title: 'Oil change',
  interval:      { miles: 10_000 },
  warningWindow: { miles: 1_500  },
};
```

Maintenance work events carry their own meta:

```ts
event.meta.maintenance = {
  ruleId: 'oil-10k',
  lifecycle: 'scheduled',  // 'due' | 'scheduled' | 'in-progress' | 'complete' | 'skipped'
  meterAtService: 110_500,
  // After completion, the form auto-stamps:
  nextDueMiles: 120_500,
  nextDueDate:  '2027-04-10T00:00:00.000Z',
};
```

## Pure helpers

All in `import { computeDueStatus, projectNextDue, completeMaintenance } from 'works-calendar'`.

```ts
const due = computeDueStatus(
  oilChange,
  { meter: { type: 'miles', value: 109_200 } },
  { meterAtService: 100_000, completedAt: '2025-12-01T00:00:00Z' },
);
// due.status: 'overdue' | 'due-soon' | 'ok' | 'unknown'
// due.miles?: { remaining: number }   // negative when overdue
// due.days?:  { remaining: number }
```

The most-urgent dimension drives `status` (miles ok + days overdue ⇒
`overdue`). Returns `unknown` when there isn't enough data to compute,
rather than lying with `ok`.

```ts
const projection = projectNextDue(oilChange, { meterAtService: 110_500 });
// projection.nextDueMiles → 120_500
```

```ts
const { event: stamped, reading } = completeMaintenance(
  workEvent,
  oilChange,
  { assetId: 'truck-12', type: 'miles', value: 110_500 },
);
// stamped.meta.maintenance.lifecycle      → 'complete'
// stamped.meta.maintenance.meterAtService → 110_500
// stamped.meta.maintenance.nextDueMiles   → 120_500
// reading is a MeterReading{ assetId, type, value, asOf } you append to your log
```

## Asset-row badges

The library exposes a `renderAssetBadges` slot on `WorksCalendar` /
`AssetsView`. Pair it with the bundled `<AssetMaintenanceBadges>`:

```tsx
import {
  WorksCalendar,
  AssetMaintenanceBadges,
} from 'works-calendar';

<WorksCalendar
  events={events}
  assets={assets}
  renderAssetBadges={(asset) => (
    <AssetMaintenanceBadges
      rules={rulesByAsset[asset.id] ?? []}
      currentMeter={meters[asset.id]}
      lastServiceByRule={lastServiceByAssetRule[asset.id]}
      max={3}
      // hideHealthy        // optional — only show overdue / due-soon
    />
  )}
/>
```

Status colors come from theme tokens (`--wc-danger`, `--wc-warning`,
`--wc-success`, muted) so badges adapt to the active theme.

## In-form maintenance completion

Pass `maintenanceRules` to `WorksCalendar` (or directly to `EventForm`
in custom integrations). The form gains a Maintenance section:

```tsx
<WorksCalendar
  events={events}
  maintenanceRules={RULES}
  // …
/>
```

When the user marks the lifecycle `complete` and enters a meter reading
(or selects a date-only rule), the form internally calls
`completeMaintenance()` so projected `nextDueMiles` / `nextDueHours` /
`nextDueCycles` / `nextDueDate` land on the saved event automatically.
The asset-row badges update on the next render — no extra wiring.

The section is **opt-in**: omit `maintenanceRules` (or pass `[]`) and the
form behaves exactly as before, with zero overhead.

## CSV import

The existing CSV import dialog (`CSVImportDialog`) renders mappable
fields dynamically from `EVENT_FIELDS`, so once you have billing /
maintenance columns in your sheet you can map them through the same
flow operators already use:

| Sheet column (examples)     | Maps to                  |
|------------------------------|--------------------------|
| Customer / Client / Account  | `meta.billing.customer`  |
| Rate / Hourly Rate           | `meta.billing.rate`      |
| Hours / Qty                  | `meta.billing.quantity`  |
| Invoice Status               | `meta.billing.invoiceStatus` |
| Truck / Tail # / Aircraft    | `resource` (asset id)    |
| Hobbs / Mileage / Odometer   | `meta.meter.value`       |
| Service / Maintenance Rule   | `meta.maintenance.ruleId` |

Numeric cells tolerate `$`, `,`, and whitespace. Symbol-only cells
(`"$"`, `","`) are reported as per-row errors instead of silently
importing as 0.

## CSV export

Three layers of access — pick whichever fits:

```ts
import {
  toInvoiceLineItems,
  invoiceLineItemsToCSV,
  downloadInvoicesCSV,
  toMaintenanceLog,
  maintenanceLogToCSV,
  downloadMaintenanceLogCSV,
} from 'works-calendar';

// 1. Pure transform — for sending to a webhook, a custom backend, etc.
const items = toInvoiceLineItems(events, { onlyBillable: true });

// 2. CSV string — paste into anything, log it, sign it, ship it.
const csv = invoiceLineItemsToCSV(items);

// 3. One-shot browser download.
downloadInvoicesCSV(events, { statuses: ['unbilled'] }, 'april-invoices');

// Maintenance log mirror image:
downloadMaintenanceLogCSV(events, {
  rules: RULES,
  lifecycles: ['complete'],   // service-history report
}, 'service-history');
```

Both CSVs emit headers even for empty input — most accounting-tool
imports treat that as "no rows" rather than erroring on a truly empty
file.

### Quantity defaults

`toInvoiceLineItems` derives `quantity` from event duration when
`meta.billing.quantity` is absent:

| `quantityFrom`     | Behavior                               |
|---------------------|----------------------------------------|
| `'duration-hours'` (default) | end − start, in hours, 2-decimal |
| `'duration-days'`   | end − start, in days, 2-decimal       |
| `'none'`            | `0` when not explicitly set           |

`total = rate × quantity` when both present, else `null`.

## Round-trip with the user's spreadsheet

The realistic adoption story is *"keep your sheet, we plug in"*. The
typical loop:

1. Operator imports their working sheet through the CSV dialog. Domain
   columns (`Truck`, `Hobbs`, `Customer`, `Rate`) auto-map; everything
   else they map manually once.
2. Calendar shows their schedule, asset health badges light up where
   service is due.
3. Operator runs jobs and logs maintenance through the form. The form
   auto-stamps next-due fields.
4. Operator exports invoice CSV → drops into QuickBooks. Exports
   maintenance log → emails to the fleet owner.

No accounting / fleet replacement required.

## Related

- [Example: 11-MaintenanceAndInvoicing.jsx](../examples/11-MaintenanceAndInvoicing.tsx)
- [Examples index](../examples/README.md)
- [Resource scheduling](./ResourceScheduling.md) — asset registry basics
