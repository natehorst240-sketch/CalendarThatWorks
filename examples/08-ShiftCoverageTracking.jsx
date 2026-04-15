/**
 * Example 8 — Shift Coverage Tracking
 *
 * Demonstrates the current employee-action-card workflow for shift coverage
 * in the Schedule (Timeline) view.
 *
 * ── The workflow ──────────────────────────────────────────────────────────────
 *
 *  1. OPEN THE EMPLOYEE ACTION CARD
 *     In Schedule view, click an employee row and choose:
 *       • Edit Schedule
 *       • Request PTO
 *       • Edit Availability
 *     PTO / availability requests are created from this action card workflow.
 *
 *  2. SHIFT BECOMES UNCOVERED
 *     If PTO or unavailable time overlaps an on-call shift, the shift is
 *     automatically marked as uncovered and shown as an open coverage need.
 *
 *  3. ASSIGN COVERAGE
 *     Assign another employee to cover the open shift.
 *
 *  4. SHIFT COVERED
 *     The original shift updates to show coverage and the covering employee
 *     receives a mirrored on-call assignment for the same dates.
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          Try the current workflow
        </div>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>
          In <strong>Schedule</strong> view, click an employee row to open the action card, then use
          <strong> Request PTO</strong> or <strong>Edit Availability</strong>. Overlapping on-call shifts
          become uncovered and can be reassigned.
        </div>
      </div>
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
