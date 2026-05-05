import { useState } from 'react';
import { WorksCalendar } from 'works-calendar';

const THEMES = [
  { id: 'canvas-light',     label: 'Canvas Light'     },
  { id: 'canvas-dark',      label: 'Canvas Dark'      },
  { id: 'corporate-light',  label: 'Corporate Light'  },
  { id: 'corporate-dark',   label: 'Corporate Dark'   },
  { id: 'industrial-light', label: 'Industrial Light' },
  { id: 'industrial-dark',  label: 'Industrial Dark'  },
] as const;

type ThemeId = typeof THEMES[number]['id'];

const employees = [
  { id: 'te1', name: 'Quinn Adams',  role: 'Analyst', color: '#6366f1' },
  { id: 'te2', name: 'Riley Brooks', role: 'Manager', color: '#f59e0b' },
];

function themeEvents() {
  const d = new Date();
  d.setDate(10);
  d.setHours(0, 0, 0, 0);
  function at(off: number, h: number, m = 0) {
    const x = new Date(d);
    x.setDate(x.getDate() + off);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  }
  return [
    { id: 'te1', title: 'Strategy sync', start: at(1, 9),  end: at(1, 10), resource: 'te1', color: '#6366f1', category: 'meeting' },
    { id: 'te2', title: 'Budget review', start: at(2, 14), end: at(2, 15), resource: 'te2', color: '#f59e0b', category: 'meeting' },
    { id: 'te3', title: 'All-hands',     start: at(3, 10), end: at(3, 11), resource: 'te1', color: '#6366f1', category: 'meeting' },
  ];
}

export default function ThemeShowcase() {
  const [theme, setTheme] = useState<ThemeId>('canvas-dark');
  const [events] = useState(themeEvents);

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="text-xs font-semibold text-yellow-400 uppercase tracking-widest mb-3">
          Theming
        </div>
        <h2 className="text-4xl font-bold mb-3">Fits your brand, out of the box.</h2>
        <p className="text-white/60 text-lg mb-6">
          Six built-in theme families. CSS variable overrides for everything else.
        </p>
        <div className="inline-flex flex-wrap gap-2 justify-center">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                theme === t.id
                  ? 'bg-brand-600 border-brand-500 text-white'
                  : 'border-white/15 text-white/50 hover:border-white/30 hover:text-white/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        style={{ height: 460 }}
      >
        <WorksCalendar
          calendarId="hero-theme"
          events={events}
          employees={employees}
          onEventSave={() => {}}
          initialView="month"
          theme={theme}
        />
      </div>
    </div>
  );
}
