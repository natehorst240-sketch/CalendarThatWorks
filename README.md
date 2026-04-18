# WorksCalendar

WorksCalendar is an embeddable React calendar focused on **real scheduling workflows** (team coverage, PTO handling, saved filtered views) instead of a single static calendar screen.

## Highlights

- Multiple calendar modes: month, week, day, agenda, schedule, timeline
- Schema-driven filtering and saved views
- Team scheduling workflow (PTO/unavailable → uncovered shift → coverage)
- External intake form component (`CalendarExternalForm`)
- Themeable UI with optional packaged themes
- Data adapter pattern for backend-agnostic integrations

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

- [Docs index](./docs/README.md)
- [Schedule workflow guide](./docs/ScheduleWorkflow.md)
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
