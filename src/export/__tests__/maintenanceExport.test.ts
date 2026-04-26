/**
 * maintenanceExport — pure transform + CSV serialization.
 */
import { describe, it, expect } from 'vitest';
import {
  toMaintenanceLog,
  maintenanceLogToCSV,
} from '../maintenanceExport';
import type { NormalizedEvent } from '../../types/events';
import type { MaintenanceRule } from '../../types/maintenance';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'evt-1',
    title: 'Service work',
    start: new Date('2026-04-10T09:00:00Z'),
    end:   new Date('2026-04-10T11:00:00Z'),
    allDay: false,
    category: null,
    color: '#3b82f6',
    resource: 'truck-12',
    status: 'confirmed',
    meta: {},
    rrule: null,
    exdates: [],
    _raw: {} as any,
    ...overrides,
  };
}

const oilChange: MaintenanceRule = {
  id: 'oil-10k',
  assetType: 'truck',
  title: 'Oil change',
  interval: { miles: 10_000 },
};

// ── toMaintenanceLog ─────────────────────────────────────────────────────────

describe('toMaintenanceLog', () => {
  it('skips events with no meta.maintenance', () => {
    expect(toMaintenanceLog([makeEvent()])).toEqual([]);
  });

  it('emits an entry with all fields populated when maintenance meta is set', () => {
    const ev = makeEvent({
      meta: { maintenance: {
        ruleId: 'oil-10k', lifecycle: 'complete',
        meterAtService: 110_500, nextDueMiles: 120_500,
        notes: 'Filter changed too',
      } },
    });
    const [entry] = toMaintenanceLog([ev], { rules: [oilChange] });
    expect(entry).toEqual({
      eventId:        'evt-1',
      date:           ev.start,
      asset:          'truck-12',
      rule:           'Oil change',
      ruleId:         'oil-10k',
      lifecycle:      'complete',
      meterAtService: 110_500,
      nextDueMiles:   120_500,
      nextDueHours:   null,
      nextDueCycles:  null,
      nextDueDate:    null,
      notes:          'Filter changed too',
    });
  });

  it('falls back to ruleId for rule label when rules registry is omitted', () => {
    const ev = makeEvent({ meta: { maintenance: { ruleId: 'unknown-rule', lifecycle: 'scheduled' } } });
    const [entry] = toMaintenanceLog([ev]);
    expect(entry!.rule).toBe('unknown-rule');
  });

  it('null-fills missing numeric fields rather than omitting the column', () => {
    const ev = makeEvent({ meta: { maintenance: { ruleId: 'oil-10k', lifecycle: 'due' } } });
    const [entry] = toMaintenanceLog([ev]);
    expect(entry!.meterAtService).toBeNull();
    expect(entry!.nextDueMiles).toBeNull();
    expect(entry!.nextDueDate).toBeNull();
    expect(entry!.notes).toBe(''); // notes default to '' not null
  });

  it('filters by lifecycle when provided', () => {
    const a = makeEvent({ id: 'a', meta: { maintenance: { ruleId: 'r', lifecycle: 'scheduled' } } });
    const b = makeEvent({ id: 'b', meta: { maintenance: { ruleId: 'r', lifecycle: 'complete'  } } });
    const c = makeEvent({ id: 'c', meta: { maintenance: { ruleId: 'r' } } }); // no lifecycle
    const ids = toMaintenanceLog([a, b, c], { lifecycles: ['complete'] }).map(e => e.eventId);
    expect(ids).toEqual(['b']);
  });

  it('rule field is null when meta has no ruleId', () => {
    const ev = makeEvent({ meta: { maintenance: { lifecycle: 'due' } } });
    const [entry] = toMaintenanceLog([ev]);
    expect(entry!.rule).toBeNull();
    expect(entry!.ruleId).toBeNull();
  });

  it('treats malformed meta.maintenance (non-object) as absent', () => {
    const ev = makeEvent({ meta: { maintenance: 'oops' as unknown as object } });
    expect(toMaintenanceLog([ev])).toEqual([]);
  });
});

// ── maintenanceLogToCSV ──────────────────────────────────────────────────────

describe('maintenanceLogToCSV', () => {
  it('emits headers + a row with ISO date and slice of nextDueDate', () => {
    const ev = makeEvent({
      meta: { maintenance: {
        ruleId: 'oil-10k', lifecycle: 'complete',
        meterAtService: 110_500, nextDueMiles: 120_500,
        nextDueDate: '2027-04-10T00:00:00.000Z',
      } },
    });
    const csv = maintenanceLogToCSV(toMaintenanceLog([ev], { rules: [oilChange] }));
    const [header, row] = csv.split('\n');
    expect(header).toBe(
      '"Event ID","Date","Asset","Rule","Rule ID","Lifecycle","Meter at service","Next due (miles)","Next due (hours)","Next due (cycles)","Next due (date)","Notes"',
    );
    expect(row).toBe(
      '"evt-1","2026-04-10","truck-12","Oil change","oil-10k","complete","110500","120500","","","2027-04-10",""',
    );
  });

  it('emits a header-only CSV for empty input', () => {
    const csv = maintenanceLogToCSV([]);
    expect(csv).toBe(
      '"Event ID","Date","Asset","Rule","Rule ID","Lifecycle","Meter at service","Next due (miles)","Next due (hours)","Next due (cycles)","Next due (date)","Notes"',
    );
  });
});
