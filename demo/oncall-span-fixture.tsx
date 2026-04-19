// @ts-nocheck — demo fixture, re-typed after Phase 2 d.ts regeneration
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { addDays, startOfMonth } from 'date-fns';
import { WorksCalendar } from '../src/index.ts';

function firstMondayInMonth(baseDate) {
  let day = startOfMonth(baseDate);
  while (day.getDay() !== 1) {
    day = addDays(day, 1);
  }
  return day;
}

const monthBase = new Date();
monthBase.setHours(0, 0, 0, 0);
const start = firstMondayInMonth(monthBase);
const endExclusive = addDays(start, 3);

const events = [
  {
    id: 'oncall-short-span',
    title: 'On Call',
    start: start.toISOString(),
    end: endExclusive.toISOString(),
    category: 'oncall',
    resource: 'emp-alpha',
    color: '#ef4444',
    allDay: true,
  },
];

const employees = [
  { id: 'emp-alpha', name: 'Alpha Engineer', role: 'Engineer', color: '#ef4444' },
];

function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#e2e8f0', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1220, margin: '0 auto', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>On-call span fixture</h1>
          <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 14 }}>Short on-call span should stop mid-week instead of filling the entire week row.</p>
        </div>
        <div style={{ height: 'min(860px, calc(100vh - 92px))' }}>
          <WorksCalendar
            events={events}
            employees={employees}
            calendarId="oncall-span-fixture"
            theme="light"
            showAddButton={false}
            initialView="month"
          />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
