/**
 * Unit tests for src/core/scheduleOverlap.js
 */
import { describe, it, expect } from 'vitest';
import { intervalsOverlap, detectShiftConflicts, buildOpenShiftEvent } from '../scheduleOverlap';

// ─── intervalsOverlap ─────────────────────────────────────────────────────────

describe('intervalsOverlap', () => {
  const d = (iso: string) => new Date(iso);

  it('returns true when intervals overlap in the middle', () => {
    expect(intervalsOverlap(
      d('2026-04-14T08:00'), d('2026-04-14T16:00'),
      d('2026-04-14T12:00'), d('2026-04-14T20:00'),
    )).toBe(true);
  });

  it('returns true when one interval is fully inside the other', () => {
    expect(intervalsOverlap(
      d('2026-04-14T08:00'), d('2026-04-14T20:00'),
      d('2026-04-14T10:00'), d('2026-04-14T12:00'),
    )).toBe(true);
  });

  it('returns false for non-overlapping intervals', () => {
    expect(intervalsOverlap(
      d('2026-04-14T08:00'), d('2026-04-14T12:00'),
      d('2026-04-14T13:00'), d('2026-04-14T17:00'),
    )).toBe(false);
  });

  it('returns false for touching intervals (aEnd === bStart)', () => {
    expect(intervalsOverlap(
      d('2026-04-14T08:00'), d('2026-04-14T12:00'),
      d('2026-04-14T12:00'), d('2026-04-14T16:00'),
    )).toBe(false);
  });

  it('returns true for identical intervals', () => {
    expect(intervalsOverlap(
      d('2026-04-15T00:00'), d('2026-04-16T00:00'),
      d('2026-04-15T00:00'), d('2026-04-16T00:00'),
    )).toBe(true);
  });
});

// ─── detectShiftConflicts ─────────────────────────────────────────────────────

describe('detectShiftConflicts', () => {
  const empId = 'emp-1';
  const d = (iso: string) => new Date(iso);

  function makeShift(overrides = {}) {
    return {
      id:       'shift-1',
      title:    'On-Call Shift',
      start:    d('2026-04-15T08:00'),
      end:      d('2026-04-15T20:00'),
      category: 'on-call',
      resource: empId,
      meta:     {},
      ...overrides,
    };
  }

  it('detects a conflict when PTO overlaps an on-call shift', () => {
    const shift = makeShift();
    const result = detectShiftConflicts({
      employeeId:   empId,
      requestStart: d('2026-04-15T00:00'),
      requestEnd:   d('2026-04-16T00:00'),
      allEvents:    [shift],
    });
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingEvents).toHaveLength(1);
    expect(result.conflictingEvents[0].id!).toBe('shift-1');
  });

  it('does NOT flag events belonging to a different employee', () => {
    const shift = makeShift({ resource: 'emp-2' });
    const result = detectShiftConflicts({
      employeeId:   empId,
      requestStart: d('2026-04-15T00:00'),
      requestEnd:   d('2026-04-16T00:00'),
      allEvents:    [shift],
    });
    expect(result.hasConflict).toBe(false);
  });

  it('does NOT flag events that are already covered', () => {
    const shift = makeShift({ meta: { shiftStatus: 'covered', coveredBy: 'emp-2' } });
    const result = detectShiftConflicts({
      employeeId:   empId,
      requestStart: d('2026-04-15T00:00'),
      requestEnd:   d('2026-04-16T00:00'),
      allEvents:    [shift],
    });
    expect(result.hasConflict).toBe(false);
  });

  it('does NOT flag non-shift events (meetings, etc.)', () => {
    const meeting = makeShift({ category: 'meeting' });
    const result = detectShiftConflicts({
      employeeId:   empId,
      requestStart: d('2026-04-15T00:00'),
      requestEnd:   d('2026-04-16T00:00'),
      allEvents:    [meeting],
    });
    expect(result.hasConflict).toBe(false);
  });

  it('flags shifts detected via meta.kind = "shift"', () => {
    const shift = makeShift({ category: 'some-custom-cat', meta: { kind: 'shift' } });
    const result = detectShiftConflicts({
      employeeId:   empId,
      requestStart: d('2026-04-15T00:00'),
      requestEnd:   d('2026-04-16T00:00'),
      allEvents:    [shift],
    });
    expect(result.hasConflict).toBe(true);
  });

  it('flags shifts detected via meta.onCall = true', () => {
    const shift = makeShift({ category: 'operations', meta: { onCall: true } });
    const result = detectShiftConflicts({
      employeeId:   empId,
      requestStart: d('2026-04-15T00:00'),
      requestEnd:   d('2026-04-16T00:00'),
      allEvents:    [shift],
    });
    expect(result.hasConflict).toBe(true);
  });

  it('respects a custom onCallCategory', () => {
    const shift = makeShift({ category: 'roster' });
    const result = detectShiftConflicts({
      employeeId:    empId,
      requestStart:  d('2026-04-15T00:00'),
      requestEnd:    d('2026-04-16T00:00'),
      allEvents:     [shift],
      onCallCategory: 'roster',
    });
    expect(result.hasConflict).toBe(true);
  });

  it('returns no conflict when the shift is before the request window', () => {
    const shift = makeShift({
      start: d('2026-04-14T08:00'),
      end:   d('2026-04-14T20:00'),
    });
    const result = detectShiftConflicts({
      employeeId:   empId,
      requestStart: d('2026-04-15T00:00'),
      requestEnd:   d('2026-04-16T00:00'),
      allEvents:    [shift],
    });
    expect(result.hasConflict).toBe(false);
  });

  it('returns no conflict for missing / empty inputs', () => {
    expect(detectShiftConflicts({ employeeId: empId, requestStart: null, requestEnd: null, allEvents: [] }).hasConflict).toBe(false);
    expect(detectShiftConflicts({ employeeId: '', requestStart: new Date(), requestEnd: new Date(), allEvents: [] }).hasConflict).toBe(false);
  });
});

