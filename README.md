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
