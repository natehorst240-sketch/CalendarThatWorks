# WorksCalendar

WorksCalendar is an embeddable React calendar focused on **real scheduling workflows** (team coverage, PTO handling, saved filtered views) instead of a single static calendar screen.

**Website:** [workscalendar.com](https://workscalendar.com) · **Repository:** [github.com/workscalendar/calendarthatworks](https://github.com/workscalendar/calendarthatworks)

## Highlights

- Multiple calendar modes: month, week, day, agenda, schedule, timeline
- Schema-driven filtering and saved views
- Team scheduling workflow (PTO/unavailable → uncovered shift → coverage)
- External intake form component (`CalendarExternalForm`)
- Themeable UI with optional packaged themes
- Data adapter pattern for backend-agnostic integrations
- Declarative approval workflows with a sandboxed expression language — multi-tier approvals, SLA timers + escalation, parallel branches with quorum joins (`requireAll` / `requireAny` / `requireN`), and pluggable notification channels (Slack, email, webhook, or your own adapter)
- **Written in strict TypeScript**; ships with generated `.d.ts` so consumer types stay in lockstep with the implementation

## New here? Start with the [Setup guide](./docs/Setup.md)

Plain-language walkthrough from `npm install` to a working, connected calendar — pick only the steps you need.

## Installation

```bash
npm install works-calendar
```

## Quick start

```jsx
import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';
import 'works-calendar/styles/ocean';

export function App({ events, employees }) {
  return (
    <WorksCalendar
      events={events}
      employees={employees}
      initialView="schedule"
      theme="ocean"
    />
  );
}
```

## Examples

Run the local example suite:

```bash
npm install
npm run examples
```

Example catalogs:

- [Examples index](./examples/README.md)
- [Workflow mapping](./examples/WORKFLOWS.md)

## Documentation

- [Setup guide](./docs/Setup.md) — start here
- [Docs index](./docs/README.md)
- [Schedule workflow guide](./docs/ScheduleWorkflow.md)
- [Approval workflow DSL](./docs/Workflow.md)
- [Filtering system](./docs/Filtering.md)
- [Data adapter guide](./docs/DataAdapter.md)
- [Google Calendar setup](./docs/GoogleCalendarSetup.md)
- [Microsoft 365 setup](./docs/Microsoft365Setup.md)
- [Contributing](./docs/Contributing.md)

## Theming

Base styles:

```jsx
import 'works-calendar/styles';
```

Optional theme styles:

```jsx
import 'works-calendar/styles/ocean';
```

Included packaged themes: `aviation`, `soft`, `minimal`, `corporate`, `forest`, `ocean`.

## Release & project status

- [Release readiness checklist](./docs/release-readiness.md)
- [Product roadmap](./docs/Roadmap.md)
- [Initial release notes draft](./docs/releases/v0.1.0.md)

## License

MIT. See [LICENSE](./LICENSE).