// ─── buildOpenShiftEvent ──────────────────────────────────────────────────────

describe('buildOpenShiftEvent', () => {
  const d = (iso: string) => new Date(iso);

  const shiftEvent = {
    id:       'shift-42',
    title:    'Night On-Call',
    start:    d('2026-04-15T20:00'),
    end:      d('2026-04-16T08:00'),
    category: 'on-call',
    resource: 'emp-1',
  };

  it('creates an open-shift event with correct meta', () => {
    const ev = buildOpenShiftEvent({ shiftEvent, reason: 'pto' });
    expect(ev.category).toBe('open-shift');
    expect(ev.meta.kind).toBe('open-shift');
    expect(ev.meta.reason).toBe('pto');
    expect(ev.meta.status).toBe('open');
    expect(ev.meta.coveredBy).toBeNull();
    expect(ev.meta.originalEmployeeId).toBe('emp-1');
    expect(ev.meta.sourceShiftId).toBe('shift-42');
  });

  it('copies start/end from the shift event', () => {
    const ev = buildOpenShiftEvent({ shiftEvent, reason: 'unavailable' });
    expect(ev.start).toEqual(d('2026-04-15T20:00'));
    expect(ev.end).toEqual(d('2026-04-16T08:00'));
  });

  it('sets resource to null (unassigned)', () => {
    const ev = buildOpenShiftEvent({ shiftEvent, reason: 'pto' });
    expect(ev.resource).toBeNull();
  });

  it('uses a custom openShiftCategory', () => {
    const ev = buildOpenShiftEvent({ shiftEvent, reason: 'pto', openShiftCategory: 'needs-cover' });
    expect(ev.category).toBe('needs-cover');
  });

  it('generates an open-shift id with a source-based prefix', () => {
    const a = buildOpenShiftEvent({ shiftEvent, reason: 'pto' });
    const b = buildOpenShiftEvent({ shiftEvent, reason: 'pto' });
    expect(a.id.startsWith('open-shift-42-')).toBe(true);
    expect(b.id.startsWith('open-shift-42-')).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  it('prefers _eventId over id for sourceShiftId', () => {
    const ev = buildOpenShiftEvent({
      shiftEvent: { ...shiftEvent, _eventId: 'occurrence-99' },
      reason: 'pto',
    });
    expect(ev.meta.sourceShiftId).toBe('occurrence-99');
  });
});
