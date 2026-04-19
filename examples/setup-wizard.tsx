import { useState } from 'react';
import { WorksCalendar } from '../src/index.ts';

const EVENTS = [
  { id: 'wiz-1', title: 'Owner Onboarding', start: new Date(), end: new Date(Date.now() + 3600000), category: 'Onboarding' },
];

export function SetupWizardExample() {
  const [events, setEvents] = useState(EVENTS);

  return (
    <div style={{ height: '100%' }}>
      <WorksCalendar
        calendarId="setup-wizard-example"
        ownerPassword="change-me-in-real-apps"
        events={events}
        showAddButton
        onEventSave={(ev) => setEvents(prev => [...prev.filter(e => e.id !== ev.id), ev])}
      />
    </div>
  );
}
