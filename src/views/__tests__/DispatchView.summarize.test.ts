/**
 * DispatchView — readiness breakdown labels (sprint #424 week 4).
 *
 * `summarizeReadiness` is the headline-label generator: it walks a
 * row's structured breakdown and produces "Ready" / "Needs paramedic"
 * / "Needs 2 more crew" so the dispatcher sees the actionable verdict
 * without expanding the disclosure panel.
 */
import { describe, it, expect } from 'vitest';

import { summarizeReadiness, type DispatchRow } from '../DispatchView';

function makeRow(overrides: Partial<DispatchRow> = {}): DispatchRow {
  return {
    asset: { id: 'a1' },
    baseId: 'b1',
    baseName: 'Base 1',
    status: 'available',
    blockingEvent: null,
    crewReady: true,
    equipmentReady: true,
    missing: [],
    breakdown: [],
    ...overrides,
  };
}

describe('summarizeReadiness', () => {
  it('returns Ready when no breakdown shortfalls and no legacy missing line', () => {
    expect(summarizeReadiness(makeRow())).toEqual({ label: 'Ready', ready: true });
  });

  it('falls back to legacy missing line when no breakdown is present', () => {
    const result = summarizeReadiness(makeRow({ missing: ['No crew available at this base'] }));
    expect(result.ready).toBe(false);
    expect(result.label.toLowerCase()).toContain('needs');
    expect(result.label.toLowerCase()).toContain('no crew');
  });

  it('phrases a single role shortfall using the role label', () => {
    const result = summarizeReadiness(makeRow({
      breakdown: [{
        kind: 'role', label: 'Paramedic',
        satisfied: false, required: 1, assigned: 0, severity: 'hard',
      }],
    }));
    expect(result).toEqual(expect.objectContaining({
      ready: false,
      label: 'Needs paramedic',
    }));
  });

  it('phrases a multi-headcount role shortfall with a count', () => {
    const result = summarizeReadiness(makeRow({
      breakdown: [{
        kind: 'role', label: 'Crew',
        satisfied: false, required: 3, assigned: 1, severity: 'hard',
      }],
    }));
    expect(result.label).toBe('Needs 2 more crew');
  });

  it('rolls up multiple hard shortfalls into a count', () => {
    const result = summarizeReadiness(makeRow({
      breakdown: [
        { kind: 'role', label: 'Paramedic', satisfied: false, required: 1, assigned: 0, severity: 'hard' },
        { kind: 'role', label: 'Pilot',     satisfied: false, required: 1, assigned: 0, severity: 'hard' },
      ],
    }));
    expect(result.ready).toBe(false);
    expect(result.label).toBe('Needs 2 requirements');
    expect(result.reason).toContain('Paramedic');
    expect(result.reason).toContain('Pilot');
  });

  it('treats soft shortfalls as warnings — still Ready', () => {
    const result = summarizeReadiness(makeRow({
      breakdown: [{
        kind: 'role', label: 'Paramedic',
        satisfied: false, required: 1, assigned: 0, severity: 'soft',
      }],
    }));
    expect(result).toEqual({ label: 'Ready', ready: true });
  });

  it('phrases a pool shortfall using the pool label', () => {
    const result = summarizeReadiness(makeRow({
      breakdown: [{
        kind: 'pool', label: 'Cert pool',
        satisfied: false, required: 2, assigned: 0, severity: 'hard',
      }],
    }));
    expect(result.label).toBe('Needs 2 from Cert pool');
  });
});
