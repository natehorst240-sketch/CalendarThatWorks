/**
 * Example 9 — Grouping & Sort
 *
 * Sprint 9 ("infinite grouping") story patterns, all in one page.  Use the
 * preset picker to flip between scenarios; each preset swaps `groupBy`,
 * `sort`, and `showAllGroups` on the same event dataset.
 *
 * Key props demonstrated:
 *   groupBy        — string | string[] | GroupConfig[] (1-, 2-, 3-level nesting)
 *   sort           — SortConfig | SortConfig[] (multi-field tiebreakers)
 *   showAllGroups  — surface empty groups + cross-group copies
 *
 * The same presets round-trip through saved views: pick a preset, save it as
 * a named view, reload, restore.
 */
import { useMemo, useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = new Date();
function at(offsetDays, hour = 9, min = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d;
}
let _id = 1;
const uid = () => `evt-${_id++}`;

// ── Event data ────────────────────────────────────────────────────────────────
// Clinic schedule: each event has role + shift + location, so you can
// group by 1, 2, or 3 dimensions in any order.
const EVENTS = [
  // Alice — Nurse · Day
  { id: uid(), title: 'Alice — Triage',  category: 'Shift', start: at(0,  7), end: at(0, 15), resource: 'Alice Chen',  role: 'Nurse',   shift: 'Day',   location: 'ICU',    priority: 2 },
  { id: uid(), title: 'Alice — Rounds',  category: 'Shift', start: at(1,  7), end: at(1, 15), resource: 'Alice Chen',  role: 'Nurse',   shift: 'Day',   location: 'ICU',    priority: 2 },
  { id: uid(), title: 'Alice — Clinic',  category: 'Shift', start: at(2,  8), end: at(2, 16), resource: 'Alice Chen',  role: 'Nurse',   shift: 'Day',   location: 'Clinic', priority: 3 },

  // Bob — Nurse · Night
  { id: uid(), title: 'Bob — On-call',   category: 'Shift', start: at(0, 19), end: at(1,  3), resource: 'Bob Smith',   role: 'Nurse',   shift: 'Night', location: 'ICU',    priority: 1 },
  { id: uid(), title: 'Bob — Night',    category: 'Shift', start: at(2, 19), end: at(3,  3), resource: 'Bob Smith',   role: 'Nurse',   shift: 'Night', location: 'ICU',    priority: 2 },

  // Carol — Doctor · Day
  { id: uid(), title: 'Carol — Rounds', category: 'Shift', start: at(0,  8), end: at(0, 17), resource: 'Carol Jones', role: 'Doctor',  shift: 'Day',   location: 'ICU',    priority: 1 },
  { id: uid(), title: 'Carol — Clinic', category: 'Shift', start: at(1,  9), end: at(1, 17), resource: 'Carol Jones', role: 'Doctor',  shift: 'Day',   location: 'Clinic', priority: 2 },
  { id: uid(), title: 'Carol — OR',     category: 'Shift', start: at(3,  7), end: at(3, 15), resource: 'Carol Jones', role: 'Doctor',  shift: 'Day',   location: 'OR',     priority: 1 },

  // Dan — Doctor · Night
  { id: uid(), title: 'Dan — On-call',   category: 'Shift', start: at(1, 19), end: at(2,  3), resource: 'Dan Park',    role: 'Doctor',  shift: 'Night', location: 'ER',     priority: 1 },
  { id: uid(), title: 'Dan — Night',    category: 'Shift', start: at(3, 19), end: at(4,  3), resource: 'Dan Park',    role: 'Doctor',  shift: 'Night', location: 'ER',     priority: 2 },

  // Erin — Tech · Day (covers ICU + OR)
  { id: uid(), title: 'Erin — ICU Tech', category: 'Shift', start: at(0,  9), end: at(0, 17), resource: 'Erin Patel',  role: 'Tech',    shift: 'Day',   location: 'ICU',    priority: 3 },
  { id: uid(), title: 'Erin — OR Tech',  category: 'Shift', start: at(2,  9), end: at(2, 17), resource: 'Erin Patel',  role: 'Tech',    shift: 'Day',   location: 'OR',     priority: 3 },

  // One unassigned shift to demonstrate the "(Ungrouped)" bucket
  { id: uid(), title: 'Float — Pool',    category: 'Shift', start: at(4, 10), end: at(4, 18),                           role: 'Nurse',   shift: 'Day',   location: 'Float',  priority: 4 },
];

// ── Presets ───────────────────────────────────────────────────────────────────
// Each preset is the story-pattern from the Sprint 9 sheet.
const PRESETS = [
  {
    id:    'none',
    label: 'No grouping',
    desc:  'Baseline — flat agenda with no groupBy.',
    groupBy:      null,
    sort:         [{ field: 'start', direction: 'asc' }],
    showAllGroups: false,
  },
  {
    id:    'one-level',
    label: '1-level: role',
    desc:  'Group by role. Counts are live and update with filters.',
    groupBy:      'role',
    sort:         [{ field: 'start', direction: 'asc' }],
    showAllGroups: false,
  },
  {
    id:    'two-level',
    label: '2-level: role → shift',
    desc:  'Nested: each role splits into Day / Night buckets.',
    groupBy:      ['role', 'shift'],
    sort:         [{ field: 'start', direction: 'asc' }],
    showAllGroups: false,
  },
  {
    id:    'three-level',
    label: '3-level: role → shift → location',
    desc:  'Deep nesting. Collapsing a parent hides all descendants.',
    groupBy:      ['role', 'shift', 'location'],
    sort:         [{ field: 'priority', direction: 'asc' }, { field: 'start', direction: 'asc' }],
    showAllGroups: false,
  },
  {
    id:    'show-all',
    label: 'showAllGroups: location',
    desc:  'Floating cross-covering shifts appear as copies in every matching group.',
    groupBy:      'location',
    sort:         [{ field: 'start', direction: 'asc' }],
    showAllGroups: true,
  },
  {
    id:    'sort-priority',
    label: 'Sort: priority asc, start asc',
    desc:  'Multi-field sort — priority first (1 = urgent), then start time as tiebreaker.',
    groupBy:      'role',
    sort:         [{ field: 'priority', direction: 'asc' }, { field: 'start', direction: 'asc' }],
    showAllGroups: false,
  },
  {
    id:    'empty-groups',
    label: 'Empty groups (GroupConfig)',
    desc:  'Pass GroupConfig[] with explicit showEmpty + label to surface zero-count groups.',
    groupBy: [
      { field: 'role',  label: 'Role',  showEmpty: true },
      { field: 'shift', label: 'Shift', showEmpty: true },
    ],
    sort:         [{ field: 'start', direction: 'asc' }],
    showAllGroups: false,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function GroupingExample() {
  const [presetId, setPresetId] = useState('two-level');
  const preset = useMemo(
    () => PRESETS.find(p => p.id === presetId) ?? PRESETS[0],
    [presetId],
  );

  const handleSave = useCallback(() => {
    /* no-op for demo — real apps would persist the event */
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Preset picker */}
      <div style={{
        padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Preset
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setPresetId(p.id)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: preset.id === p.id ? 700 : 400,
                  background: preset.id === p.id ? '#1e293b' : '#e2e8f0',
                  color:      preset.id === p.id ? '#fff'    : '#64748b',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          flex: '1 1 260px', minWidth: 0,
          fontSize: 11, color: '#475569', lineHeight: 1.5,
          padding: '6px 10px', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0',
        }}>
          <strong style={{ color: '#0f172a' }}>{preset.label}:</strong> {preset.desc}
          <br />
          <code style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
            {`groupBy=${JSON.stringify(preset.groupBy)} sort=${JSON.stringify(preset.sort)} showAllGroups=${preset.showAllGroups}`}
          </code>
        </div>
      </div>

      {/* Calendar */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorksCalendar
          devMode
          events={EVENTS}
          initialView="agenda"
          showAddButton
          groupBy={preset.groupBy ?? undefined}
          sort={preset.sort}
          showAllGroups={preset.showAllGroups}
          onEventSave={handleSave}
        />
      </div>
    </div>
  );
}
