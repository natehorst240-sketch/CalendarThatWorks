/**
 * eventModel.js — Normalize any incoming event shape into a consistent internal format.
 */
import { parseISO, isValid, addHours } from 'date-fns';

let _idCounter = 0;
function uid() { return `wc-${++_idCounter}`; }

/** Parse anything into a Date (or null). */
function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isValid(val) ? val : null;
  if (typeof val === 'number') { const d = new Date(val); return isValid(d) ? d : null; }
  if (typeof val === 'string') { const d = parseISO(val); return isValid(d) ? d : null; }
  return null;
}

const CATEGORY_COLORS = [
  '#3b82f6','#f59e0b','#ef4444','#10b981',
  '#8b5cf6','#ec4899','#06b6d4','#f97316',
];
const _catColorMap = new Map();
let _catColorIdx = 0;
function categoryColor(cat) {
  if (!cat) return CATEGORY_COLORS[0];
  if (!_catColorMap.has(cat)) {
    const idx = _catColorIdx++;
    // Use the curated palette for the first 8 categories; beyond that derive
    // colours via the golden-angle hue distribution so they stay visually
    // distinct without ever repeating.
    const color = idx < CATEGORY_COLORS.length
      ? CATEGORY_COLORS[idx]
      : `hsl(${Math.round((idx * 137.508) % 360)}, 62%, 45%)`;
    _catColorMap.set(cat, color);
  }
  return _catColorMap.get(cat);
}

/**
 * Normalize a raw event object into the internal event shape.
 */
export function normalizeEvent(raw) {
  const start = toDate(raw.start) || new Date();
  const end   = toDate(raw.end)   || addHours(start, 1);

  return {
    id:       raw.id       ?? uid(),
    title:    raw.title    ?? '(untitled)',
    start,
    end,
    allDay:   raw.allDay   ?? false,
    category: raw.category ?? null,
    color:    raw.color    ?? categoryColor(raw.category),
    resource: raw.resource ?? null,
    /** 'confirmed' (default) | 'tentative' (striped) | 'cancelled' (strikethrough) */
    status:   raw.status   ?? 'confirmed',
    /** iCal RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR" */
    rrule:    raw.rrule    ?? null,
    /** Dates excluded from the recurrence rule. */
    exdates:  raw.exdates  ?? [],
    meta:     raw.meta     ?? {},
    _raw:     raw,
  };
}

/**
 * Normalize an array of raw events.
 */
export function normalizeEvents(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizeEvent);
}
