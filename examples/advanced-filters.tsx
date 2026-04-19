import { useState } from 'react';
import {
  WorksCalendar,
  DEFAULT_FILTER_SCHEMA,
  priorityField,
  ownerField,
  tagsField,
} from '../src/index.ts';

const schema = [...DEFAULT_FILTER_SCHEMA, priorityField(), ownerField(), tagsField()];

const seed = [
  {
    id: 'af-1',
    title: 'Incident: API timeout',
    start: new Date(),
    end: new Date(Date.now() + 3600000),
    category: 'Incident',
    resource: 'Alice',
    priority: 'high',
    owner: 'alice@company.com',
    tags: ['sev2', 'backend'],
  },
];

export function AdvancedFiltersExample() {
  const [events, setEvents] = useState(seed);

  return (
    <div style={{ height: '100%' }}>
      <WorksCalendar
        calendarId="advanced-filters-example"
        events={events}
        filterSchema={schema}
        onEventSave={(ev) => setEvents(prev => [...prev.filter(e => e.id !== ev.id), ev])}
      />
    </div>
  );
}
