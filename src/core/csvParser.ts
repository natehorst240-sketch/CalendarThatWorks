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
  { key: 'title',          label: 'Title',          required: true,  hint: 'Event name / summary'        },
  { key: 'start',          label: 'Start',          required: true,  hint: 'Start date or date + time'   },
  { key: 'end',            label: 'End',            required: false, hint: 'End date or date + time'     },
  { key: 'allDay',         label: 'All-day',        required: false, hint: '"true" / "false" / "1" / "0"' },
  { key: 'category',       label: 'Category',       required: false, hint: 'Meeting, Incident, PTO, …'   },
  { key: 'resource',       label: 'Resource',       required: false, hint: 'Person, room, or team'        },
  { key: 'status',         label: 'Status',         required: false, hint: 'confirmed / tentative / cancelled' },
  { key: 'color',          label: 'Color',          required: false, hint: 'Hex color (#3b82f6)'          },
  { key: 'id',             label: 'ID',             required: false, hint: 'Unique identifier'            },
  // Billing fields → event.meta.billing
  { key: 'billable',       label: 'Billable',       required: false, hint: '"true" / "false" / "1" / "0"' },
  { key: 'customer',       label: 'Customer',       required: false, hint: 'Customer name or account ID'  },
  { key: 'rate',           label: 'Rate',           required: false, hint: 'Numeric rate (per hour/job)'  },
  { key: 'quantity',       label: 'Quantity',       required: false, hint: 'Hours, units, or jobs'        },
  { key: 'invoiceStatus',  label: 'Invoice status', required: false, hint: 'unbilled / invoiced / paid / void' },
  // Maintenance fields → event.meta.maintenance + event.meta.meter
  { key: 'maintenanceRule', label: 'Maint. rule',   required: false, hint: 'Rule ID (e.g. "oil-change-10k")' },
  { key: 'lifecycle',       label: 'Lifecycle',     required: false, hint: 'due / scheduled / in-progress / complete / skipped' },
  { key: 'meterValue',      label: 'Meter reading', required: false, hint: 'Numeric meter value at service' },
  { key: 'meterType',       label: 'Meter type',    required: false, hint: 'miles / hours / cycles / kilometers' },
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
type CsvRow = Record<string, string>;

export function parseCSV(text: string): { headers: string[]; rows: CsvRow[] } {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // Skip leading blank lines
  const firstNonBlank = lines.findIndex(l => l.trim() !== '');
  if (firstNonBlank === -1) return { headers: [], rows: [] };

  const headers = _parseLine(lines[firstNonBlank]!).map(h => h.trim());
  const rows: CsvRow[] = [];

  for (let i = firstNonBlank + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = _parseLine(line);
    const row: CsvRow = {};
    headers.forEach((h, j) => { row[h] = (values[j] ?? '').trim(); });
    rows.push(row);
  }

  return { headers, rows };
}

