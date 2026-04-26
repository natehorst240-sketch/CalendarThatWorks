/**
 * maintenance helpers — computeDueStatus / projectNextDue / completeMaintenance.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDueStatus,
  projectNextDue,
  completeMaintenance,
} from '../maintenance';
import type { MaintenanceRule } from '../../types/maintenance';
import type { WorksCalendarEvent } from '../../types/events';

const oilChange: MaintenanceRule = {
  id: 'oil-10k',
  assetType: 'truck',
  title: 'Oil change',
  interval:      { miles: 10_000 },
  warningWindow: { miles: 2_000  },
};

const dotInspection: MaintenanceRule = {
  id: 'dot-annual',
  assetType: 'truck',
  title: 'DOT inspection',
  interval:      { days: 365 },
  warningWindow: { days: 30  },
};

const combined: MaintenanceRule = {
  id: 'major',
  assetType: 'truck',
  title: 'Major service',
  interval:      { miles: 30_000, days: 365 },
  warningWindow: { miles: 1_500,  days: 14  },
};

// ── computeDueStatus ─────────────────────────────────────────────────────────

describe('computeDueStatus', () => {
  it('returns unknown when the rule has no interval', () => {
    const rule: MaintenanceRule = { id: 'x', assetType: 't', title: '?' };
    expect(computeDueStatus(rule, { meter: { type: 'miles', value: 100 } }).status).toBe('unknown');
  });

  it('returns unknown when a meter-based rule has no current reading', () => {
    expect(computeDueStatus(oilChange, {}, { meterAtService: 100_000 }).status).toBe('unknown');
  });

  it('returns unknown when a meter-based rule has no last service', () => {
    expect(computeDueStatus(oilChange, { meter: { type: 'miles', value: 100_000 } }).status).toBe('unknown');
  });

  it('returns ok when remaining miles exceed the warning window', () => {
    const r = computeDueStatus(
      oilChange,
      { meter: { type: 'miles', value: 102_000 } },
      { meterAtService: 100_000 },
    );
    expect(r.status).toBe('ok');
    expect(r.miles).toEqual({ remaining: 8_000 }); // 100k + 10k - 102k
  });

  it('returns due-soon when remaining miles are within the warning window', () => {
    const r = computeDueStatus(
      oilChange,
      { meter: { type: 'miles', value: 109_000 } },
      { meterAtService: 100_000 },
    );
    expect(r.status).toBe('due-soon');
    expect(r.miles!.remaining).toBe(1_000);
  });

  it('returns overdue with negative remaining when the meter has passed the next-due', () => {
    const r = computeDueStatus(
      oilChange,
      { meter: { type: 'miles', value: 111_500 } },
      { meterAtService: 100_000 },
    );
    expect(r.status).toBe('overdue');
    expect(r.miles!.remaining).toBe(-1_500);
  });

  it('ignores meter readings of the wrong type', () => {
    const r = computeDueStatus(
      oilChange,
      { meter: { type: 'hours', value: 9_000 } }, // wrong unit
      { meterAtService: 100_000 },
    );
    expect(r.status).toBe('unknown');
  });

  it('handles days-only rules using lastService.completedAt', () => {
    const completedAt = '2026-01-01T00:00:00Z';
    const now         = new Date('2026-04-01T00:00:00Z');
    const r = computeDueStatus(dotInspection, {}, { completedAt }, now);
    expect(r.status).toBe('ok');
    expect(r.days!.remaining).toBeGreaterThan(30);
  });

  it('flags days as due-soon inside the warning window', () => {
    const completedAt = '2026-01-01T00:00:00Z';
    const now         = new Date('2026-12-15T00:00:00Z'); // ~17 days before due
    const r = computeDueStatus(dotInspection, {}, { completedAt }, now);
    expect(r.status).toBe('due-soon');
  });

  it('flags days as overdue past the next-due date', () => {
    const completedAt = '2025-01-01T00:00:00Z';
    const now         = new Date('2026-03-01T00:00:00Z'); // ~59 days late
    const r = computeDueStatus(dotInspection, {}, { completedAt }, now);
    expect(r.status).toBe('overdue');
    expect(r.days!.remaining).toBeLessThan(0);
  });

  it('promotes status to the worst dimension (miles ok + days overdue → overdue)', () => {
    const completedAt = '2024-01-01T00:00:00Z';
    const now         = new Date('2026-01-15T00:00:00Z'); // >365 days late
    const r = computeDueStatus(
      combined,
      { meter: { type: 'miles', value: 105_000 } },
      { meterAtService: 100_000, completedAt },
      now,
    );
    expect(r.miles!.remaining).toBe(25_000); // ok in miles
    expect(r.days!.remaining).toBeLessThan(0);
    expect(r.status).toBe('overdue');
  });
});

// ── projectNextDue ───────────────────────────────────────────────────────────

describe('projectNextDue', () => {
  it('projects miles from last service meter', () => {
    expect(projectNextDue(oilChange, { meterAtService: 100_000 })).toEqual({ nextDueMiles: 110_000 });
  });

  it('projects date from last service completedAt', () => {
    const out = projectNextDue(dotInspection, { completedAt: '2026-01-01T00:00:00Z' });
    expect(out.nextDueDate).toBe('2027-01-01T00:00:00.000Z');
  });

  it('returns empty when interval has nothing to project against', () => {
    expect(projectNextDue(oilChange, { completedAt: '2026-01-01' })).toEqual({});
  });

  it('returns empty when rule has no interval', () => {
    const rule: MaintenanceRule = { id: 'x', assetType: 't', title: '?' };
    expect(projectNextDue(rule, { meterAtService: 100, completedAt: '2026-01-01' })).toEqual({});
  });

  it('handles combined miles + days rules', () => {
    const out = projectNextDue(combined, { meterAtService: 200_000, completedAt: '2026-01-01T00:00:00Z' });
    expect(out.nextDueMiles).toBe(230_000);
    expect(out.nextDueDate).toBe('2027-01-01T00:00:00.000Z');
  });
});

// ── completeMaintenance ──────────────────────────────────────────────────────

describe('completeMaintenance', () => {
  const baseEvent: WorksCalendarEvent = {
    id: 'evt-1',
    title: 'Oil change',
    start: '2026-04-10T09:00',
    meta: { maintenance: { ruleId: 'oil-10k', lifecycle: 'in-progress' } },
  };

  it('stamps lifecycle complete, meter at service, and next-due', () => {
    const { event } = completeMaintenance(baseEvent, oilChange, {
      assetId: 'truck-12',
      type:    'miles',
      value:   110_500,
      asOf:    '2026-04-10T11:00:00Z',
    });
    const maint = (event.meta as any).maintenance;
    expect(maint.lifecycle).toBe('complete');
    expect(maint.meterAtService).toBe(110_500);
    expect(maint.nextDueMiles).toBe(120_500);
    expect(maint.ruleId).toBe('oil-10k'); // preserved
  });

  it('produces a MeterReading from the supplied values', () => {
    const { reading } = completeMaintenance(baseEvent, oilChange, {
      assetId:    'truck-12',
      type:       'miles',
      value:      110_500,
      asOf:       '2026-04-10T11:00:00Z',
      reportedBy: 'driver-7',
    });
    expect(reading).toEqual({
      assetId:    'truck-12',
      type:       'miles',
      value:      110_500,
      asOf:       '2026-04-10T11:00:00Z',
      reportedBy: 'driver-7',
    });
  });

  it('falls back to ruleId from the rule when the event meta lacks it', () => {
    const noRuleIdEvent: WorksCalendarEvent = { ...baseEvent, meta: { maintenance: {} } };
    const { event } = completeMaintenance(noRuleIdEvent, oilChange, {
      assetId: 'truck-12', type: 'miles', value: 100,
    });
    expect((event.meta as any).maintenance.ruleId).toBe('oil-10k');
  });

  it('does not mutate the input event', () => {
    const before = JSON.stringify(baseEvent);
    completeMaintenance(baseEvent, oilChange, { assetId: 'a', type: 'miles', value: 1 });
    expect(JSON.stringify(baseEvent)).toBe(before);
  });

  it('writes nextDueCycles for cycle-based rules', () => {
    const cycleRule: MaintenanceRule = {
      id: 'engine-overhaul',
      assetType: 'engine',
      title: 'Overhaul',
      interval: { cycles: 2_000 },
    };
    const { event } = completeMaintenance(
      { id: 'evt', title: 'Overhaul', start: '2026-04-10', meta: { maintenance: { ruleId: 'engine-overhaul' } } },
      cycleRule,
      { assetId: 'eng-3', type: 'cycles', value: 5_400 },
    );
    expect((event.meta as any).maintenance.nextDueCycles).toBe(7_400);
  });

  it('preserves unrelated meta keys on the event', () => {
    const eventWithExtra: WorksCalendarEvent = {
      ...baseEvent,
      meta: { ...baseEvent.meta, billing: { customer: 'Internal' } },
    };
    const { event } = completeMaintenance(eventWithExtra, oilChange, {
      assetId: 'truck-12', type: 'miles', value: 100_000,
    });
    expect((event.meta as any).billing).toEqual({ customer: 'Internal' });
  });
});
