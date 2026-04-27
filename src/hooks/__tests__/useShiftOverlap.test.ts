/**
 * shiftEmployeeIdsAt — pure-helper contract pin.
 */
import { describe, it, expect } from 'vitest';
import { shiftEmployeeIdsAt } from '../useShiftOverlap';

const T = (iso: string) => new Date(iso);

describe('shiftEmployeeIdsAt', () => {
  it('returns an empty set when there are no events', () => {
    expect(shiftEmployeeIdsAt([], T('2026-04-27T12:00:00Z'))).toEqual(new Set());
    expect(shiftEmployeeIdsAt(null)).toEqual(new Set());
    expect(shiftEmployeeIdsAt(undefined)).toEqual(new Set());
  });

  it('includes employees whose shift covers the asOf moment', () => {
    const events = [
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T20:00:00Z'), resource: 'emp-1', meta: { kind: 'shift' } },
      { start: T('2026-04-27T20:00:00Z'), end: T('2026-04-28T08:00:00Z'), resource: 'emp-2', meta: { kind: 'shift' } },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T12:00:00Z'))).toEqual(new Set(['emp-1']));
    expect(shiftEmployeeIdsAt(events, T('2026-04-28T01:00:00Z'))).toEqual(new Set(['emp-2']));
  });

  it('also accepts on-call events', () => {
    const events = [
      { start: T('2026-04-27T00:00:00Z'), end: T('2026-04-28T00:00:00Z'), resource: 'emp-3', meta: { kind: 'on-call' } },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T15:00:00Z'))).toEqual(new Set(['emp-3']));
  });

  it('respects custom onCallCategory', () => {
    const events = [
      { start: T('2026-04-27T00:00:00Z'), end: T('2026-04-28T00:00:00Z'), resource: 'emp-4', category: 'overnight-coverage' },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T15:00:00Z'), 'overnight-coverage'))
      .toEqual(new Set(['emp-4']));
    // Default category does not match.
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T15:00:00Z')))
      .toEqual(new Set());
  });

  it('skips events that do not overlap the asOf moment', () => {
    const events = [
      { start: T('2026-04-26T08:00:00Z'), end: T('2026-04-26T20:00:00Z'), resource: 'emp-5', meta: { kind: 'shift' } },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T12:00:00Z'))).toEqual(new Set());
  });

  it('skips non-shift / non-on-call events', () => {
    const events = [
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T20:00:00Z'), resource: 'emp-6', category: 'training' },
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T20:00:00Z'), resource: 'emp-7', category: 'meeting' },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T12:00:00Z'))).toEqual(new Set());
  });

  it('reads employee id from meta.employeeId / meta.empId when resource is missing', () => {
    const events = [
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T20:00:00Z'), meta: { kind: 'shift', employeeId: 'emp-8' } },
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T20:00:00Z'), meta: { kind: 'shift', empId: 'emp-9' } },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T12:00:00Z'))).toEqual(new Set(['emp-8', 'emp-9']));
  });

  it('skips events without a derivable employee id', () => {
    const events = [
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T20:00:00Z'), meta: { kind: 'shift' } },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T12:00:00Z'))).toEqual(new Set());
  });

  it('treats string ISO and numeric epoch as valid asOf inputs', () => {
    const events = [
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T20:00:00Z'), resource: 'emp-1', meta: { kind: 'shift' } },
    ];
    expect(shiftEmployeeIdsAt(events, '2026-04-27T12:00:00Z')).toEqual(new Set(['emp-1']));
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T12:00:00Z').getTime())).toEqual(new Set(['emp-1']));
  });

  it('deduplicates when one employee has multiple overlapping shifts', () => {
    const events = [
      { start: T('2026-04-27T08:00:00Z'), end: T('2026-04-27T14:00:00Z'), resource: 'emp-1', meta: { kind: 'shift' } },
      { start: T('2026-04-27T13:00:00Z'), end: T('2026-04-27T20:00:00Z'), resource: 'emp-1', meta: { kind: 'shift' } },
    ];
    expect(shiftEmployeeIdsAt(events, T('2026-04-27T13:30:00Z'))).toEqual(new Set(['emp-1']));
  });
});