function _parseLine(line: string): string[] {
  const fields: string[] = [];
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
const FIELD_HINTS: Record<string, string[]> = {
  title:    ['title', 'name', 'summary', 'subject', 'event', 'headline'],
  start:    ['start', 'begin', 'from', 'startdate', 'starttime', 'date'],
  end:      ['end', 'finish', 'to', 'enddate', 'endtime', 'until', 'thru', 'through'],
  allDay:   ['allday', 'allday', 'wholeday', 'fullday'],
  category: ['category', 'type', 'kind', 'tag', 'label', 'group', 'class'],
  resource: ['resource', 'person', 'owner', 'assignee', 'employee', 'user', 'room', 'location', 'truck', 'asset', 'aircraft', 'tail', 'unit', 'vehicle'],
  status:   ['status', 'state', 'confirmed', 'tentative'],
  color:    ['color', 'colour'],
  id:       ['id', 'uid', 'identifier', 'key', 'ref'],
  // Billing
  billable:       ['billable', 'bill', 'chargeable'],
  customer:       ['customer', 'client', 'account', 'company', 'payer'],
  rate:           ['rate', 'price', 'cost', 'hourlyrate', 'rateperhour'],
  quantity:       ['quantity', 'qty', 'hours', 'units', 'count'],
  invoiceStatus:  ['invoicestatus', 'invoice', 'invoiced', 'paid', 'billingstatus'],
  // Maintenance
  maintenanceRule: ['maintenancerule', 'rule', 'service', 'servicetype', 'maintenance'],
  lifecycle:       ['lifecycle', 'workstatus', 'progress', 'phase'],
  meterValue:      ['meter', 'mileage', 'odometer', 'hobbs', 'tach', 'engine', 'cycles'],
  meterType:       ['metertype', 'meterunit', 'unit', 'meterkind'],
};

/**
 * Given a list of CSV column headers, return a best-guess field mapping.
 * Returns a Record<EventField, string> where value is the matched header.
 */
export function suggestMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  // Short hints (e.g. "to", "id", "tag") must match exactly — otherwise
  // they'd grab unrelated headers via substring overlap (e.g. "Customer"
  // contains "to").
  const PARTIAL_MIN = 4;

  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    for (const header of headers) {
      if (used.has(header)) continue;
      const norm = header.toLowerCase().replace(/[\s_\-\.]/g, '');
      const match = hints.some(h =>
        norm === h ||
        (h.length    >= PARTIAL_MIN && norm.includes(h)) ||
        (norm.length >= PARTIAL_MIN && h.includes(norm)),
      );
      if (match) {
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
type EventShape = {
  title: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  category?: string;
  resource?: string;
  status?: string;
  color?: string;
  id: string;
  meta?: Record<string, unknown>;
};

export function mapToEvents(
  rows: CsvRow[],
  mapping: Record<string, string>,
  dateFormat: string = 'auto',
): { events: EventShape[]; errors: Array<{ row: CsvRow; index: number; message: string }> } {
  const events: EventShape[] = [];
  const errors: Array<{ row: CsvRow; index: number; message: string }> = [];
  let autoId = 1;

  rows.forEach((row, index) => {
    try {
      const title = _field(row, mapping['title']);
      const startRaw = _field(row, mapping['start']);

      if (!title)    throw new Error('Title is empty');
      if (!startRaw) throw new Error('Start date is empty');

      const start = _parseDate(startRaw, dateFormat);
      if (!start || isNaN(start.getTime())) {
        throw new Error(`Cannot parse start date: "${startRaw}"`);
      }

      const endRaw = _field(row, mapping['end']);
      const end = endRaw ? _parseDate(endRaw, dateFormat) : null;

      const allDayRaw = _field(row, mapping['allDay']);
      const allDay = allDayRaw
        ? ['true', '1', 'yes', 'y'].includes(allDayRaw.toLowerCase())
        : (!endRaw && !startRaw.includes(':') && !startRaw.includes('T'));

      const meta = _buildMeta(row, mapping);

      const event = {
        title: title.trim(),
        start,
        ...(end && !isNaN(end.getTime()) && { end }),
        ...(allDay && { allDay: true }),
        ...(_field(row, mapping['category']) && { category: _field(row, mapping['category']) }),
        ...(_field(row, mapping['resource']) && { resource:  _field(row, mapping['resource']) }),
        ...(_field(row, mapping['status'])   && { status:    _field(row, mapping['status']) }),
        ...(_field(row, mapping['color'])    && { color:     _field(row, mapping['color']) }),
        id: _field(row, mapping['id']) || `csv-${Date.now()}-${autoId++}`,
        ...(meta && { meta }),
      };

      events.push(event);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ row, index: index + 2, message }); // +2: 1-based + header row
    }
  });

  return { events, errors };
}

function _field(row: CsvRow, header: string | undefined): string {
  return header ? (row[header] ?? '') : '';
}

// ── Meta assembly (billing + maintenance) ────────────────────────────────────

const TRUTHY = new Set(['true', '1', 'yes', 'y', 't']);
const FALSY  = new Set(['false', '0', 'no', 'n', 'f']);

function _parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v))  return false;
  return null;
}

