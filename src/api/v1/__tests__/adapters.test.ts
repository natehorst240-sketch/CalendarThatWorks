// @vitest-environment node
/**
 * API v1 — adapter regression tests.
 *
 * Covers:
 *  - eventV1ToEngine: field mapping, defaults, sync→meta, constraints
 *  - engineToV1: field mapping, meta→sync extraction, meta cleanup
 *  - occurrenceToV1: occurrence-specific fields
 *  - legacyToV1 + v1ToLegacy: round-trip and downgrade
 *  - normalizeInputEvent: constraints fix regression
 */

import { describe, it, expect } from 'vitest';
import {
  eventV1ToEngine,
  engineToV1,
  occurrenceToV1,
  legacyToV1,
  v1ToLegacy,
} from '../adapters.js';
import { normalizeInputEvent } from '../index.js';
import { makeEvent }          from '../types.js';
import { SYNC_META_KEY }      from '../types.js';
import type {
  CalendarEventV1,
  CalendarOccurrenceV1,
  SyncMetadata,
  EngineEvent,
  EngineOccurrence,
} from '../types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const S = new Date('2026-04-10T09:00:00.000Z');
const E = new Date('2026-04-10T10:00:00.000Z');

function baseV1(overrides: Partial<CalendarEventV1> = {}): CalendarEventV1 {
  return { id: 'v1-1', title: 'Meeting', start: S, end: E, ...overrides };
}

function baseEngine(overrides: Partial<Omit<EngineEvent, 'id' | 'title' | 'start' | 'end'>> = {}): EngineEvent {
  return makeEvent('eng-1', { title: 'Meeting', start: S, end: E, ...overrides });
}

// ─── eventV1ToEngine ──────────────────────────────────────────────────────────

describe('eventV1ToEngine: basic field mapping', () => {
  it('preserves id when provided', () => {
    const ev = eventV1ToEngine(baseV1({ id: 'my-id' }));
    expect(ev.id).toBe('my-id');
  });

  it('assigns a new engine id when id is omitted', () => {
    const ev = eventV1ToEngine(baseV1({ id: undefined }));
    expect(typeof ev.id).toBe('string');
    expect(ev.id.length).toBeGreaterThan(0);
  });

  it('maps start/end from Date objects', () => {
    const ev = eventV1ToEngine(baseV1());
    expect(ev.start.getTime()).toBe(S.getTime());
    expect(ev.end.getTime()).toBe(E.getTime());
  });

  it('maps start/end from ISO strings', () => {
    const ev = eventV1ToEngine(baseV1({
      start: '2026-04-10T09:00:00.000Z',
      end:   '2026-04-10T10:00:00.000Z',
    }));
    expect(ev.start.getTime()).toBe(S.getTime());
    expect(ev.end.getTime()).toBe(E.getTime());
  });

  it('defaults allDay to false', () => {
    expect(eventV1ToEngine(baseV1()).allDay).toBe(false);
  });

  it('maps allDay: true', () => {
    expect(eventV1ToEngine(baseV1({ allDay: true })).allDay).toBe(true);
  });

  it('maps category', () => {
    expect(eventV1ToEngine(baseV1({ category: 'flight' })).category).toBe('flight');
  });

  it('maps timezone', () => {
    expect(eventV1ToEngine(baseV1({ timezone: 'America/Denver' })).timezone).toBe('America/Denver');
  });

  it('maps resourceId', () => {
    expect(eventV1ToEngine(baseV1({ resourceId: 'r1' })).resourceId).toBe('r1');
  });

  it('falls back resourceId to legacy resource field', () => {
    expect(eventV1ToEngine(baseV1({ resource: 'tail-N123' })).resourceId).toBe('tail-N123');
  });

  it('prefers resourceId over resource when both present', () => {
    expect(eventV1ToEngine(baseV1({ resourceId: 'r1', resource: 'old' })).resourceId).toBe('r1');
  });

  it('maps status', () => {
    expect(eventV1ToEngine(baseV1({ status: 'tentative' })).status).toBe('tentative');
  });

  it('defaults status to confirmed', () => {
    expect(eventV1ToEngine(baseV1()).status).toBe('confirmed');
  });

  it('maps color', () => {
    expect(eventV1ToEngine(baseV1({ color: '#ff0000' })).color).toBe('#ff0000');
  });
});

