// @vitest-environment node
/**
 * API v1 — schema round-trip regression tests.
 *
 * Covers:
 *  - serializeEvent / deserializeEvent round-trip (all field types)
 *  - serializeConstraint / deserializeConstraint
 *  - serializeSyncMetadata / deserializeSyncMetadata
 *  - serializeDate / deserializeDate edge cases
 *  - JSON.stringify → JSON.parse → deserializeEvent (real-world transport path)
 *  - Type guard / helper smoke tests (makeEvent, makeAssignment, etc.)
 */

import { describe, it, expect } from 'vitest';
import {
  serializeDate,
  deserializeDate,
  serializeConstraint,
  deserializeConstraint,
  serializeSyncMetadata,
  deserializeSyncMetadata,
  serializeEvent,
  deserializeEvent,
} from '../serialization';
import {
  SCHEMA_VERSION,
  makeEvent,
  isRecurringSeries,
  isDetachedOccurrence,
  isPartOfSeries,
  makeAssignment,
  assignmentsForEvent,
  resourceIdsForEvent,
  workloadForResource,
  makeDependency,
  constrainedAnchor,
  isDependencyViolated,
  hasCycle,
  wouldCreateCycle,
  satisfiesConstraint,
  constraintSeverity,
  describeConstraint,
} from '../types';
import type {
  EngineEvent,
  SyncMetadata,
  Assignment,
  Dependency,
  EventConstraint,
} from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const START = new Date('2026-04-10T09:00:00.000Z');
const END   = new Date('2026-04-10T10:00:00.000Z');

function makeBaseEvent(overrides: Partial<Omit<EngineEvent, 'id' | 'title' | 'start' | 'end'>> = {}): EngineEvent {
  return makeEvent('evt-1', {
    title: 'Stand-up',
    start: START,
    end:   END,
    ...overrides,
  });
}

// ─── SCHEMA_VERSION ───────────────────────────────────────────────────────────

describe('SCHEMA_VERSION', () => {
  it('is the string "1"', () => {
    expect(SCHEMA_VERSION).toBe('1');
  });
});

// ─── serializeDate / deserializeDate ─────────────────────────────────────────

describe('serializeDate', () => {
  it('converts a Date to ISO 8601', () => {
    expect(serializeDate(START)).toBe('2026-04-10T09:00:00.000Z');
  });

  it('returns null for null', () => {
    expect(serializeDate(null)).toBeNull();
  });
});

