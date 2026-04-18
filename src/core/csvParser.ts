/**
 * csvParser — parse CSV files and map columns to CalendarEventV1 objects.
 *
 * Exports:
 *   parseCSV(text)                   → { headers, rows }
 *   suggestMapping(headers)          → Record<EventField, string>
 *   mapToEvents(rows, mapping, fmt)  → { events, errors }
 *   loadPresets()                    → CSVPreset[]
 *   savePreset(preset)               → void
 *   deletePreset(id)                 → void
 *
 * EVENT_FIELDS  — ordered list of mappable fields with metadata
 * DATE_FORMATS  — supported date-string formats
 */

// ── Event fields ──────────────────────────────────────────────────────────────

export const EVENT_FIELDS = [
  { key: 'title',    label: 'Title',          required: true,  hint: 'Event name / summary'        },
  { key: 'start',    label: 'Start',          required: true,  hint: 'Start date or date + time'   },
  { key: 'end',      label: 'End',            required: false, hint: 'End date or date + time'     },
  { key: 'allDay',   label: 'All-day',        required: false, hint: '"true" / "false" / "1" / "0"' },
  { key: 'category', label: 'Category',       required: false, hint: 'Meeting, Incident, PTO, …'   },
  { key: 'resource', label: 'Resource',       required: false, hint: 'Person, room, or team'        },
  { key: 'status',   label: 'Status',         required: false, hint: 'confirmed / tentative / cancelled' },
  { key: 'color',    label: 'Color',          required: false, hint: 'Hex color (#3b82f6)'          },
  { key: 'id',       label: 'ID',             required: false, hint: 'Unique identifier'            },
];

// ── Date formats ──────────────────────────────────────────────────────────────

export const DATE_FORMATS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'iso',  label: 'ISO 8601  (2026-04-10 or 2026-04-10T09:00)' },
  { value: 'mdy',  label: 'US  (04/10/2026 or 04/10/2026 09:00)' },
  { value: 'dmy',  label: 'EU  (10/04/2026 or 10/04/2026 09:00)' },
];

// ── CSV parser ────────────────────────────────────────────────────────────────

/**
 * Parse CSV text → { headers: string[], rows: Record<string, string>[] }
 * Handles quoted fields, embedded commas, and \" escapes.
 */
export function parseCSV(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // Skip leading blank lines
  const firstNonBlank = lines.findIndex(l => l.trim() !== '');
  if (firstNonBlank === -1) return { headers: [], rows: [] };

  const headers = _parseLine(lines[firstNonBlank]).map(h => h.trim());
  const rows = [];

  for (let i = firstNonBlank + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = _parseLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => { row[h] = (values[j] ?? '').trim(); });
    rows.push(row);
  }

  return { headers, rows };
}

function _parseLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ── Auto-suggest mapping ──────────────────────────────────────────────────────

/** Keywords that indicate each event field when matched against a CSV header. */
const FIELD_HINTS = {
  title:    ['title', 'name', 'summary', 'subject', 'event', 'headline'],
  start:    ['start', 'begin', 'from', 'startdate', 'starttime', 'date'],
  end:      ['end', 'finish', 'to', 'enddate', 'endtime', 'until', 'thru', 'through'],
  allDay:   ['allday', 'allday', 'wholeday', 'fullday'],
  category: ['category', 'type', 'kind', 'tag', 'label', 'group', 'class'],
  resource: ['resource', 'person', 'owner', 'assignee', 'employee', 'user', 'room', 'location'],
  status:   ['status', 'state', 'confirmed', 'tentative'],
  color:    ['color', 'colour'],
  id:       ['id', 'uid', 'identifier', 'key', 'ref'],
};

/**
 * Given a list of CSV column headers, return a best-guess field mapping.
 * Returns a Record<EventField, string> where value is the matched header.
 */
export function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();

  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    for (const header of headers) {
      if (used.has(header)) continue;
      const norm = header.toLowerCase().replace(/[\s_\-\.]/g, '');
      if (hints.some(h => norm === h || norm.includes(h) || h.includes(norm))) {
        mapping[field] = header;
        used.add(header);
        break;
      }
    }
  }

  return mapping;
}

// ── Map rows → events ─────────────────────────────────────────────────────────

