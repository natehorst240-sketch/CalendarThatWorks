import { useEffect, useState } from 'react';
import { WorksCalendar } from 'works-calendar';

const CALENDAR_ID = 'hero-conflict';

const employees = [
  { id: 'emp-cx1', name: 'Jordan Lee',  role: 'Field Tech', color: '#f97316' },
  { id: 'emp-cx2', name: 'Sam Rivera',  role: 'Field Tech', color: '#0ea5e9' },
];

function seedConflictConfig() {
  if (typeof window === 'undefined') return;
  try {
    const { saveConfig, loadConfig } = require('works-calendar') as any;
    if (typeof saveConfig !== 'function') return;
    const existing = loadConfig?.(CALENDAR_ID) ?? {};
    saveConfig(CALENDAR_ID, {
      ...existing,
      setup: { completed: true },
      conflicts: {
        enabled: true,
        rules: [{ id: 'r1', type: 'resource-overlap', severity: 'soft' }],
      },
    });
  } catch {
    // saveConfig not available in this build — conflict highlighting uses prop-level config
  }
}

function getConflictEvents() {
  const d = new Date();
  d.setDate(10);
  d.setHours(0, 0, 0, 0);
  function at(dayOff: number, h: number, m = 0) {
    const x = new Date(d);
    x.setDate(x.getDate() + dayOff);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  }
  return [
    { id: 'cx1', title: 'Site inspection A', start: at(1, 9),  end: at(1, 12), resource: 'emp-cx1', color: '#f97316', category: 'shift'   },
    { id: 'cx2', title: 'Emergency callout', start: at(1, 10), end: at(1, 13), resource: 'emp-cx1', color: '#ef4444', category: 'shift'   },
    { id: 'cx3', title: 'Maintenance run',   start: at(3, 8),  end: at(3, 16), resource: 'emp-cx2', color: '#0ea5e9', category: 'shift'   },
    { id: 'cx4', title: 'Inventory check',   start: at(5, 10), end: at(5, 11), resource: 'emp-cx2', color: '#0ea5e9', category: 'meeting' },
  ];
}

type CalEvent = ReturnType<typeof getConflictEvents>[number];

export default function ConflictDemo() {
  const [events, setEvents] = useState<CalEvent[]>(getConflictEvents);

  useEffect(() => {
    seedConflictConfig();
  }, []);

  function handleSave(ev: any) {
    setEvents(prev => {
      const i = prev.findIndex(e => e.id === ev.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], ...ev };
        return next;
      }
      return [...prev, ev];
    });
  }

  function handleDelete(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id));
  }

  return (
    <div className="grid lg:grid-cols-2 gap-12 items-center">
      <div
        className="order-2 lg:order-1 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        style={{ height: 480 }}
      >
        <WorksCalendar
          calendarId={CALENDAR_ID}
          events={events}
          employees={employees}
          onEventSave={handleSave}
          onEventDelete={handleDelete}
          initialView="month"
          showAddButton
          theme="canvas-dark"
        />
      </div>
      <div className="order-1 lg:order-2">
        <div className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-3">
          Conflict engine
        </div>
        <h2 className="text-4xl font-bold mb-4">
          No double-booking.<br />No excuses.
        </h2>
        <p className="text-white/60 text-lg leading-relaxed mb-6">
          The conflict engine checks every save against active rules — resource overlap,
          minimum rest, category mutex. Soft violations warn, hard violations block.
        </p>
        <ul className="space-y-2 text-white/50 text-sm">
          {[
            'Resource-overlap detection',
            'Minimum rest rules',
            'Category mutex rules',
            'Inline live conflict preview',
          ].map(f => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-red-400">✓</span> {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
