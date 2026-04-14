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

## Important Note

Some older examples (like shift coverage) still demonstrate legacy UI flows.

The current workflow is:
- click employee
- use action card
- manage schedule / PTO / availability from there

Refer to docs/ScheduleWorkflow.md for the latest behavior.