/**
 * Convert CSV rows to CalendarEventV1 objects using a column mapping.
 *
 * mapping: Record<EventField key, CSV header string | ''>
 * dateFormat: 'auto' | 'iso' | 'mdy' | 'dmy'
 *
 * Returns { events: CalendarEventV1[], errors: { row, index, message }[] }
 */
export function mapToEvents(rows, mapping, dateFormat = 'auto') {
  const events = [];
  const errors = [];
  let autoId = 1;

  rows.forEach((row, index) => {
    try {
      const title = _field(row, mapping.title);
      const startRaw = _field(row, mapping.start);

      if (!title)    throw new Error('Title is empty');
      if (!startRaw) throw new Error('Start date is empty');

      const start = _parseDate(startRaw, dateFormat);
      if (!start || isNaN(start.getTime())) {
        throw new Error(`Cannot parse start date: "${startRaw}"`);
      }

      const endRaw = _field(row, mapping.end);
      const end = endRaw ? _parseDate(endRaw, dateFormat) : null;

      const allDayRaw = _field(row, mapping.allDay);
      const allDay = allDayRaw
        ? ['true', '1', 'yes', 'y'].includes(allDayRaw.toLowerCase())
        : (!endRaw && !startRaw.includes(':') && !startRaw.includes('T'));

      const event = {
        title: title.trim(),
        start,
        ...(end && !isNaN(end.getTime()) && { end }),
        ...(allDay && { allDay: true }),
        ...(_field(row, mapping.category) && { category: _field(row, mapping.category) }),
        ...(_field(row, mapping.resource) && { resource:  _field(row, mapping.resource) }),
        ...(_field(row, mapping.status)   && { status:    _field(row, mapping.status) }),
        ...(_field(row, mapping.color)    && { color:     _field(row, mapping.color) }),
        id: _field(row, mapping.id) || `csv-${Date.now()}-${autoId++}`,
      };

      events.push(event);
    } catch (err) {
      errors.push({ row, index: index + 2, message: err.message }); // +2: 1-based + header row
    }
  });

  return { events, errors };
}

function _field(row, header) {
  return header ? (row[header] ?? '') : '';
}

// ── Date parsing ──────────────────────────────────────────────────────────────

function _parseDate(value, format) {
  const v = value.trim();
  if (!v) return null;

  if (format === 'iso' || (format === 'auto' && _looksISO(v))) {
    // ISO: 2026-04-10, 2026-04-10T09:00, 2026-04-10 09:00
    return new Date(v.replace(' ', 'T'));
  }

  if (format === 'mdy') return _parseMDY(v);
  if (format === 'dmy') return _parseDMY(v);

  // Auto-detect: try ISO first, then MDY, then native Date parse
  const iso = new Date(v.replace(' ', 'T'));
  if (!isNaN(iso.getTime())) return iso;

  const mdy = _parseMDY(v);
  if (mdy && !isNaN(mdy.getTime())) return mdy;

  return new Date(v);
}

function _looksISO(v) {
  return /^\d{4}-\d{2}-\d{2}/.test(v);
}

function _parseMDY(v) {
  // MM/DD/YYYY or MM/DD/YYYY HH:MM[:SS]
  const [datePart, timePart] = v.split(/[\sT]/);
  const parts = datePart.split('/');
  if (parts.length !== 3) return new Date(v);
  const [m, d, y] = parts;
  const iso = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${timePart ? 'T' + timePart : ''}`;
  return new Date(iso);
}

function _parseDMY(v) {
  // DD/MM/YYYY or DD/MM/YYYY HH:MM[:SS]
  const [datePart, timePart] = v.split(/[\sT]/);
  const parts = datePart.split('/');
  if (parts.length !== 3) return new Date(v);
  const [d, m, y] = parts;
  const iso = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${timePart ? 'T' + timePart : ''}`;
  return new Date(iso);
}

// ── Preset storage ────────────────────────────────────────────────────────────

const PRESETS_KEY = 'wc-csv-presets';

export function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function savePreset(preset) {
  const presets = loadPresets();
  const existing = presets.findIndex(p => p.id === preset.id);
  if (existing >= 0) presets[existing] = preset;
  else presets.push(preset);
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch {}
}

export function deletePreset(id) {
  const presets = loadPresets().filter(p => p.id !== id);
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch {}
}
