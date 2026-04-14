import { describe, expect, it } from 'vitest';
import {
  buildCoverageMeta,
  buildOpenShiftPatch,
  buildShiftStatusMeta,
  findLinkedMirroredCoverage,
  findLinkedOpenShifts,
} from '../scheduleMutations.js';

describe('scheduleMutations helpers', () => {
  const shift = {
    id: 'shift-1',
    resource: 'emp-1',
    title: 'Night Shift',
    start: new Date('2026-04-01T00:00:00.000Z'),
    end: new Date('2026-04-01T08:00:00.000Z'),
    meta: { openShiftId: 'open-1' },
  };

  const openShift = {
    id: 'open-1',
    category: 'open-shift',
    meta: { kind: 'open-shift', sourceShiftId: 'shift-1' },
  };

  const mirror = {
    id: 'cover-1',
    meta: { kind: 'covering', sourceShiftId: 'shift-1' },
  };

  it('finds linked open shifts by id/source', () => {
    const found = findLinkedOpenShifts([openShift], shift);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('open-1');
  });

  it('finds linked mirrors by source shift id', () => {
    const found = findLinkedMirroredCoverage([mirror], shift);
    expect(found).toHaveLength(1);
  });

  it('builds status meta and clears linked fields when status removed', () => {
    const withStatus = buildShiftStatusMeta(shift, { status: 'pto', openShiftId: 'open-1' });
    expect(withStatus.shiftStatus).toBe('pto');
    expect(withStatus.openShiftId).toBe('open-1');

    const cleared = buildShiftStatusMeta({ ...shift, meta: { ...withStatus, coveredBy: 'emp-2' } }, { status: null });
    expect(cleared.shiftStatus).toBeUndefined();
    expect(cleared.coveredBy).toBeUndefined();
    expect(cleared.openShiftId).toBeUndefined();
  });

  it('builds coverage and open-shift patch payloads', () => {
    const coverage = buildCoverageMeta(shift, 'emp-2', 'open-1');
    expect(coverage.coveredBy).toBe('emp-2');
    expect(coverage.openShiftId).toBe('open-1');

    const patch = buildOpenShiftPatch(openShift, shift, 'pto');
    expect(patch.meta.kind).toBe('open-shift');
    expect(patch.meta.sourceShiftId).toBe('shift-1');
    expect(patch.meta.reason).toBe('pto');
  });
});
