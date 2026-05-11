import { describe, it, expect } from 'vitest';
import { validateOverlap } from '../validateOverlap';
import type { ChangeShape, OperationContext } from '../validationTypes';
import type { EngineEvent } from '../../schema/eventSchema';

const t = (h: number) => new Date(2026, 0, 5, h, 0, 0);

function makeEv(id: string, start: Date, end: Date, resourceId: string | null = 'r1'): EngineEvent {
  return { id, title: id, start, end, allDay: false, resourceId } as unknown as EngineEvent;
}

// Base change: a 9–10 block for resource r1 (different event)
const baseChange: ChangeShape = {
  newStart:   t(9),
  newEnd:     t(10),
  event:      makeEv('new', t(9), t(10), 'r1'),
  resourceId: 'r1',
};

describe('validateOverlap', () => {
  it('returns null when conflictPolicy is "allow"', () => {
    const ctx: OperationContext = {
      config: { conflictPolicy: 'allow' },
      events: [makeEv('existing', t(9), t(10), 'r1')],
    };
    expect(validateOverlap(baseChange, ctx)).toBeNull();
  });

  it('returns null when event has no resourceId (unscoped)', () => {
    const change: ChangeShape = { newStart: t(9), newEnd: t(10) }; // no event, no resourceId
    const ctx: OperationContext = { events: [makeEv('existing', t(9), t(10), 'r1')] };
    expect(validateOverlap(change, ctx)).toBeNull();
  });

  it('returns null when no events overlap', () => {
    const ctx: OperationContext = { events: [makeEv('existing', t(11), t(12), 'r1')] };
    expect(validateOverlap(baseChange, ctx)).toBeNull();
  });

  it('returns null when adjacent (touching) events do not overlap', () => {
    // existing ends at 9, new starts at 9 — half-open, no overlap
    const ctx: OperationContext = { events: [makeEv('existing', t(8), t(9), 'r1')] };
    expect(validateOverlap(baseChange, ctx)).toBeNull();
  });

  it('returns soft violation by default when overlap detected', () => {
    const ctx: OperationContext = { events: [makeEv('existing', t(8), t(10), 'r1')] };
    const result = validateOverlap(baseChange, ctx);
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('overlap');
    expect(result!.severity).toBe('soft');
    expect(result!.conflictingEventId).toBe('existing');
  });

  it('returns hard violation when conflictPolicy is "block"', () => {
    const ctx: OperationContext = {
      config: { conflictPolicy: 'block' },
      events: [makeEv('existing', t(8), t(10), 'r1')],
    };
    const result = validateOverlap(baseChange, ctx);
    expect(result!.severity).toBe('hard');
  });

  it('skips self when checking overlaps (event id matches)', () => {
    const self = makeEv('self', t(9), t(10), 'r1');
    const change: ChangeShape = { newStart: t(9), newEnd: t(10), event: self, resourceId: 'r1' };
    const ctx: OperationContext = { events: [self] };
    expect(validateOverlap(change, ctx)).toBeNull();
  });

  it('skips all-day events (they do not block time slots)', () => {
    const allDay = { ...makeEv('all', t(9), t(10), 'r1'), allDay: true } as unknown as EngineEvent;
    const ctx: OperationContext = { events: [allDay] };
    expect(validateOverlap(baseChange, ctx)).toBeNull();
  });

  it('skips events with different resourceId', () => {
    const ctx: OperationContext = { events: [makeEv('other', t(9), t(10), 'r2')] };
    expect(validateOverlap(baseChange, ctx)).toBeNull();
  });

  it('uses resourceId from change.resourceId when event.resourceId is absent', () => {
    const noEvChange: ChangeShape = { newStart: t(9), newEnd: t(10), resourceId: 'r1' };
    const ctx: OperationContext = { events: [makeEv('existing', t(8), t(10), 'r1')] };
    const result = validateOverlap(noEvChange, ctx);
    expect(result!.rule).toBe('overlap');
  });

  it('uses resourceId from change.event.resourceId when change.resourceId is absent', () => {
    const ev = makeEv('new', t(9), t(10), 'r1');
    const change: ChangeShape = { newStart: t(9), newEnd: t(10), event: ev };
    const ctx: OperationContext = { events: [makeEv('existing', t(8), t(10), 'r1')] };
    const result = validateOverlap(change, ctx);
    expect(result!.rule).toBe('overlap');
  });

  it('violation message includes resourceId and conflicting event title', () => {
    const ctx: OperationContext = { events: [makeEv('ev2', t(8), t(10), 'r1')] };
    const result = validateOverlap(baseChange, ctx);
    expect(result!.message).toContain('r1');
    expect(result!.message).toContain('ev2');
  });

  it('returns null when events array is empty', () => {
    const ctx: OperationContext = { events: [] };
    expect(validateOverlap(baseChange, ctx)).toBeNull();
  });

  it('returns null when events is undefined', () => {
    const ctx: OperationContext = {};
    expect(validateOverlap(baseChange, ctx)).toBeNull();
  });
});
