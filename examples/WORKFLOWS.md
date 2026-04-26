# Example Workflows

This file explains what each example demonstrates in real-world terms.

---

## Team Scheduling Workflow

Use these examples:
- `04-TimelineScheduler.jsx`
- `06-TeamCalendar.jsx`
- `08-ShiftCoverageTracking.jsx`

What they show:
- employees as rows
- schedule/timeline layout
- employee action card entry point (Edit Schedule / Request PTO / Edit Availability)
- PTO and unavailable states
- shift coverage logic

---

## Dashboard / Filtered Views

Use these examples:
- `03-WithFilters.jsx`
- `05-CustomFilters.jsx`
- `advanced-filters.jsx`

What they show:
- schema-driven filters
- saved views
- multi-filter combinations

---

## Multi-source Data

Use these examples:
- `07-MultiSource.jsx`
- `data-adapter-local.jsx`
- `data-adapter-microsoft365.jsx`

What they show:
- combining multiple data sources
- using adapters
- persistence strategies

---

## External Form Workflow

Use this example:
- `external-form.jsx`

What it shows:
- standalone event intake
- separation of input vs calendar UI

---

## Geographic / Map view (optional plugin)

Use this example:
- `11-Map.jsx`

What it shows:
- standalone `MapView` import alongside the calendar shell
- `meta.coords = { lat, lon }` data convention (matches `LocationData`)
- swappable basemap via `mapStyle` (MapLibre demo, OpenFreeMap)
- graceful install hint when `maplibre-gl` + `react-map-gl` aren't installed

See [docs/MapView.md](../docs/MapView.md) for the full plugin guide.

---

## Demo entry flow

Use this example:
- `00-DemoLanding.jsx`

What it shows:
- schedule demo path
- filter demo path
- saved views demo path
- docs/examples handoff links for first-time visitors

---

## Maintenance & Invoicing Integration

Use this example:
- `11-MaintenanceAndInvoicing.jsx`

What it shows:
- per-asset maintenance rules (intervals + warning windows)
- asset-row badges driven by `computeDueStatus`
- EventForm Maintenance section with auto-projection on `complete`
- one-click CSV export (`downloadInvoicesCSV`, `downloadMaintenanceLogCSV`)
- pure transforms (`toInvoiceLineItems`) for custom backends

See also: [docs/MaintenanceAndInvoicing.md](../docs/MaintenanceAndInvoicing.md).
