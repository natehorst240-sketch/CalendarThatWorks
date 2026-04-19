// @ts-nocheck — demo fixture, re-typed after Phase 2 d.ts regeneration
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { addDays, startOfMonth } from 'date-fns';
import { WorksCalendar } from '../src/index.ts';

function firstMondayInMonth(baseDate) {
  let day = startOfMonth(baseDate);
  while (day.getDay() !== 1) day = addDays(day, 1);
  return day;
}

const base = new Date();
base.setHours(0, 0, 0, 0);
const monday = firstMondayInMonth(base);

const events = [
  {
    id: 'source-a-span',
    title: 'Source A Span',
    start: monday.toISOString(),
    end: addDays(monday, 3).toISOString(),
    allDay: true,
    category: 'Project',
    color: '#2563eb',
    meta: { sourceLabel: 'Source A' },
  },
  {
    id: 'source-b-span',
    title: 'Source B Span',
    start: monday.toISOString(),
    end: addDays(monday, 3).toISOString(),
    allDay: true,
    category: 'Project',
    color: '#dc2626',
    meta: { sourceLabel: 'Source B' },
  },
];

function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#e2e8f0', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1220, margin: '0 auto', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>Source overlap stacking fixture</h1>
          <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 14 }}>Two same-span pills from different sources should stack vertically, not render on top of each other.</p>
        </div>
        <div style={{ height: 'min(860px, calc(100vh - 92px))' }}>
          <WorksCalendar
            events={events}
            calendarId="source-stack-fixture"
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
