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
  { id: 'source-a-single', title: 'Source A Single', start: monday, end: addDays(monday, 1), allDay: true, category: 'Project', color: '#2563eb' },
  { id: 'source-b-single', title: 'Source B Single', start: monday, end: addDays(monday, 1), allDay: true, category: 'Project', color: '#dc2626' },
];

function App() {
  return <WorksCalendar events={events} calendarId="source-single-stack-fixture" theme="light" showAddButton={false} initialView="month" />;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
