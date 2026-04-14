
# WorksCalendar

A customizable React calendar built for real workflows — not just events.

**Core idea:**  
Instead of one fixed calendar view, create **unlimited filtered views of the same data**, and manage scheduling workflows directly inside the calendar.

---

## Why this exists

Most calendars are:
- rigid
- hard to customize
- weak at filtering
- not built for scheduling workflows

WorksCalendar is built for:
- dashboards
- team scheduling
- operational workflows
- people who need more than “just a calendar”

---

## What makes this different

| Feature | Typical Calendars | WorksCalendar |
|--------|------------------|---------------|
| Filtering | Basic | Schema-driven |
| Views | Fixed | Unlimited saved views |
| Scheduling | Manual | PTO → open shift → coverage |
| Customization | Hard | First-class |
| Data sources | Single | Adapters + feeds + APIs |
___


## Documentation

- [Docs Overview](./docs/README.md)
- [Schedule Workflow](./docs/ScheduleWorkflow.md)
- [Filtering System](./docs/Filtering.md)
- [Prompt Examples](./docs/Prompts.md)


---

## Quick example

```jsx
import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';
import 'works-calendar/styles/ocean';

<WorksCalendar
  events={events}
  employees={team}
  initialView="schedule"
  theme="ocean"
/>


⸻

## Example Workflows

See [examples/WORKFLOWS.md](./examples/WORKFLOWS.md)

Real-world workflows

Team Scheduling
	•	employees as rows (timeline view)
	•	PTO / unavailable blocks
	•	automatic open shift creation
	•	coverage assignment
	•	mirrored covering shifts

⸻

Dashboard / Personal Views
	•	filter by status, owner, priority, tags
	•	save multiple views
	•	switch contexts instantly

⸻

Multi-source Calendar
	•	combine API events, ICS feeds, and internal data
	•	filter everything in one place

⸻

Key Features
	•	📅 Multiple views (month, week, day, schedule, agenda, timeline)
	•	🔍 Schema-driven filtering system
	•	💾 Saved views (persist and switch instantly)
	•	🧠 PTO → open shift → coverage workflow
	•	🔁 Recurring events engine
	•	🧩 Custom render hooks (events, toolbar, UI)
	•	🔌 DataAdapter pattern (backend-agnostic)
	•	📥 External form support (CalendarExternalForm)
	•	⚡ Optional realtime (Supabase)
	•	🎨 Theme system (light, dark, aviation, ocean, etc.)
	•	🧪 Example library with runnable demos

⸻

Quick start

npm install
npm run dev
npm run examples


⸻

Installation (library usage)

import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';

<WorksCalendar
  events={events}
  onEventSave={handleSave}
/>


⸻

Schedule workflow (Timeline view)

Click an employee in the timeline to:
	•	Edit Schedule
	•	Request PTO
	•	Edit Availability

⸻

Automatic logic

If PTO/unavailable overlaps a shift:
	1.	shift becomes uncovered
	2.	open shift is created
	3.	coverage can be assigned

⸻

Coverage
	•	assign another employee
	•	original shift updates
	•	covering employee receives a mirrored shift

⸻

Event meta example

{
  shiftStatus: 'pto',       // 'pto' | 'unavailable'
  coveredBy: 'employee-id'
}


⸻

Filtering system

Filters are schema-driven:

const filterSchema = [
  { key: 'owner', type: 'select' },
  { key: 'priority', type: 'multi-select' },
  { key: 'status', type: 'select' },
  { key: 'dueDate', type: 'date-range' }
];


⸻

Supported filter types
	•	select
	•	multi-select
	•	boolean
	•	date-range
	•	text

⸻

Saved views
	•	save any filter combination
	•	switch instantly
	•	persist per calendar instance

⸻

DataAdapter pattern

Decouple UI from backend logic.

import { CalendarExternalForm, createLocalStorageDataAdapter } from 'works-calendar';

const adapter = createLocalStorageDataAdapter({ key: 'events' });

<CalendarExternalForm adapter={adapter} />


⸻

External Form (CalendarExternalForm)

Standalone event intake form.

Use cases:
	•	public scheduling requests
	•	mobile workflows
	•	role-separated input

⸻

Examples

npm run examples

Includes:
	•	setup wizard onboarding
	•	advanced filters
	•	schedule workflow
	•	external form usage
	•	data adapters

⸻

Documentation
	•	Schedule Workflow￼
	•	Filtering System￼
	•	Prompt Examples￼
	•	Setup Wizard￼
	•	Advanced Filters￼
	•	Data Adapter￼

⸻

Theming

import 'works-calendar/styles';
import 'works-calendar/styles/ocean';

<WorksCalendar theme="ocean" />

Available themes:
light, dark, aviation, soft, minimal, corporate, forest, ocean

⸻

License

Free for:
	•	personal use
	•	open source
	•	non-commercial projects

Commercial license required for:
	•	internal company tools
	•	SaaS products
	•	client work

⸻

Roadmap
	•	expanded adapters (REST, Supabase, Microsoft 365)
	•	deeper schedule template workflows
	•	more examples
	•	optional hosted backend starter kits

⸻

Contributing

See docs/Contributing.md

---

