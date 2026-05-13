import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  WorksCalendar,
  PoolBuilder,
  OfflineIndicator,
  evaluateConflicts,
  exportToExcel,
  useSavedViews,
  useBookingHold,
} from '../src/index';
import type {
  WorksCalendarEvent,
  ReminderDef,
  ConflictRule,
  ResourcePool,
} from '../src/index';
import '../src/styles/soft.css';

// ── Sample events (with reminders) ────────────────────────────────────────

const BASE_EVENTS: WorksCalendarEvent[] = [
  {
    id: '1',
    title: 'Team Sync',
    start: new Date(2026, 4, 11, 9),
    end:   new Date(2026, 4, 11, 10),
    resource: 'alice',
    reminders: [
      { minutesBefore: 10, method: 'callback' } satisfies ReminderDef,
    ],
  },
  {
    id: '2',
    title: 'Design Review',
    start: new Date(2026, 4, 13, 14),
    end:   new Date(2026, 4, 13, 15),
    resource: 'alice',
    reminders: [
      { minutesBefore: 15, method: 'browser' } satisfies ReminderDef,
      { minutesBefore: 5,  method: 'callback' } satisfies ReminderDef,
    ],
  },
  {
    id: '3',
    title: 'Sprint Planning',
    start: new Date(2026, 4, 15, 10),
    end:   new Date(2026, 4, 15, 11),
    resource: 'bob',
  },
  {
    id: '4',
    title: 'Retrospective',
    start: new Date(2026, 4, 11, 11),
    end:   new Date(2026, 4, 11, 12),
    resource: 'alice',
  },
];

// ── Conflict rules ─────────────────────────────────────────────────────────

const CONFLICT_RULES: ConflictRule[] = [
  { type: 'resource-overlap', id: 'no-double-book', severity: 'hard' },
  { type: 'min-rest', id: '30min-gap', minutes: 30, severity: 'soft' },
];

// ── Sample pools (for PoolBuilder demo) ───────────────────────────────────

const INITIAL_POOLS: ResourcePool[] = [
  {
    id: 'pool-pilots',
    name: 'Pilots',
    memberIds: ['alice'],
    type: 'manual',
    strategy: 'first-available',
  },
];

// ── Booking holds demo ─────────────────────────────────────────────────────

function HoldDemo() {
  const { acquireHold, releaseHold, heldSlot } = useBookingHold({ holdDurationMs: 30_000 });
  return (
    <div style={{ padding: '8px 16px', background: '#f0f9ff', borderRadius: 8, marginBottom: 16 }}>
      <strong>Booking hold:</strong>{' '}
      {heldSlot
        ? `Holding ${heldSlot.start.toLocaleTimeString()} – ${heldSlot.end.toLocaleTimeString()} `
        : 'No active hold. '}
      <button
        onClick={() =>
          acquireHold({
            start: new Date(2026, 4, 20, 10),
            end:   new Date(2026, 4, 20, 11),
            resourceId: 'alice',
          })
        }
        disabled={!!heldSlot}
      >
        Acquire hold
      </button>{' '}
      <button onClick={releaseHold} disabled={!heldSlot}>
        Release
      </button>
    </div>
  );
}

// ── Saved-views demo ───────────────────────────────────────────────────────

function SavedViewsBar() {
  const { savedViews, saveView, applyView, deleteView } = useSavedViews('demo-calendar');
  return (
    <div style={{ padding: '8px 16px', background: '#fefce8', borderRadius: 8, marginBottom: 16 }}>
      <strong>Saved views:</strong>{' '}
      {savedViews.length === 0 && <span>None saved yet.</span>}
      {savedViews.map(v => (
        <span key={v.id} style={{ marginRight: 8 }}>
          <button onClick={() => applyView(v.id)}>{v.name}</button>
          <button onClick={() => deleteView(v.id)} style={{ marginLeft: 2 }}>✕</button>
        </span>
      ))}
      <button
        style={{ marginLeft: 8 }}
        onClick={() => saveView({ name: `View ${savedViews.length + 1}` })}
      >
        Save current view
      </button>
    </div>
  );
}

// ── Main app ───────────────────────────────────────────────────────────────

function App() {
  const [evts, setEvts] = React.useState(BASE_EVENTS);
  const [pools, setPools] = React.useState(INITIAL_POOLS);
  const [editingPool, setEditingPool] = React.useState<ResourcePool | null>(null);
  const [showPoolBuilder, setShowPoolBuilder] = React.useState(false);

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      {/* Offline banner — auto-shows when browser goes offline */}
      <OfflineIndicator />

      <div style={{ padding: '16px 16px 0' }}>
        <h2 style={{ margin: '0 0 12px' }}>WorksCalendar — Advanced API Demo</h2>

        {/* Booking hold */}
        <HoldDemo />

        {/* Saved views */}
        <SavedViewsBar />

        {/* Export button */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={async () => {
              // exportToExcel accepts NormalizedEvent[]; here we pass raw events
              // which have the same shape at the fields exportToExcel reads.
              await exportToExcel(evts as any, 'demo-events');
            }}
          >
            Export to Excel / CSV
          </button>
        </div>

        {/* Pool Builder */}
        <div style={{ marginBottom: 16 }}>
          <strong>Resource pools:</strong>{' '}
          {pools.map(p => (
            <span key={p.id} style={{ marginRight: 8 }}>
              {p.name}{' '}
              <button onClick={() => { setEditingPool(p); setShowPoolBuilder(true); }}>
                Edit
              </button>
            </span>
          ))}
          <button onClick={() => { setEditingPool(null); setShowPoolBuilder(true); }}>
            + New pool
          </button>
        </div>

        {showPoolBuilder && (
          <PoolBuilder
            pool={editingPool}
            resources={[]}
            onSave={(next) => {
              setPools(prev =>
                editingPool
                  ? prev.map(p => p.id === next.id ? next : p)
                  : [...prev, next]
              );
              setShowPoolBuilder(false);
            }}
            onCancel={() => setShowPoolBuilder(false)}
          />
        )}
      </div>

      {/* Main calendar */}
      <div style={{ height: 'calc(100vh - 280px)', padding: '0 16px 16px' }}>
        <WorksCalendar
          calendarId="demo-calendar"
          defaultView="month"
          events={evts}
          showOfflineIndicator={false}       // OfflineIndicator mounted standalone above
          showCalendarLegend={true}
          permissions={{ canDrag: true }}
          pools={pools}
          onPoolsChange={(next) => setPools(next)}
          onEventMove={(ev, newStart, newEnd) =>
            setEvts(prev => prev.map(e => e.id === ev.id ? { ...e, start: newStart, end: newEnd } : e))
          }
          onConflictCheck={(proposed, existingEvents) =>
            evaluateConflicts({ proposed, events: existingEvents, rules: CONFLICT_RULES })
          }
          onReminder={(event, reminder) => {
            console.log(`Reminder: "${event.title}" starts in ${reminder.minutesBefore} min`);
          }}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
