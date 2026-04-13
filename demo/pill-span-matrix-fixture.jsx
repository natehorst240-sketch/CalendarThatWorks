import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { addDays, startOfMonth } from 'date-fns';
import { WorksCalendar } from '../src/index.js';

function firstMondayInMonth(baseDate) {
  let day = startOfMonth(baseDate);
  while (day.getDay() !== 1) day = addDays(day, 1);
  return day;
}

const base = new Date();
base.setHours(0, 0, 0, 0);
const monday = firstMondayInMonth(base);

function iso(day) {
  return day.toISOString();
}

const matrixCases = [
  {
    id: 'case-sameweek-oncall',
    title: 'On Call Matrix',
    category: 'on-call',
    color: '#ef4444',
    start: monday,
    endExclusive: addDays(monday, 3),
    allDay: true,
  },
  {
    id: 'case-sameweek-pto',
    title: 'PTO Matrix',
    category: 'PTO',
    color: '#10b981',
    start: addDays(monday, 1),
    endExclusive: addDays(monday, 3),
    allDay: true,
  },
  {
    id: 'case-crossweek-deploy',
    title: 'Deploy Matrix',
    category: 'Deploy',
    color: '#8b5cf6',
    start: addDays(monday, 4),
    endExclusive: addDays(monday, 8),
    allDay: true,
  },
  {
    id: 'case-crossweek-incident',
    title: 'Incident Matrix',
    category: 'Incident',
    color: '#f59e0b',
    start: addDays(monday, 5),
    endExclusive: addDays(monday, 9),
    allDay: true,
  },
];

const events = matrixCases.map((item) => ({
  id: item.id,
  title: item.title,
  start: iso(item.start),
  end: iso(item.endExclusive),
  category: item.category,
  color: item.color,
  resource: 'emp-alpha',
  allDay: item.allDay,
}));

const employees = [
  { id: 'emp-alpha', name: 'Alpha Engineer', role: 'Engineer', color: '#2563eb' },
];

function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#e2e8f0', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1220, margin: '0 auto', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>Month pill span matrix fixture</h1>
          <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 14 }}>Multiple same-week and cross-week multi-day events for month span rendering assertions.</p>
        </div>
        <div style={{ height: 'min(860px, calc(100vh - 92px))' }}>
          <WorksCalendar
            events={events}
            employees={employees}
            calendarId="pill-span-matrix-fixture"
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
