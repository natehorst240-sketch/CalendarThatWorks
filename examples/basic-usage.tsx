import { useState } from 'react';
import { WorksCalendar } from '../src/index.ts';

const now = new Date();
const addHours = (h) => new Date(now.getTime() + (h * 60 * 60 * 1000));

const INITIAL = [
  { id: 'basic-1', title: 'Kickoff', start: addHours(2), end: addHours(3), category: 'Meeting' },
  { id: 'basic-2', title: 'QA Sync', start: addHours(26), end: addHours(27), category: 'Ops' },
];

export function BasicUsageExample() {
  const [events, setEvents] = useState(INITIAL);

  return (
    <div style={{ height: '100%' }}>
      <WorksCalendar
        calendarId="basic-usage-example"
        theme="soft"
        showAddButton
        events={events}
        onEventSave={(ev) => setEvents(prev => [...prev.filter(e => e.id !== ev.id), ev])}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  );
}