describe('deserializeDate', () => {
  it('parses an ISO string back to a Date', () => {
    const d = deserializeDate('2026-04-10T09:00:00.000Z');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).toBe(START.getTime());
  });

  it('returns null for null', () => {
    expect(deserializeDate(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(deserializeDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(deserializeDate('')).toBeNull();
  });

  it('throws RangeError for an unparseable string', () => {
    expect(() => deserializeDate('not-a-date')).toThrow(RangeError);
  });

  it('round-trips a Date through serialize → deserialize', () => {
    const d = new Date('2026-06-15T14:30:00.000Z');
    expect(deserializeDate(serializeDate(d))!.getTime()).toBe(d.getTime());
  });
});

// ─── serializeConstraint / deserializeConstraint ─────────────────────────────

describe('constraint serialization', () => {
  it('round-trips asap (no date)', () => {
    const c: EventConstraint = { type: 'asap' };
    const s = serializeConstraint(c);
    expect(s).toEqual({ type: 'asap' });
    const back = deserializeConstraint(s);
    expect(back).toEqual({ type: 'asap' });
    expect(back.date).toBeUndefined();
  });

  it('round-trips must-start-on with a date', () => {
    const pinDate = new Date('2026-04-10T09:00:00.000Z');
    const c: EventConstraint = { type: 'must-start-on', date: pinDate };
    const s = serializeConstraint(c);
    expect(typeof s.date).toBe('string');
    const back = deserializeConstraint(s);
    expect(back.type).toBe('must-start-on');
    expect(back.date!.getTime()).toBe(pinDate.getTime());
  });

  it('round-trips every constraint type', () => {
    const types: Array<EventConstraint['type']> = [
      'asap', 'alap', 'must-start-on', 'must-end-on',
      'snet', 'snlt', 'enet', 'enlt',
    ];
    const refDate = new Date('2026-05-01T00:00:00.000Z');
    for (const type of types) {
      const c: EventConstraint = type === 'asap' || type === 'alap'
        ? { type }
        : { type, date: refDate };
      const back = deserializeConstraint(serializeConstraint(c));
      expect(back.type).toBe(type);
      if (c.date) expect(back.date!.getTime()).toBe(refDate.getTime());
    }
  });
});

// ─── serializeSyncMetadata / deserializeSyncMetadata ─────────────────────────

describe('SyncMetadata serialization', () => {
  const fullSync: SyncMetadata = {
    externalId:   'google-abc123',
    syncSource:   'google-calendar',
    syncToken:    'v=1;token=xyz',
    lastSyncedAt: new Date('2026-04-09T08:00:00.000Z'),
    version:      42,
    updatedAt:    new Date('2026-04-09T09:00:00.000Z'),
  };

  it('serializes optional Date fields to strings', () => {
    const s = serializeSyncMetadata(fullSync);
    expect(typeof s.lastSyncedAt).toBe('string');
    expect(typeof s.updatedAt).toBe('string');
    expect(s.externalId).toBe('google-abc123');
    expect(s.version).toBe(42);
  });

  it('round-trips full SyncMetadata', () => {
    const back = deserializeSyncMetadata(serializeSyncMetadata(fullSync));
    expect(back.externalId).toBe(fullSync.externalId);
    expect(back.syncSource).toBe(fullSync.syncSource);
    expect(back.syncToken).toBe(fullSync.syncToken);
    expect(back.lastSyncedAt!.getTime()).toBe(fullSync.lastSyncedAt!.getTime());
    expect(back.version).toBe(fullSync.version);
    expect(back.updatedAt!.getTime()).toBe(fullSync.updatedAt!.getTime());
  });

  it('round-trips minimal SyncMetadata (no optional fields)', () => {
    const minimal: SyncMetadata = { externalId: 'x', syncSource: 'outlook' };
    const back = deserializeSyncMetadata(serializeSyncMetadata(minimal));
    expect(back.externalId).toBe('x');
    expect(back.syncSource).toBe('outlook');
    expect(back.syncToken).toBeUndefined();
    expect(back.lastSyncedAt).toBeUndefined();
    expect(back.version).toBeUndefined();
    expect(back.updatedAt).toBeUndefined();
  });
});

// ─── serializeEvent / deserializeEvent ───────────────────────────────────────

describe('event serialization: minimal event', () => {
  it('serializes start/end to ISO strings', () => {
    const s = serializeEvent(makeBaseEvent());
    expect(s.start).toBe(START.toISOString());
    expect(s.end).toBe(END.toISOString());
  });

  it('round-trips a minimal event', () => {
    const ev = makeBaseEvent();
    const back = deserializeEvent(serializeEvent(ev));
    expect(back.id).toBe(ev.id);
    expect(back.title).toBe(ev.title);
    expect(back.start.getTime()).toBe(ev.start.getTime());
    expect(back.end.getTime()).toBe(ev.end.getTime());
    expect(back.allDay).toBe(false);
    expect(back.status).toBe('confirmed');
    expect(back.rrule).toBeNull();
    expect(back.exdates).toHaveLength(0);
    expect(back.constraints).toHaveLength(0);
  });
});

describe('event serialization: exdates', () => {
  it('serializes exdates to ISO strings', () => {
    const exdate = new Date('2026-04-17T09:00:00.000Z');
    const ev = makeBaseEvent({ exdates: [exdate] });
    const s = serializeEvent(ev);
    expect(s.exdates).toHaveLength(1);
    expect(typeof s.exdates[0]).toBe('string');
    expect(s.exdates[0]).toBe(exdate.toISOString());
  });

  it('round-trips exdates', () => {
    const d1 = new Date('2026-04-17T09:00:00.000Z');
    const d2 = new Date('2026-04-24T09:00:00.000Z');
    const ev = makeBaseEvent({ exdates: [d1, d2] });
    const back = deserializeEvent(serializeEvent(ev));
    expect(back.exdates).toHaveLength(2);
    expect(back.exdates[0].getTime()).toBe(d1.getTime());
    expect(back.exdates[1].getTime()).toBe(d2.getTime());
  });
});

describe('event serialization: constraints', () => {
  it('round-trips events with constraints', () => {
    const pin = new Date('2026-04-10T09:00:00.000Z');
    const ev = makeBaseEvent({
      constraints: [
        { type: 'must-start-on', date: pin },
        { type: 'alap' },
      ],
    });
    const back = deserializeEvent(serializeEvent(ev));
    expect(back.constraints).toHaveLength(2);
    expect(back.constraints[0].type).toBe('must-start-on');
    expect(back.constraints[0].date!.getTime()).toBe(pin.getTime());
    expect(back.constraints[1].type).toBe('alap');
  });
});

describe('event serialization: recurring series', () => {
  it('round-trips rrule and exdates together', () => {
    const ev = makeBaseEvent({
      rrule:   'FREQ=WEEKLY;BYDAY=MO',
      exdates: [new Date('2026-04-20T09:00:00.000Z')],
    });
    const back = deserializeEvent(serializeEvent(ev));
    expect(back.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(back.exdates[0].toISOString()).toBe('2026-04-20T09:00:00.000Z');
  });
});

describe('event serialization: nullable / optional fields', () => {
  it('preserves null timezone', () => {
    const back = deserializeEvent(serializeEvent(makeBaseEvent({ timezone: null })));
    expect(back.timezone).toBeNull();
  });

  it('preserves a timezone string', () => {
    const back = deserializeEvent(serializeEvent(makeBaseEvent({ timezone: 'America/New_York' })));
    expect(back.timezone).toBe('America/New_York');
  });

  it('preserves null color', () => {
    const back = deserializeEvent(serializeEvent(makeBaseEvent({ color: null })));
    expect(back.color).toBeNull();
  });

  it('preserves null resourceId', () => {
    const back = deserializeEvent(serializeEvent(makeBaseEvent({ resourceId: null })));
    expect(back.resourceId).toBeNull();
  });

  it('preserves meta payload', () => {
    const meta = { flightNumber: 'UA123', gate: 'B12' };
    const back = deserializeEvent(serializeEvent(makeBaseEvent({ meta })));
    expect(back.meta).toEqual(meta);
  });
});

describe('event serialization: JSON transport path', () => {
  it('survives JSON.stringify → JSON.parse → deserialize', () => {
    const ev = makeBaseEvent({
      rrule:    'FREQ=DAILY;COUNT=5',
      exdates:  [new Date('2026-04-11T09:00:00.000Z')],
      timezone: 'America/Chicago',
      constraints: [{ type: 'snet', date: new Date('2026-04-10T00:00:00.000Z') }],
    });
    const wire = JSON.parse(JSON.stringify(serializeEvent(ev)));
    const back = deserializeEvent(wire);
    expect(back.start.getTime()).toBe(ev.start.getTime());
    expect(back.end.getTime()).toBe(ev.end.getTime());
    expect(back.rrule).toBe('FREQ=DAILY;COUNT=5');
    expect(back.exdates[0].getTime()).toBe(ev.exdates[0].getTime());
    expect(back.timezone).toBe('America/Chicago');
    expect(back.constraints[0].date!.getTime()).toBe(ev.constraints[0].date!.getTime());
  });
});

// ─── EngineEvent helper smoke tests ──────────────────────────────────────────

describe('EngineEvent helpers', () => {
  it('isRecurringSeries: true for events with rrule', () => {
    expect(isRecurringSeries(makeBaseEvent({ rrule: 'FREQ=DAILY' }))).toBe(true);
    expect(isRecurringSeries(makeBaseEvent())).toBe(false);
  });

  it('isDetachedOccurrence: true for events with detachedFrom', () => {
    expect(isDetachedOccurrence(makeBaseEvent({ detachedFrom: 'series-1' }))).toBe(true);
    expect(isDetachedOccurrence(makeBaseEvent())).toBe(false);
  });

  it('isPartOfSeries: true for events with seriesId', () => {
    expect(isPartOfSeries(makeBaseEvent({ seriesId: 'series-1' }))).toBe(true);
    expect(isPartOfSeries(makeBaseEvent())).toBe(false);
  });
});

// ─── Assignment helper smoke tests ───────────────────────────────────────────

describe('Assignment helpers', () => {
  it('makeAssignment defaults units to 100', () => {
    const a = makeAssignment('a1', { eventId: 'e1', resourceId: 'r1' });
    expect(a.units).toBe(100);
    expect(a.id).toBe('a1');
  });

  it('makeAssignment accepts units override', () => {
    const a = makeAssignment('a2', { eventId: 'e2', resourceId: 'r2', units: 50 });
    expect(a.units).toBe(50);
  });

  it('assignmentsForEvent returns only matching assignments', () => {
    const map: Map<string, Assignment> = new Map([
      ['a1', { id: 'a1', eventId: 'e1', resourceId: 'r1', units: 100 }],
      ['a2', { id: 'a2', eventId: 'e2', resourceId: 'r1', units: 100 }],
    ]);
    expect(assignmentsForEvent(map, 'e1')).toHaveLength(1);
    expect(assignmentsForEvent(map, 'e2')[0].id).toBe('a2');
    expect(assignmentsForEvent(map, 'e3')).toHaveLength(0);
  });

  it('resourceIdsForEvent falls back to legacy resourceId', () => {
    const emptyMap: Map<string, Assignment> = new Map();
    const ids = resourceIdsForEvent(emptyMap, 'e1', 'r-legacy');
    expect(ids).toEqual(['r-legacy']);
  });

  it('workloadForResource sums units', () => {
    const map: Map<string, Assignment> = new Map([
      ['a1', { id: 'a1', eventId: 'e1', resourceId: 'r1', units: 80 }],
      ['a2', { id: 'a2', eventId: 'e2', resourceId: 'r1', units: 60 }],
      ['a3', { id: 'a3', eventId: 'e3', resourceId: 'r2', units: 100 }],
    ]);
    expect(workloadForResource(map, 'r1')).toBe(140);
    expect(workloadForResource(map, 'r2')).toBe(100);
    expect(workloadForResource(map, 'r3')).toBe(0);
  });
});

// ─── Dependency helper smoke tests ───────────────────────────────────────────

describe('Dependency helpers', () => {
  const s1 = new Date('2026-04-10T08:00:00Z');
  const e1 = new Date('2026-04-10T09:00:00Z');

  it('makeDependency defaults to finish-to-start, lagMs=0', () => {
    const d = makeDependency('d1', { fromEventId: 'e1', toEventId: 'e2' });
    expect(d.type).toBe('finish-to-start');
    expect(d.lagMs).toBe(0);
  });

  it('constrainedAnchor: FS returns predecessor end + lag', () => {
    const d = makeDependency('d1', { fromEventId: 'e1', toEventId: 'e2', lagMs: 3600_000 });
    const anchor = constrainedAnchor(d, s1, e1);
    expect(anchor.getTime()).toBe(e1.getTime() + 3600_000);
  });

  it('isDependencyViolated: detects when successor starts before anchor', () => {
    const d = makeDependency('d1', { fromEventId: 'e1', toEventId: 'e2' });
    const toStart = new Date(e1.getTime() - 1); // 1ms before e1.end
    expect(isDependencyViolated(d, s1, e1, toStart, new Date(toStart.getTime() + 3600_000))).toBe(true);
  });

  it('isDependencyViolated: ok when successor starts at/after anchor', () => {
    const d = makeDependency('d1', { fromEventId: 'e1', toEventId: 'e2' });
    const toStart = e1; // exactly at e1.end
    expect(isDependencyViolated(d, s1, e1, toStart, new Date(toStart.getTime() + 3600_000))).toBe(false);
  });

  it('hasCycle: detects a simple cycle', () => {
    const deps: Map<string, Dependency> = new Map([
      ['d1', makeDependency('d1', { fromEventId: 'A', toEventId: 'B' })],
      ['d2', makeDependency('d2', { fromEventId: 'B', toEventId: 'A' })],
    ]);
    expect(hasCycle(deps)).toBe(true);
  });

  it('hasCycle: no cycle in a DAG', () => {
    const deps: Map<string, Dependency> = new Map([
      ['d1', makeDependency('d1', { fromEventId: 'A', toEventId: 'B' })],
      ['d2', makeDependency('d2', { fromEventId: 'B', toEventId: 'C' })],
    ]);
    expect(hasCycle(deps)).toBe(false);
  });

  it('wouldCreateCycle: detects back-edge', () => {
    const deps: Map<string, Dependency> = new Map([
      ['d1', makeDependency('d1', { fromEventId: 'A', toEventId: 'B' })],
    ]);
    expect(wouldCreateCycle(deps, 'B', 'A')).toBe(true);
    expect(wouldCreateCycle(deps, 'A', 'C')).toBe(false);
  });
});

// ─── Constraint helper smoke tests ───────────────────────────────────────────

describe('Constraint helpers', () => {
  const s = new Date('2026-04-10T09:00:00Z');
  const e = new Date('2026-04-10T10:00:00Z');

  it('satisfiesConstraint: asap always satisfied', () => {
    expect(satisfiesConstraint({ type: 'asap' }, s, e)).toBe(true);
  });

  it('satisfiesConstraint: must-start-on exact match', () => {
    expect(satisfiesConstraint({ type: 'must-start-on', date: s }, s, e)).toBe(true);
    expect(satisfiesConstraint({ type: 'must-start-on', date: new Date(s.getTime() + 1) }, s, e)).toBe(false);
  });

  it('satisfiesConstraint: snet', () => {
    expect(satisfiesConstraint({ type: 'snet', date: s }, s, e)).toBe(true);
    expect(satisfiesConstraint({ type: 'snet', date: new Date(s.getTime() + 1) }, s, e)).toBe(false);
  });

  it('constraintSeverity: hard for must-* types', () => {
    expect(constraintSeverity({ type: 'must-start-on', date: s })).toBe('hard');
    expect(constraintSeverity({ type: 'must-end-on',   date: e })).toBe('hard');
    expect(constraintSeverity({ type: 'snet', date: s })).toBe('soft');
    expect(constraintSeverity({ type: 'asap' })).toBe('soft');
  });

  it('describeConstraint: returns human-readable string', () => {
    expect(describeConstraint({ type: 'asap' })).toBe('As Soon As Possible');
    expect(describeConstraint({ type: 'must-start-on', date: s })).toContain('Must start on');
  });
});
