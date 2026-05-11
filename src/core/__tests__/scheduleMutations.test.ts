import { describe, expect, it } from 'vitest';
import {
  buildCoverageMeta,
  buildOpenShiftPatch,
  buildShiftStatusMeta,
  findLinkedMirroredCoverage,
  findLinkedOpenShifts,
} from '../scheduleMutations';

import { resolveEventId } from '../scheduleMutations';

describe('resolveEventId', () => {
  it('returns empty string for null ev', () => {
    expect(resolveEventId(null)).toBe('');
  });

  it('returns empty string for undefined ev', () => {
    expect(resolveEventId(undefined)).toBe('');
  });

  it('prefers _eventId over id', () => {
    expect(resolveEventId({ _eventId: 'occ-1', id: 'master-1' })).toBe('occ-1');
  });

  it('falls back to id when _eventId is absent', () => {
    expect(resolveEventId({ id: 'ev-42' })).toBe('ev-42');
  });
});

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
    const first = found[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('Expected linked open shift');
    expect(first.id).toBe('open-1');
  });

  it('finds linked mirrors by source shift id', () => {
    const found = findLinkedMirroredCoverage([mirror], shift);
    expect(found).toHaveLength(1);
  });

  it('builds status meta and clears linked fields when status removed', () => {
    const withStatus = buildShiftStatusMeta(shift, { status: 'pto', openShiftId: 'open-1' });
    expect(withStatus['shiftStatus']).toBe('pto');
    expect(withStatus['openShiftId']).toBe('open-1');

    const cleared = buildShiftStatusMeta({ ...shift, meta: { ...withStatus, coveredBy: 'emp-2' } }, { status: null });
    expect(cleared['shiftStatus']).toBeUndefined();
    expect(cleared['coveredBy']).toBeUndefined();
    expect(cleared['openShiftId']).toBeUndefined();
  });

  it('builds coverage and open-shift patch payloads', () => {
    const coverage = buildCoverageMeta(shift, 'emp-2', 'open-1');
    expect(coverage['coveredBy']).toBe('emp-2');
    expect(coverage['openShiftId']).toBe('open-1');

    const patch = buildOpenShiftPatch(openShift, shift, 'pto');
    expect(patch.meta['kind']).toBe('open-shift');
    expect(patch.meta['sourceShiftId']).toBe('shift-1');
    expect(patch.meta['reason']).toBe('pto');
  });

  it('findLinkedOpenShifts returns empty when shiftEvent has no id', () => {
    const found = findLinkedOpenShifts([openShift], {});
    expect(found).toHaveLength(0);
  });

  it('findLinkedOpenShifts matches by linkedById when meta.openShiftId is set', () => {
    const shiftWithOpenLink = { ...shift, meta: { openShiftId: 'open-1' } };
    const found = findLinkedOpenShifts([openShift], shiftWithOpenLink);
    expect(found).toHaveLength(1);
  });

  it('buildCoverageMeta falls back to shiftEvent.meta.openShiftId when openShiftId arg is falsy', () => {
    const shiftWithExistingOpenId = { ...shift, meta: { openShiftId: 'fallback-open' } };
    const coverage = buildCoverageMeta(shiftWithExistingOpenId, 'emp-3', null);
    expect(coverage['openShiftId']).toBe('fallback-open');
  });

  it('buildCoverageMeta uses ev.meta from null shiftEvent gracefully', () => {
    const coverage = buildCoverageMeta(null, 'emp-3', 'open-99');
    expect(coverage['coveredBy']).toBe('emp-3');
    expect(coverage['openShiftId']).toBe('open-99');
  });

  it('buildOpenShiftPatch uses employeeId field as fallback for originalEmployeeId', () => {
    const shiftWithEmployeeId = { ...shift, resource: undefined, employeeId: 'emp-fallback' };
    const patch = buildOpenShiftPatch(openShift, shiftWithEmployeeId, 'pto');
    expect(patch.meta['originalEmployeeId']).toBe('emp-fallback');
  });

  it('buildOpenShiftPatch parses string start/end dates', () => {
    const strShift = { ...shift, start: '2026-04-01T00:00:00.000Z' as any, end: '2026-04-01T08:00:00.000Z' as any };
    const patch = buildOpenShiftPatch(openShift, strShift, 'pto');
    expect(patch.start).toBeInstanceOf(Date);
    expect(patch.end).toBeInstanceOf(Date);
  });

  it('buildShiftStatusMeta does not overwrite inherited openShiftId when openShiftId arg is absent', () => {
    // shift.meta already has openShiftId='open-1'; it should survive the merge
    const meta = buildShiftStatusMeta(shift, { status: 'pto', openShiftId: undefined });
    expect(meta['shiftStatus']).toBe('pto');
    // inherited from shiftEvent.meta spread — only overwritten if openShiftId arg is truthy
    expect(meta['openShiftId']).toBe('open-1');
  });

  // ── additional branch coverage ────────────────────────────────────────────

  it('findLinkedOpenShifts ignores null candidates in the events array', () => {
    // Covers the if (!candidate) return false branch
    const found = findLinkedOpenShifts([null, openShift], shift);
    expect(found).toHaveLength(1);
  });

  it('findLinkedOpenShifts skips candidates that are not open-shift events', () => {
    // Covers the if (!isOpenShiftEvent(candidate)) return false branch
    const regular = { id: 'regular-1', title: 'Regular', meta: { sourceShiftId: 'shift-1' } };
    const found = findLinkedOpenShifts([regular, openShift], shift);
    expect(found).toHaveLength(1);
  });

  it('findLinkedOpenShifts links via sourceShiftId when openShiftId is absent from shiftEvent meta', () => {
    // Covers the false side of Boolean(shiftEvent?.meta?.['openShiftId']) &&
    const shiftNoOpenId = { ...shift, meta: {} };
    const found = findLinkedOpenShifts([openShift], shiftNoOpenId);
    expect(found).toHaveLength(1);
  });

  it('findLinkedOpenShifts returns no match when candidate has no sourceShiftId', () => {
    // Covers the ?? '' fallback for candidate meta.sourceShiftId
    const noSourceCandidate = { id: 'open-2', category: 'open-shift', meta: {} };
    const shiftNoOpenId = { ...shift, meta: {} };
    const found = findLinkedOpenShifts([noSourceCandidate], shiftNoOpenId);
    expect(found).toHaveLength(0);
  });

  it('findLinkedMirroredCoverage returns empty when shiftEvent has no id', () => {
    // Covers the if (!shiftId) return [] branch in findLinkedMirroredCoverage
    const found = findLinkedMirroredCoverage([mirror], {});
    expect(found).toHaveLength(0);
  });

  it('findLinkedMirroredCoverage ignores candidate with no sourceShiftId', () => {
    // Covers ?? '' fallback for candidate.meta.sourceShiftId in findLinkedMirroredCoverage
    const noSource = { id: 'cover-2', meta: { kind: 'covering' } };
    const found = findLinkedMirroredCoverage([noSource], shift);
    expect(found).toHaveLength(0);
  });

  it('buildShiftStatusMeta handles null meta on shiftEvent (spreads {} fallback)', () => {
    // Covers shiftEvent?.meta ?? {} when meta is absent
    const meta = buildShiftStatusMeta({ id: 'ev-x' }, { status: 'pto' });
    expect(meta['shiftStatus']).toBe('pto');
  });

  it('buildOpenShiftPatch uses "Shift" fallback when title is absent', () => {
    // Covers shiftEvent?.title ?? 'Shift' fallback
    const { title: _title, ...noTitle } = shift;
    const patch = buildOpenShiftPatch(openShift, noTitle, 'pto');
    expect(patch.title).toBe('Open: Shift');
  });

  it('buildOpenShiftPatch handles existingOpenShift with null meta (spreads {} fallback)', () => {
    // Covers existingOpenShift?.meta ?? {} when meta is absent
    const noMeta = { id: 'open-null-meta' };
    const patch = buildOpenShiftPatch(noMeta, shift, 'pto');
    expect(patch.meta['kind']).toBe('open-shift');
  });

  it('buildOpenShiftPatch uses empty string when both resource and employeeId are absent', () => {
    // Covers shiftEvent?.resource ?? shiftEvent?.employeeId ?? '' (third fallback)
    const noResource = { ...shift, resource: undefined, employeeId: undefined };
    const patch = buildOpenShiftPatch(openShift, noResource, 'pto');
    expect(patch.meta['originalEmployeeId']).toBe('');
  });
});
