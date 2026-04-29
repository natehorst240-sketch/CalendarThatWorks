/**
 * Unit tests for the DispatchView readiness pipeline.
 *
 * The view itself is rendered against React, but the per-asset status /
 * crew / equipment computation is pure: stable inputs in, deterministic
 * row layout out. Testing it as a function keeps the table render pure
 * styling concern and lets us catch readiness regressions cheaply.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDispatchRows,
  decorateDispatchRows,
} from '../DispatchView';

const ASSETS = [
  { id: 'a1', label: 'N801AW', meta: { base: 'b-logan',  sublabel: 'Helicopter' } },
  { id: 'a2', label: 'N803LJ', meta: { base: 'b-provo',  sublabel: 'Helicopter' } },
  { id: 'a3', label: 'N804AW', meta: { base: 'b-logan',  sublabel: 'Helicopter', status: 'maintenance' } },
];

const EMPLOYEES = [
  { id: 'e1', name: 'Alex',  base: 'b-logan' },
  { id: 'e2', name: 'Bea',   base: 'b-provo' },
];

const BASES = [
  { id: 'b-logan', name: 'Logan' },
  { id: 'b-provo', name: 'Provo' },
];

const NOON = new Date('2026-04-26T12:00:00Z');
const ONE_PM = new Date('2026-04-26T13:00:00Z');

describe('computeDispatchRows', () => {
  it('produces one row per asset preserving input order', () => {
    const rows = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');
    expect(rows.map(r => r.asset.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('resolves base name from asset.meta.base via the bases lookup', () => {
    const rows = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');
    expect(rows.find(r => r.asset.id === 'a1')?.baseName).toBe('Logan');
    expect(rows.find(r => r.asset.id === 'a2')?.baseName).toBe('Provo');
  });

  it('falls back to a placeholder when no base is configured on the asset', () => {
    const orphan = { id: 'a-orphan', label: 'Drone', meta: {} };
    const rows = computeDispatchRows(NOON, [orphan], EMPLOYEES, BASES, 'Hub');
    expect(rows[0]?.baseName.toLowerCase()).toContain('hub');
    expect(rows[0]?.baseId).toBe('');
  });
});

describe('decorateDispatchRows — status', () => {
  const skeleton = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');

  it('marks assets without overlapping events Available (a3 stays maintenance via meta.status)', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.status).toBe('available');
    expect(rows.find(r => r.asset.id === 'a2')?.status).toBe('available');
    expect(rows.find(r => r.asset.id === 'a3')?.status).toBe('maintenance');
  });

  it('flips an asset to Busy when a non-maintenance event overlaps as-of', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'ev1', start: '2026-04-26T11:00:00Z', end: '2026-04-26T15:00:00Z', resource: 'a1', category: 'mission-assignment', title: 'Trauma transport' },
    ], EMPLOYEES);
    const a1 = rows.find(r => r.asset.id === 'a1');
    expect(a1?.status).toBe('busy');
    expect(a1?.missing.some(m => m.includes('Trauma transport'))).toBe(true);
  });

  it('flips an asset to Maintenance when a maintenance event overlaps', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'ev2', start: '2026-04-26T08:00:00Z', end: '2026-04-26T20:00:00Z', resource: 'a1', category: 'maintenance', title: '50hr inspection' },
    ], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.status).toBe('maintenance');
  });

  it('honors meta.status === "maintenance" even when no event is on file', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a3')?.status).toBe('maintenance');
  });

  it('prefers maintenance over busy when both apply', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'm', start: '2026-04-26T08:00Z', end: '2026-04-26T20:00Z', resource: 'a1', category: 'maintenance' },
      { id: 'b', start: '2026-04-26T08:00Z', end: '2026-04-26T20:00Z', resource: 'a1', category: 'mission-assignment' },
    ], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.status).toBe('maintenance');
  });

  it('ignores events that are entirely outside the as-of moment', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'ev', start: '2026-04-27T08:00Z', end: '2026-04-27T20:00Z', resource: 'a1', category: 'mission-assignment' },
    ], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.status).toBe('available');
  });

  it('ignores base-wide events with no resource binding', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'b1', start: '2026-04-26T08:00Z', end: '2026-04-26T20:00Z', meta: { base: 'b-logan' }, category: 'closure' },
    ], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.status).toBe('available');
  });
});

describe('decorateDispatchRows — crew readiness', () => {
  const skeleton = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');

  it('reports crewReady=true when at least one employee at the base is unbooked', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.crewReady).toBe(true);
  });

  it('reports crewReady=false when every employee at that base is booked', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'pe', start: '2026-04-26T08:00Z', end: '2026-04-26T20:00Z', resource: 'e1', category: 'pto' },
    ], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.crewReady).toBe(false);
    expect(rows.find(r => r.asset.id === 'a1')?.missing.some(m => m.includes('crew'))).toBe(true);
  });

  it('does not bleed across bases — Logan booking does not affect Provo readiness', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'pe', start: '2026-04-26T08:00Z', end: '2026-04-26T20:00Z', resource: 'e1', category: 'pto' },
    ], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a2')?.crewReady).toBe(true);
  });

  it('a future booking does not block crew readiness now', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [
      { id: 'pe', start: '2026-04-26T13:00Z', end: '2026-04-26T20:00Z', resource: 'e1', category: 'pto' },
    ], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.crewReady).toBe(true);
    // …but the same booking checked at 1pm does block.
    const later = decorateDispatchRows(skeleton, ONE_PM, [
      { id: 'pe', start: '2026-04-26T13:00Z', end: '2026-04-26T20:00Z', resource: 'e1', category: 'pto' },
    ], EMPLOYEES);
    expect(later.find(r => r.asset.id === 'a1')?.crewReady).toBe(false);
  });
});

describe('decorateDispatchRows — equipment readiness', () => {
  const skeleton = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');

  it('reports equipmentReady=false only when the asset is in maintenance', () => {
    const rows = decorateDispatchRows(skeleton, NOON, [], EMPLOYEES);
    expect(rows.find(r => r.asset.id === 'a1')?.equipmentReady).toBe(true);
    expect(rows.find(r => r.asset.id === 'a3')?.equipmentReady).toBe(false);
  });
});

describe('decorateDispatchRows — breakdown (#424 wk4)', () => {
  it('emits a status row marked satisfied for an idle asset', () => {
    const skeleton = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');
    const rows = decorateDispatchRows(skeleton, NOON, [], EMPLOYEES);
    const row = rows.find(r => r.asset.id === 'a1');
    const status = row?.breakdown.find(b => b.id === 'status');
    expect(status?.satisfied).toBe(true);
    expect(status?.label.toLowerCase()).toContain('free');
  });

  it('marks the equipment row unsatisfied for a maintenance asset', () => {
    const skeleton = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');
    const rows = decorateDispatchRows(skeleton, NOON, [], EMPLOYEES);
    const row = rows.find(r => r.asset.id === 'a3');
    const equipment = row?.breakdown.find(b => b.id === 'equipment');
    expect(equipment?.satisfied).toBe(false);
    expect(equipment?.severity).toBe('hard');
  });

  it('marks the crew row unsatisfied when no employee is free at the asset base', () => {
    const skeleton = computeDispatchRows(NOON, ASSETS, EMPLOYEES, BASES, 'Base');
    const rows = decorateDispatchRows(skeleton, NOON, [
      // Alex (only Logan employee) booked at noon
      { id: 'evt', start: NOON, end: ONE_PM, resource: 'e1' },
    ], EMPLOYEES);
    const row = rows.find(r => r.asset.id === 'a1');
    const crew = row?.breakdown.find(b => b.id === 'crew');
    expect(crew?.satisfied).toBe(false);
    expect(crew?.severity).toBe('hard');
  });

  it('emits a base-assignment shortfall when the asset has no base', () => {
    const orphan = { id: 'a-orphan', label: 'Drone', meta: {} };
    const skeleton = computeDispatchRows(NOON, [orphan], EMPLOYEES, BASES, 'Hub');
    const rows = decorateDispatchRows(skeleton, NOON, [], EMPLOYEES);
    const base = rows[0]?.breakdown.find(b => b.id === 'base');
    expect(base).toBeDefined();
    expect(base?.satisfied).toBe(false);
    expect(base?.severity).toBe('hard');
  });
});
