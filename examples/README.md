# WorksCalendar Examples

Run all examples locally:

```bash
npm install
npm run examples
```

## Core examples

- `00-DemoLanding.jsx` — guided demo entry page
- `01-GettingStarted.jsx` — minimum integration setup
- `02-BasicCalendar.jsx` — baseline calendar configuration
- `03-WithFilters.jsx` — schema-driven filter bar
- `04-TimelineScheduler.jsx` — timeline scheduler layout
- `05-CustomFilters.jsx` — custom filter schema fields
- `06-TeamCalendar.jsx` — multi-resource team scheduling
- `07-MultiSource.jsx` — merged multi-source data views
- `08-ShiftCoverageTracking.jsx` — PTO + coverage workflow
- `09-Grouping.jsx` — 1-, 2-, 3-level grouping presets
- `10-DragAndDrop.jsx` — drag events across groups / rows
- `11-Map.jsx` — geographic plot via the optional MapView plugin (see [docs/MapView.md](../docs/MapView.md))

## Focused examples

- `setup-wizard.jsx` — owner onboarding wizard
- `advanced-filters.jsx` — nested smart-view filtering
- `data-adapter-local.jsx` — local-storage adapter
- `data-adapter-microsoft365.jsx` — Microsoft 365 adapter wiring
- `external-form.jsx` — standalone `CalendarExternalForm`
- `basic-usage.jsx` — compact docs/tutorial starter

## Feature demos

- `../demo/App.tsx` — unified calendar demo; wires resource pools with
  `localStorage` persistence (see
  [docs/ResourcePools.md](../docs/ResourcePools.md)).

## Related docs

- [Workflow map](./WORKFLOWS.md)
- [Documentation index](../docs/README.md)
- [Resource pools](../docs/ResourcePools.md)
- [Microsoft 365 adapter notes](./microsoft-365/README.md)