describe('eventV1ToEngine: recurrence', () => {
  it('maps rrule and sets seriesId === id', () => {
    const ev = eventV1ToEngine(baseV1({ rrule: 'FREQ=WEEKLY;BYDAY=MO' }));
    expect(ev.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(ev.seriesId).toBe(ev.id);
  });

  it('null seriesId when no rrule', () => {
    expect(eventV1ToEngine(baseV1()).seriesId).toBeNull();
  });

  it('maps exdates', () => {
    const x = new Date('2026-04-17T09:00:00.000Z');
    const ev = eventV1ToEngine(baseV1({ exdates: [x] }));
    expect(ev.exdates).toHaveLength(1);
    expect(ev.exdates[0].getTime()).toBe(x.getTime());
  });
});

describe('eventV1ToEngine: constraints', () => {
  it('maps constraints array', () => {
    const pinDate = new Date('2026-04-10T09:00:00.000Z');
    const ev = eventV1ToEngine(baseV1({
      constraints: [
        { type: 'must-start-on', date: pinDate },
        { type: 'alap' },
      ],
    }));
    expect(ev.constraints).toHaveLength(2);
    expect(ev.constraints[0].type).toBe('must-start-on');
    expect(ev.constraints[0].date!.getTime()).toBe(pinDate.getTime());
    expect(ev.constraints[1].type).toBe('alap');
  });

  it('defaults constraints to [] when not provided', () => {
    expect(eventV1ToEngine(baseV1()).constraints).toEqual([]);
  });
});

describe('eventV1ToEngine: SyncMetadata', () => {
  const sync: SyncMetadata = {
    externalId: 'goog-abc',
    syncSource: 'google-calendar',
    version: 3,
  };

  it('stores sync under SYNC_META_KEY in meta', () => {
    const ev = eventV1ToEngine(baseV1({ sync }));
    expect(ev.meta[SYNC_META_KEY]).toEqual(sync);
  });

  it('preserves other meta fields alongside sync', () => {
    const ev = eventV1ToEngine(baseV1({ sync, meta: { flightNo: 'UA123' } }));
    expect(ev.meta['flightNo']).toBe('UA123');
    expect(ev.meta[SYNC_META_KEY]).toBeDefined();
  });

  it('no sync key when sync not provided', () => {
    const ev = eventV1ToEngine(baseV1());
    expect(ev.meta[SYNC_META_KEY]).toBeUndefined();
  });
});

// ─── engineToV1 ──────────────────────────────────────────────────────────────

describe('engineToV1: basic field mapping', () => {
  it('maps id, title, start, end', () => {
    const out = engineToV1(baseEngine());
    expect(out.id).toBe('eng-1');
    expect(out.title).toBe('Meeting');
    expect((out.start as Date).getTime()).toBe(S.getTime());
    expect((out.end as Date).getTime()).toBe(E.getTime());
  });

  it('maps status', () => {
    expect(engineToV1(baseEngine({ status: 'cancelled' })).status).toBe('cancelled');
  });

  it('maps category (null → undefined)', () => {
    expect(engineToV1(baseEngine()).category).toBeUndefined();
    expect(engineToV1(baseEngine({ category: 'admin' })).category).toBe('admin');
  });

  it('maps resourceId (null → undefined)', () => {
    expect(engineToV1(baseEngine()).resourceId).toBeUndefined();
    expect(engineToV1(baseEngine({ resourceId: 'r2' })).resourceId).toBe('r2');
  });

  it('maps timezone (null → undefined)', () => {
    expect(engineToV1(baseEngine()).timezone).toBeUndefined();
    expect(engineToV1(baseEngine({ timezone: 'Europe/London' })).timezone).toBe('Europe/London');
  });

  it('omits rrule when null', () => {
    expect(engineToV1(baseEngine()).rrule).toBeUndefined();
  });

  it('maps rrule when present', () => {
    expect(engineToV1(baseEngine({ rrule: 'FREQ=DAILY' })).rrule).toBe('FREQ=DAILY');
  });

  it('omits exdates when empty', () => {
    expect(engineToV1(baseEngine()).exdates).toBeUndefined();
  });

  it('maps exdates when present', () => {
    const x = new Date('2026-04-17T09:00:00.000Z');
    expect(engineToV1(baseEngine({ exdates: [x] })).exdates).toHaveLength(1);
  });

  it('omits constraints when empty', () => {
    expect(engineToV1(baseEngine()).constraints).toBeUndefined();
  });

  it('maps constraints when present', () => {
    const c = [{ type: 'asap' as const }];
    expect(engineToV1(baseEngine({ constraints: c })).constraints).toHaveLength(1);
  });
});

describe('engineToV1: SyncMetadata extraction', () => {
  const sync: SyncMetadata = {
    externalId: 'outlook-xyz',
    syncSource: 'outlook',
    version: 7,
    updatedAt: new Date('2026-04-09T12:00:00.000Z'),
  };

  it('extracts sync from meta and exposes as .sync', () => {
    const engine = baseEngine({ meta: { [SYNC_META_KEY]: sync } });
    const out = engineToV1(engine);
    expect(out.sync).toBeDefined();
    expect(out.sync!.externalId).toBe('outlook-xyz');
    expect(out.sync!.version).toBe(7);
  });

  it('removes SYNC_META_KEY from public meta', () => {
    const engine = baseEngine({ meta: { [SYNC_META_KEY]: sync, gate: 'B4' } });
    const out = engineToV1(engine);
    expect(out.meta![SYNC_META_KEY]).toBeUndefined();
    expect(out.meta!['gate']).toBe('B4');
  });

  it('no sync field when meta has no sync key', () => {
    expect(engineToV1(baseEngine()).sync).toBeUndefined();
  });

  it('omits meta entirely when empty after cleanup', () => {
    const engine = baseEngine({ meta: { [SYNC_META_KEY]: sync } });
    const out = engineToV1(engine);
    // After removing _v1sync, meta is empty — should be undefined
    expect(out.meta).toBeUndefined();
  });
});

describe('eventV1ToEngine → engineToV1: round-trip', () => {
  it('round-trips all scalar fields', () => {
    const input = baseV1({
      category: 'ops',
      color: '#10b981',
      resourceId: 'r5',
      timezone: 'Asia/Tokyo',
      status: 'tentative',
      rrule: 'FREQ=WEEKLY',
    });
    const back = engineToV1(eventV1ToEngine(input));
    expect(back.category).toBe('ops');
    expect(back.color).toBe('#10b981');
    expect(back.resourceId).toBe('r5');
    expect(back.timezone).toBe('Asia/Tokyo');
    expect(back.status).toBe('tentative');
    expect(back.rrule).toBe('FREQ=WEEKLY');
  });

  it('round-trips SyncMetadata without polluting public meta', () => {
    const sync: SyncMetadata = { externalId: 'g1', syncSource: 'gcal' };
    const input = baseV1({ sync, meta: { gate: 'C1' } });
    const engine = eventV1ToEngine(input);
    const out    = engineToV1(engine);
    expect(out.sync!.externalId).toBe('g1');
    expect(out.meta!['gate']).toBe('C1');
    expect(out.meta![SYNC_META_KEY]).toBeUndefined();
  });

  it('round-trips constraints', () => {
    const pin = new Date('2026-04-10T09:00:00.000Z');
    const input = baseV1({ constraints: [{ type: 'must-start-on', date: pin }] });
    const back  = engineToV1(eventV1ToEngine(input));
    expect(back.constraints![0].date!.getTime()).toBe(pin.getTime());
  });
});

// ─── occurrenceToV1 ───────────────────────────────────────────────────────────

function makeOccurrence(overrides: Partial<EngineOccurrence> = {}): EngineOccurrence {
  return {
    occurrenceId:    'evt-1-r0',
    eventId:         'evt-1',
    seriesId:        'evt-1',
    detachedFrom:    null,
    start:           S,
    end:             E,
    timezone:        null,
    allDay:          false,
    title:           'Stand-up',
    category:        null,
    resourceId:      null,
    status:          'confirmed',
    color:           null,
    resourceIds:     [],
    isRecurring:     true,
    occurrenceIndex: 0,
    constraints:     [],
    meta:            {},
    ...overrides,
  };
}

describe('occurrenceToV1', () => {
  it('maps occurrenceId as id, eventId as eventId', () => {
    const out = occurrenceToV1(makeOccurrence());
    expect(out.id).toBe('evt-1-r0');
    expect(out.eventId).toBe('evt-1');
  });

  it('maps seriesId, isRecurring, occurrenceIndex', () => {
    const out = occurrenceToV1(makeOccurrence({ occurrenceIndex: 3 }));
    expect(out.seriesId).toBe('evt-1');
    expect(out.isRecurring).toBe(true);
    expect(out.occurrenceIndex).toBe(3);
  });

  it('maps title, start, end, status', () => {
    const out = occurrenceToV1(makeOccurrence());
    expect(out.title).toBe('Stand-up');
    expect((out.start as Date).getTime()).toBe(S.getTime());
    expect(out.status).toBe('confirmed');
  });

  it('extracts sync from meta', () => {
    const sync: SyncMetadata = { externalId: 'x1', syncSource: 'gcal' };
    const out = occurrenceToV1(makeOccurrence({ meta: { [SYNC_META_KEY]: sync, note: 'hi' } }));
    expect(out.sync!.externalId).toBe('x1');
    expect(out.meta!['note']).toBe('hi');
    expect(out.meta![SYNC_META_KEY]).toBeUndefined();
  });
});

// ─── legacyToV1 ──────────────────────────────────────────────────────────────

describe('legacyToV1', () => {
  it('passes through all shared fields', () => {
    const out = legacyToV1({
      id: 'old-1', title: 'Flight', start: S, end: E,
      category: 'travel', color: '#f00', resource: 'N123',
      status: 'tentative', rrule: 'FREQ=DAILY',
      exdates: [new Date('2026-04-11T09:00:00.000Z')],
      meta: { pax: 2 },
    });
    expect(out.id).toBe('old-1');
    expect(out.title).toBe('Flight');
    expect(out.category).toBe('travel');
    expect(out.resource).toBe('N123');
    expect(out.status).toBe('tentative');
    expect(out.rrule).toBe('FREQ=DAILY');
    expect(out.meta!['pax']).toBe(2);
  });

  it('defaults status to confirmed for invalid status', () => {
    expect(legacyToV1({ title: 'x', start: S, status: 'unknown' }).status).toBe('confirmed');
  });
});

// ─── v1ToLegacy ──────────────────────────────────────────────────────────────

describe('v1ToLegacy', () => {
  it('maps known fields', () => {
    const out = v1ToLegacy(baseV1({ category: 'ops', color: '#00f', resource: 'R5' }));
    expect(out.title).toBe('Meeting');
    expect(out.category).toBe('ops');
    expect(out.resource).toBe('R5');
  });

  it('falls back resource to resourceId when resource not set', () => {
    const out = v1ToLegacy(baseV1({ resourceId: 'res-7' }));
    expect(out.resource).toBe('res-7');
  });

  it('drops new v1 fields (timezone, constraints, sync) from output', () => {
    const out = v1ToLegacy(baseV1({
      timezone: 'US/Pacific',
      constraints: [{ type: 'asap' }],
      sync: { externalId: 'x', syncSource: 'gcal' },
    })) as Record<string, unknown>;
    expect(out['timezone']).toBeUndefined();
    expect(out['constraints']).toBeUndefined();
    expect(out['sync']).toBeUndefined();
  });
});

// ─── legacyToV1 → v1ToLegacy round-trip ──────────────────────────────────────

describe('legacyToV1 → v1ToLegacy round-trip', () => {
  it('round-trips all legacy fields without loss', () => {
    const raw = {
      id: 'leg-1', title: 'Sprint', start: S, end: E,
      allDay: false, category: 'eng', color: '#333',
      resource: 'T42', status: 'confirmed' as const,
      rrule: null as unknown as string,
      exdates: [] as Date[], meta: { sprintNo: 12 },
    };
    const v1   = legacyToV1(raw);
    const back = v1ToLegacy(v1);
    expect(back.id).toBe('leg-1');
    expect(back.category).toBe('eng');
    expect(back.resource).toBe('T42');
    expect(back.meta!['sprintNo']).toBe(12);
  });
});

// ─── normalizeInputEvent: constraints regression ──────────────────────────────

describe('normalizeInputEvent: constraints field (regression)', () => {
  it('returns constraints: [] when input has no constraints', () => {
    const ev = normalizeInputEvent({ title: 'x', start: S, end: E });
    expect(ev.constraints).toEqual([]);
  });

  it('parses constraints from raw input', () => {
    const pin = new Date('2026-04-10T09:00:00.000Z');
    const ev = normalizeInputEvent({
      title: 'x', start: S, end: E,
      constraints: [
        { type: 'must-start-on', date: pin },
        { type: 'alap' },
      ],
    });
    expect(ev.constraints).toHaveLength(2);
    expect(ev.constraints[0].type).toBe('must-start-on');
    expect(ev.constraints[1].type).toBe('alap');
  });

  it('silently drops constraints with unknown types', () => {
    const ev = normalizeInputEvent({
      title: 'x', start: S, end: E,
      constraints: [{ type: 'invalid-type' }],
    });
    expect(ev.constraints).toHaveLength(0);
  });

  it('silently drops non-object constraint entries', () => {
    const ev = normalizeInputEvent({
      title: 'x', start: S, end: E,
      constraints: [null, 'bad', 42],
    });
    expect(ev.constraints).toHaveLength(0);
  });
});
