import { useState } from 'react';
import { WorksCalendar } from 'works-calendar';

const employees = [
  { id: 'emp-alex',  name: 'Alex Chen',    role: 'Engineer', color: '#6366f1' },
  { id: 'emp-maria', name: 'Maria Santos', role: 'Designer', color: '#ec4899' },
  { id: 'emp-dev',   name: 'Dev Patel',    role: 'Product',  color: '#14b8a6' },
];

function seedEvents() {
  const monday = new Date();
  monday.setDate(monday.getDate() - monday.getDay() + 1);
  monday.setHours(0, 0, 0, 0);
  function at(dayOffset: number, hour: number, minute = 0) {
    const d = new Date(monday);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  }
  return [
    { id: 'h1', title: 'Sprint planning',  start: at(0, 9),  end: at(0, 10, 30), resource: 'emp-alex',  color: '#6366f1', category: 'meeting' },
    { id: 'h2', title: 'Design review',    start: at(1, 14), end: at(1, 15, 30), resource: 'emp-maria', color: '#ec4899', category: 'meeting' },
    { id: 'h3', title: 'On-call shift',    start: at(1, 8),  end: at(1, 17),     resource: 'emp-dev',  color: '#14b8a6', category: 'shift'   },
    { id: 'h4', title: 'Client demo',      start: at(2, 10), end: at(2, 11),     resource: 'emp-alex', color: '#f59e0b', category: 'meeting' },
    { id: 'h5', title: 'Component audit',  start: at(3, 13), end: at(3, 15),     resource: 'emp-maria',color: '#ec4899', category: 'task'    },
    { id: 'h6', title: 'Roadmap review',   start: at(4, 15), end: at(4, 16),     resource: 'emp-dev',  color: '#14b8a6', category: 'meeting' },
  ];
}

type CalEvent = ReturnType<typeof seedEvents>[number];

export default function HeroCalendar() {
  const [events, setEvents] = useState<CalEvent[]>(seedEvents);

  function handleSave(ev: any) {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...ev };
        return next;
      }
      return [...prev, ev];
    });
  }

  function handleMove(ev: any, start: Date, end: Date) {
    setEvents(prev =>
      prev.map(e => e.id === ev.id ? { ...e, start: start.toISOString(), end: end.toISOString() } : e)
    );
  }

  function handleDelete(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id));
  }

  return (
    <div className="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3">
          Core scheduling
        </div>
        <h2 className="text-4xl font-bold mb-4">Drag. Drop. Done.</h2>
        <p className="text-white/60 text-lg leading-relaxed mb-6">
          Full week and month scheduling with drag-and-drop, multi-resource views,
          and instant event editing. Embed in minutes, own it forever.
        </p>
        <ul className="space-y-2 text-white/50 text-sm">
          {[
            'Month, Week, Day, Agenda, Schedule views',
            'Drag-to-move and drag-to-resize',
            'Multi-resource row layout',
            'Recurring event support',
          ].map(f => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-brand-400">✓</span> {f}
            </li>
          ))}
        </ul>
      </div>
      <div
        className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        style={{ height: 520 }}
      >
        <WorksCalendar
          calendarId="hero-main"
          events={events}
          employees={employees}
          onEventSave={handleSave}
          onEventMove={handleMove}
          onEventDelete={handleDelete}
          initialView="week"
          showAddButton
          theme="canvas-dark"
        />
      </div>
    </div>
  );
}
