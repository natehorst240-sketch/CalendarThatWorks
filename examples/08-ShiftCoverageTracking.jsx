/**
 * Example 8 — Shift Coverage Tracking
 *
 * Demonstrates the built-in shift coverage workflow available in the
 * Schedule (Timeline) view.
 *
 * ── The workflow ──────────────────────────────────────────────────────────────
 *
 *  1. MARK UNAVAILABLE
 *     Each on-call / on-shift event pill has a small ▾ toggle on its right
 *     edge.  Clicking it opens a dropdown with two options:
 *       • 🏖 Mark as PTO
 *       • 🚫 Mark as Unavailable
 *     Once marked, the pill shows a "PTO" or "Unavail." badge and the ▾
 *     turns amber (⚠).  "✕ Clear Status" is added to the dropdown.
 *
 *  2. SHIFT NOT COVERED pill
 *     A pulsing red pill — "⚠ Shift not covered / Available" — appears
 *     below the event bar, spanning the same date range.
 *
 *  3. PICK UP THE SHIFT
 *     Clicking the red pill opens a coverage picker popover that lists
 *     all other employees.  Selecting one records coverage.
 *
 *  4. SHIFT COVERED
 *     The red pill turns green: "✓ Shift covered by [Name]".
 *     In the covering employee's row a new indigo pill appears for those
 *     same dates: "📞 On call (covering for [Original Name])".
 *
 * ── How state is stored ───────────────────────────────────────────────────────
 *
 *  Coverage lives in each event's `meta` field:
 *    meta.shiftStatus  — 'pto' | 'unavailable' | undefined
 *    meta.coveredBy    — employee id string | undefined
 *
 *  The calendar engine persists these through `onEventSave`, so they
 *  round-trip with whatever backend you supply.
 *
 * ── Required props ────────────────────────────────────────────────────────────
 *
 *  No extra props are needed.  The workflow activates automatically in the
 *  Schedule view whenever `employees` is provided.
 *
 *  If you need to respond to coverage changes server-side, use `onEventSave`:
 *
 *    onEventSave={(ev) => {
 *      if (ev.meta?.shiftStatus) {
 *        // shift is unavailable
 *        const coveredBy = ev.meta.coveredBy; // employee id or undefined
 *        myApi.updateShiftCoverage(ev.id, { status: ev.meta.shiftStatus, coveredBy });
 *      }
 *    }}
 */

import { useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.js';

// ── Team ──────────────────────────────────────────────────────────────────────

const TEAM = [
  { id: 'alice', name: 'Alice Park',  role: 'Engineering Lead', color: '#3b82f6' },
  { id: 'ben',   name: 'Ben Torres',  role: 'Senior Engineer',  color: '#10b981' },
  { id: 'carla', name: 'Carla Singh', role: 'DevOps / SRE',     color: '#f59e0b' },
  { id: 'dan',   name: 'Dan Okafor',  role: 'Site Reliability', color: '#8b5cf6' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const now = new Date();

/** Return a Date offset by `days` from today, clamped to midnight. */
function day(offsetDays) {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

let _id = 1;
const uid = () => `sc-${_id++}`;

// ── Seed events ───────────────────────────────────────────────────────────────
//
// On-call events use category: 'on-call' (the default onCallCategory value).
// They get the striped pill style and the ▾ availability toggle automatically.
//
// The third event demonstrates a pre-seeded "already marked as PTO + covered"
// state so you can see the green pill and covering-for pill on first load.

const INITIAL_EVENTS = [
  // Alice — regular on-call week
  {
    id: uid(),
    title: 'On Call',
    resource: 'alice',
    category: 'on-call',
    start: day(0),
    end: day(6),
    allDay: true,
    color: '#3b82f6',
  },

  // Ben — regular on-call week (try marking this as PTO)
  {
    id: uid(),
    title: 'On Call',
    resource: 'ben',
    category: 'on-call',
    start: day(7),
    end: day(13),
    allDay: true,
    color: '#10b981',
  },

  // Carla — pre-seeded as PTO, already covered by Dan.
  // Shows the green "Shift covered by Dan Okafor" pill in Carla's row
  // and the indigo "On call (covering for Carla Singh)" pill in Dan's row.
  {
    id: uid(),
    title: 'On Call',
    resource: 'carla',
    category: 'on-call',
    start: day(14),
    end: day(20),
    allDay: true,
    color: '#f59e0b',
    meta: {
      shiftStatus: 'pto',
      coveredBy:   'dan',
    },
  },

  // A few non-on-call events to fill the view
  {
    id: uid(), title: 'Sprint Planning',  resource: 'alice', category: 'Meeting',
    start: day(1), end: day(2), allDay: true, color: '#64748b',
  },
  {
    id: uid(), title: 'Deploy v3.1',      resource: 'carla', category: 'Deploy',
    start: day(2), end: day(3), allDay: true, color: '#ef4444',
  },
  {
    id: uid(), title: 'Infra Review',     resource: 'dan',   category: 'Review',
    start: day(0), end: day(1), allDay: true, color: '#8b5cf6',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ShiftCoverageTracking() {
  const [events, setEvents] = useState(INITIAL_EVENTS);

  // onEventSave is called by the engine after every mutation, including
  // shift-status and coverage changes.  Persist to your API here.
  const handleSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = ev;
        return next;
      }
      return [...prev, { ...ev, id: `sc-${Date.now()}` }];
    });
  }, []);

  return (
    <div style={{ height: '100%' }}>
      <WorksCalendar
        devMode
        calendarId="shift-coverage-example"
        events={events}
        employees={TEAM}
        initialView="schedule"
        showAddButton
        onEventSave={handleSave}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  );
}
