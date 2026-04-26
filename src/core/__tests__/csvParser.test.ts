/**
 * csvParser unit tests — parseCSV, suggestMapping, mapToEvents, date parsing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCSV,
  suggestMapping,
  mapToEvents,
  loadPresets,
  savePreset,
  deletePreset,
} from '../csvParser';

// ── parseCSV ──────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parses a simple CSV with headers', () => {
    const text = 'Name,Start,End\nMeeting,2026-04-10,2026-04-10';
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(['Name', 'Start', 'End']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ Name: 'Meeting', Start: '2026-04-10', End: '2026-04-10' });
  });

  it('handles quoted fields with commas', () => {
    const text = 'Title,Notes\n"Meeting, all hands","See you there"';
    const { rows } = parseCSV(text);
    expect(rows[0]!['Title']).toBe('Meeting, all hands');
    expect(rows[0]!['Notes']).toBe('See you there');
  });

  it('handles escaped quotes inside quoted fields', () => {
    const text = 'Title\n"She said ""hello"""\n';
    const { rows } = parseCSV(text);
    expect(rows[0]!['Title']).toBe('She said "hello"');
  });

  it('handles Windows CRLF line endings', () => {
    const text = 'Name,Start\r\nMeeting,2026-04-10\r\n';
    const { rows } = parseCSV(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['Name']).toBe('Meeting');
  });

  it('skips blank rows', () => {
    const text = 'Name,Start\n\nMeeting,2026-04-10\n\n';
    const { rows } = parseCSV(text);
    expect(rows).toHaveLength(1);
  });

  it('returns empty for blank input', () => {
    expect(parseCSV('').headers).toHaveLength(0);
    expect(parseCSV('\n\n').headers).toHaveLength(0);
  });

  it('trims header whitespace', () => {
    const text = ' Name , Start \nMeeting,2026-04-10';
    const { headers } = parseCSV(text);
    expect(headers).toEqual(['Name', 'Start']);
  });
});

// ── suggestMapping ────────────────────────────────────────────────────────────

describe('suggestMapping', () => {
  it('maps common column names to event fields', () => {
    const headers = ['Title', 'Start Date', 'End Date', 'Category', 'Resource'];
    const mapping = suggestMapping(headers);
    expect(mapping['title']).toBe('Title');
    expect(mapping['start']).toBe('Start Date');
    expect(mapping['end']).toBe('End Date');
    expect(mapping['category']).toBe('Category');
    expect(mapping['resource']).toBe('Resource');
  });

  it('handles "Name" → title', () => {
    expect(suggestMapping(['Name', 'Begin'])['title']).toBe('Name');
  });

  it('handles "Summary" → title', () => {
    expect(suggestMapping(['Summary'])['title']).toBe('Summary');
  });

  it('handles "Subject" → title', () => {
    expect(suggestMapping(['Subject', 'Date'])['title']).toBe('Subject');
  });

  it('handles "Date" → start when no other start column', () => {
    expect(suggestMapping(['Name', 'Date'])['start']).toBe('Date');
  });

  it('does not map same column to two fields', () => {
    const mapping = suggestMapping(['Name', 'Start', 'End']);
    const vals = Object.values(mapping).filter(Boolean);
    const unique = new Set(vals);
    expect(unique.size).toBe(vals.length);
  });

  it('returns empty mapping for unrecognised headers', () => {
    const mapping = suggestMapping(['foo', 'bar', 'baz']);
    expect(Object.values(mapping).filter(Boolean)).toHaveLength(0);
  });
});

// ── mapToEvents ───────────────────────────────────────────────────────────────

describe('mapToEvents', () => {
  const rows = [
    { Title: 'Standup',  Start: '2026-04-10T09:00', End: '2026-04-10T09:30', Category: 'Meeting' },
    { Title: 'Workshop', Start: '2026-04-11',        End: '2026-04-12',       Category: 'Training' },
  ];

  const mapping = { title: 'Title', start: 'Start', end: 'End', category: 'Category' };

  it('maps rows to events', () => {
    const { events, errors } = mapToEvents(rows, mapping, 'iso');
    expect(errors).toHaveLength(0);
    expect(events).toHaveLength(2);
    expect(events[0]!.title).toBe('Standup');
    expect(events[0]!.start).toBeInstanceOf(Date);
    expect(events[0]!.category).toBe('Meeting');
  });

  it('produces errors for rows with no title', () => {
    const { events, errors } = mapToEvents(
      [{ Title: '', Start: '2026-04-10' }],
      { title: 'Title', start: 'Start' },
      'iso',
    );
    expect(events).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/title/i);
  });

  it('produces errors for rows with unparseable start date', () => {
    const { errors } = mapToEvents(
      [{ Title: 'Oops', Start: 'not-a-date' }],
      { title: 'Title', start: 'Start' },
      'iso',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/start/i);
  });

  it('handles US date format (mdy)', () => {
    const { events } = mapToEvents(
      [{ T: 'Meeting', S: '04/10/2026 09:00' }],
      { title: 'T', start: 'S' },
      'mdy',
    );
    expect(events[0]!.start.getFullYear()).toBe(2026);
    expect(events[0]!.start.getMonth()).toBe(3); // April = 3
    expect(events[0]!.start.getDate()).toBe(10);
  });

  it('handles European date format (dmy)', () => {
    const { events } = mapToEvents(
      [{ T: 'Meeting', S: '10/04/2026' }],
      { title: 'T', start: 'S' },
      'dmy',
    );
    expect(events[0]!.start.getFullYear()).toBe(2026);
    expect(events[0]!.start.getMonth()).toBe(3); // April
    expect(events[0]!.start.getDate()).toBe(10);
  });

  it('marks event as all-day when allDay column is "true"', () => {
    const { events } = mapToEvents(
      [{ T: 'Holiday', S: '2026-04-10', AD: 'true' }],
      { title: 'T', start: 'S', allDay: 'AD' },
      'iso',
    );
    expect(events[0]!.allDay).toBe(true);
  });

  it('marks event as all-day when allDay column is "1"', () => {
    const { events } = mapToEvents(
      [{ T: 'Holiday', S: '2026-04-10', AD: '1' }],
      { title: 'T', start: 'S', allDay: 'AD' },
      'iso',
    );
    expect(events[0]!.allDay).toBe(true);
  });

  it('skips optional fields when mapping is empty string', () => {
    const { events } = mapToEvents(
      [{ Title: 'Test', Start: '2026-04-10' }],
      { title: 'Title', start: 'Start', category: '' },
      'iso',
    );
    expect(events[0]!.category).toBeUndefined();
  });

  it('auto-detect format works for ISO dates', () => {
    const { events } = mapToEvents(
      [{ T: 'Meeting', S: '2026-04-10T09:00' }],
      { title: 'T', start: 'S' },
      'auto',
    );
    expect(events[0]!.start.getFullYear()).toBe(2026);
  });

  it('row error includes 1-based spreadsheet row number', () => {
    const { errors } = mapToEvents(
      [{ Title: 'OK', Start: '2026-04-10' }, { Title: '', Start: '2026-04-11' }],
      { title: 'Title', start: 'Start' },
      'iso',
    );
    // Second data row = row 3 in spreadsheet (row 1 = headers, row 2 = first data)
    expect(errors[0]!.index).toBe(3);
  });
});

// ── Billing + maintenance metadata ────────────────────────────────────────────

describe('mapToEvents — billing fields', () => {
  it('attaches billing meta when billing columns are mapped', () => {
    const { events, errors } = mapToEvents(
      [{ T: 'Job 12', S: '2026-04-10', Bill: 'true', Cust: 'ABC Logistics', Rate: '120', Qty: '5', Inv: 'Unbilled' }],
      { title: 'T', start: 'S', billable: 'Bill', customer: 'Cust', rate: 'Rate', quantity: 'Qty', invoiceStatus: 'Inv' },
      'iso',
    );
    expect(errors).toHaveLength(0);
    const billing = (events[0]!.meta as any).billing;
    expect(billing).toEqual({
      billable: true,
      customer: 'ABC Logistics',
      rate: 120,
      quantity: 5,
      invoiceStatus: 'unbilled',
    });
  });

  it('tolerates currency symbols and thousand separators in rate', () => {
    const { events } = mapToEvents(
      [{ T: 'Job', S: '2026-04-10', Rate: '$1,250.50' }],
      { title: 'T', start: 'S', rate: 'Rate' },
      'iso',
    );
    expect((events[0]!.meta as any).billing.rate).toBe(1250.5);
  });

  it('reports a per-row error when rate is non-numeric', () => {
    const { events, errors } = mapToEvents(
      [{ T: 'Job', S: '2026-04-10', Rate: 'cheap' }],
      { title: 'T', start: 'S', rate: 'Rate' },
      'iso',
    );
    expect(events).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/rate/i);
  });

  it('rejects symbol-only rate ("$") instead of importing it as 0', () => {
    const { events, errors } = mapToEvents(
      [{ T: 'Job', S: '2026-04-10', Rate: '$' }],
      { title: 'T', start: 'S', rate: 'Rate' },
      'iso',
    );
    expect(events).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/rate/i);
  });

  it('rejects comma-only quantity (",") instead of importing it as 0', () => {
    const { events, errors } = mapToEvents(
      [{ T: 'Job', S: '2026-04-10', Q: ',' }],
      { title: 'T', start: 'S', quantity: 'Q' },
      'iso',
    );
    expect(events).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/quantity/i);
  });

  it('does not attach meta when no billing columns map and values exist', () => {
    const { events } = mapToEvents(
      [{ T: 'Plain', S: '2026-04-10' }],
      { title: 'T', start: 'S' },
      'iso',
    );
    expect(events[0]!.meta).toBeUndefined();
  });

  it('skips billable when value is unrecognised (not true/false-like)', () => {
    const { events } = mapToEvents(
      [{ T: 'Job', S: '2026-04-10', Bill: 'maybe' }],
      { title: 'T', start: 'S', billable: 'Bill' },
      'iso',
    );
    expect(events[0]!.meta).toBeUndefined();
  });
});

describe('mapToEvents — maintenance fields', () => {
  it('attaches maintenance + meter meta when maintenance columns are mapped', () => {
    const { events, errors } = mapToEvents(
      [{ T: 'Oil change', S: '2026-04-10', Rule: 'oil-10k', LC: 'Scheduled', M: '120000', MT: 'Miles' }],
      { title: 'T', start: 'S', maintenanceRule: 'Rule', lifecycle: 'LC', meterValue: 'M', meterType: 'MT' },
      'iso',
    );
    expect(errors).toHaveLength(0);
    const meta = events[0]!.meta as any;
    expect(meta.maintenance).toEqual({
      ruleId: 'oil-10k',
      lifecycle: 'scheduled',
      meterAtService: 120000,
    });
    expect(meta.meter).toEqual({ value: 120000, type: 'miles' });
  });

  it('omits meter block when only meter type is present (no reading)', () => {
    const { events } = mapToEvents(
      [{ T: 'Service', S: '2026-04-10', MT: 'hours' }],
      { title: 'T', start: 'S', meterType: 'MT' },
      'iso',
    );
    expect((events[0]!.meta as any).meter).toEqual({ type: 'hours' });
  });

  it('produces independent billing and maintenance blocks for the same event', () => {
    const { events } = mapToEvents(
      [{ T: 'Service', S: '2026-04-10', Cust: 'Internal', Rule: 'inspection-50h' }],
      { title: 'T', start: 'S', customer: 'Cust', maintenanceRule: 'Rule' },
      'iso',
    );
    const meta = events[0]!.meta as any;
    expect(meta.billing.customer).toBe('Internal');
    expect(meta.maintenance.ruleId).toBe('inspection-50h');
    expect(meta.meter).toBeUndefined();
  });
});

describe('suggestMapping — domain vocabulary', () => {
  it('maps "Truck" to resource', () => {
    expect(suggestMapping(['Title', 'Date', 'Truck'])['resource']).toBe('Truck');
  });

  it('maps "Tail Number" to resource (aviation)', () => {
    expect(suggestMapping(['Subject', 'Date', 'Tail Number'])['resource']).toBe('Tail Number');
  });

  it('maps "Customer" to customer billing field', () => {
    expect(suggestMapping(['Title', 'Date', 'Customer'])['customer']).toBe('Customer');
  });

  it('maps "Hobbs" to meterValue (aviation)', () => {
    expect(suggestMapping(['Title', 'Date', 'Hobbs'])['meterValue']).toBe('Hobbs');
  });

  it('maps "Odometer" to meterValue (trucking)', () => {
    expect(suggestMapping(['Title', 'Date', 'Odometer'])['meterValue']).toBe('Odometer');
  });
});

// ── Preset storage ────────────────────────────────────────────────────────────

describe('presets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads presets', () => {
    const preset = { id: 'p1', name: 'My Preset', mapping: { title: 'Name' }, dateFormat: 'iso' };
    savePreset(preset);
    const loaded = loadPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!['name']).toBe('My Preset');
  });

  it('updates an existing preset by id', () => {
    savePreset({ id: 'p1', name: 'Old', mapping: {}, dateFormat: 'iso' });
    savePreset({ id: 'p1', name: 'New', mapping: {}, dateFormat: 'mdy' });
    expect(loadPresets()).toHaveLength(1);
    expect(loadPresets!()[0]['name']).toBe('New');
  });

  it('deletes a preset by id', () => {
    savePreset({ id: 'p1', name: 'A', mapping: {}, dateFormat: 'iso' });
    savePreset({ id: 'p2', name: 'B', mapping: {}, dateFormat: 'iso' });
    deletePreset('p1');
    const presets = loadPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]!.id).toBe('p2');
  });

  it('returns empty array when no presets stored', () => {
    expect(loadPresets()).toEqual([]);
  });
});
