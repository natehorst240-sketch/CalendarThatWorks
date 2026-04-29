/**
 * Unit tests for `applyMissionOverride` — the pure helper that swaps
 * generic readiness for a host-supplied per-mission verdict.
 *
 * Calendar-driven status is intentionally preserved across the override
 * so a mission-fit aircraft that is currently in maintenance still
 * reads as Maintenance (you can't fly a broken plane). These tests
 * pin that contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { applyMissionOverride } from '../DispatchView';
import type { DispatchRow } from '../DispatchView';

const NOON = new Date('2026-04-26T12:00:00Z');

function row(overrides: Partial<DispatchRow> = {}): DispatchRow {
  return {
    asset: { id: 'a1', label: 'N801AW', meta: { base: 'b-logan' } },
    baseId: 'b-logan',
    baseName: 'Logan',
    status: 'available',
    blockingEvent: null,
    crewReady: true,
    equipmentReady: true,
    missing: [],
    breakdown: [],
    ...overrides,
  };
}

describe('applyMissionOverride', () => {
  it('replaces crew/equipment readiness with the evaluator verdict', () => {
    const evaluator = () => ({
      crewReady: false,
      equipmentReady: false,
      missing: ['Need IFR pilot', 'Aircraft missing capability: Critical Care'],
    });
    const out = applyMissionOverride([row()], evaluator, 'm1', NOON);
    expect(out[0]?.crewReady).toBe(false);
    expect(out[0]?.equipmentReady).toBe(false);
    expect(out[0]?.missing).toContain('Need IFR pilot');
    expect(out[0]?.missing).toContain('Aircraft missing capability: Critical Care');
  });

  it('preserves status (busy / maintenance / available)', () => {
    const evaluator = () => ({ crewReady: true, equipmentReady: true, missing: [] });
    const inputs: DispatchRow[] = [
      row({ status: 'available' }),
      row({ status: 'busy', asset: { id: 'a2', label: 'N802', meta: { base: 'b-logan' } } }),
      row({ status: 'maintenance', asset: { id: 'a3', label: 'N803', meta: { base: 'b-logan' } } }),
    ];
    const out = applyMissionOverride(inputs, evaluator, 'm1', NOON);
    expect(out.map(r => r.status)).toEqual(['available', 'busy', 'maintenance']);
  });

  it('drops generic available-row notes (they were placeholders for empty)', () => {
    // Available rows in the base pipeline have empty `missing[]` already, but
    // the helper should not echo any incidental notes that may exist there.
    const evaluator = () => ({ crewReady: true, equipmentReady: true, missing: [] });
    const out = applyMissionOverride(
      [row({ status: 'available', missing: ['stale note'] })],
      evaluator, 'm1', NOON,
    );
    expect(out[0]?.missing).toEqual([]);
  });

  it('keeps base notes for busy/maintenance rows so blockers stay visible', () => {
    const evaluator = () => ({
      crewReady: false,
      equipmentReady: true,
      missing: ['Need 4 IFR pilots; 2 ready at base'],
    });
    const busyRow = row({
      status: 'busy',
      missing: ['Busy: Trauma transport'],
    });
    const out = applyMissionOverride([busyRow], evaluator, 'm1', NOON);
    expect(out[0]?.missing).toEqual([
      'Busy: Trauma transport',
      'Need 4 IFR pilots; 2 ready at base',
    ]);
  });

  it('forwards (assetId, missionId, asOf) to the evaluator unchanged', () => {
    const evaluator = vi.fn(() => ({ crewReady: true, equipmentReady: true, missing: [] }));
    applyMissionOverride([row({ asset: { id: 42, meta: { base: 'b-logan' } } })], evaluator, 'mission-x', NOON);
    expect(evaluator).toHaveBeenCalledWith('42', 'mission-x', NOON);
  });

  it('calls the evaluator once per row', () => {
    const evaluator = vi.fn(() => ({ crewReady: true, equipmentReady: true, missing: [] }));
    applyMissionOverride(
      [row(), row({ asset: { id: 'a2', meta: { base: 'b-logan' } } })],
      evaluator, 'm1', NOON,
    );
    expect(evaluator).toHaveBeenCalledTimes(2);
  });

  it('returns a fresh array — does not mutate the input rows', () => {
    const input = [row()];
    const evaluator = () => ({ crewReady: false, equipmentReady: true, missing: ['x'] });
    const out = applyMissionOverride(input, evaluator, 'm1', NOON);
    expect(out).not.toBe(input);
    expect(input[0]?.crewReady).toBe(true); // original untouched
    expect(out[0]?.crewReady).toBe(false);
  });

  it('coerces non-string asset ids before passing to the evaluator', () => {
    const evaluator = vi.fn<(...args: [string, string, Date]) => { crewReady: boolean; equipmentReady: boolean; missing: string[] }>(
      () => ({ crewReady: true, equipmentReady: true, missing: [] }),
    );
    applyMissionOverride(
      [row({ asset: { id: 42, meta: { base: 'b-logan' } } })],
      evaluator, 'm1', NOON,
    );
    expect(evaluator.mock.calls[0]?.[0]).toBe('42');
  });
});