function _parseNum(raw: string, fieldLabel: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  // Tolerate currency symbols, thousand separators.
  const cleaned = v.replace(/[$,\s]/g, '');
  if (!cleaned) {
    // Original cell had content (e.g. "$" or ",") but stripping left nothing.
    // Treat as a non-numeric value rather than silently returning 0.
    throw new Error(`Cannot parse ${fieldLabel}: "${raw}"`);
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot parse ${fieldLabel}: "${raw}"`);
  }
  return n;
}

/**
 * Build the optional `meta` object holding billing + maintenance + meter data.
 * Returns `undefined` when no relevant columns are mapped or all values are blank,
 * so events without these fields don't carry a meta stub.
 */
function _buildMeta(
  row: CsvRow,
  mapping: Record<string, string>,
): Record<string, unknown> | undefined {
  const billing: Record<string, unknown> = {};
  const billableRaw = _field(row, mapping['billable']);
  if (billableRaw) {
    const b = _parseBool(billableRaw);
    if (b !== null) billing['billable'] = b;
  }
  const customer = _field(row, mapping['customer']);
  if (customer) billing['customer'] = customer;
  const rate = _parseNum(_field(row, mapping['rate']), 'rate');
  if (rate !== null) billing['rate'] = rate;
  const quantity = _parseNum(_field(row, mapping['quantity']), 'quantity');
  if (quantity !== null) billing['quantity'] = quantity;
  const invoiceStatus = _field(row, mapping['invoiceStatus']).toLowerCase();
  if (invoiceStatus) billing['invoiceStatus'] = invoiceStatus;

  const maintenance: Record<string, unknown> = {};
  const ruleId = _field(row, mapping['maintenanceRule']);
  if (ruleId) maintenance['ruleId'] = ruleId;
  const lifecycle = _field(row, mapping['lifecycle']).toLowerCase();
  if (lifecycle) maintenance['lifecycle'] = lifecycle;
  const meterAtService = _parseNum(_field(row, mapping['meterValue']), 'meter reading');
  if (meterAtService !== null) maintenance['meterAtService'] = meterAtService;

  const meter: Record<string, unknown> = {};
  if (meterAtService !== null) meter['value'] = meterAtService;
  const meterType = _field(row, mapping['meterType']).toLowerCase();
  if (meterType) meter['type'] = meterType;

  const out: Record<string, unknown> = {};
  if (Object.keys(billing).length)     out['billing']     = billing;
  if (Object.keys(maintenance).length) out['maintenance'] = maintenance;
  if (Object.keys(meter).length)       out['meter']       = meter;
  return Object.keys(out).length ? out : undefined;
}

// ── Date parsing ──────────────────────────────────────────────────────────────

function _parseDate(value: string, format: string): Date | null {
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

function _looksISO(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(v);
}

function _parseMDY(v: string): Date {
  // MM/DD/YYYY or MM/DD/YYYY HH:MM[:SS]
  const [datePart, timePart] = v.split(/[\sT]/);
  if (datePart === undefined) return new Date(v);
  const parts = datePart.split('/');
  if (parts.length !== 3) return new Date(v);
  const [m, d, y] = parts;
  if (m === undefined || d === undefined || y === undefined) return new Date(v);
  const iso = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${timePart ? 'T' + timePart : ''}`;
  return new Date(iso);
}

function _parseDMY(v: string): Date {
  // DD/MM/YYYY or DD/MM/YYYY HH:MM[:SS]
  const [datePart, timePart] = v.split(/[\sT]/);
  if (datePart === undefined) return new Date(v);
  const parts = datePart.split('/');
  if (parts.length !== 3) return new Date(v);
  const [d, m, y] = parts;
  if (m === undefined || d === undefined || y === undefined) return new Date(v);
  const iso = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${timePart ? 'T' + timePart : ''}`;
  return new Date(iso);
}

// ── Preset storage ────────────────────────────────────────────────────────────

const PRESETS_KEY = 'wc-csv-presets';

type Preset = { id: string; [key: string]: any };

export function loadPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function savePreset(preset: Preset): void {
  const presets = loadPresets();
  const existing = presets.findIndex(p => p.id === preset.id);
  if (existing >= 0) presets[existing] = preset;
  else presets.push(preset);
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch {}
}

export function deletePreset(id: string): void {
  const presets = loadPresets().filter(p => p.id !== id);
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch {}
}
