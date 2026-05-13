import { describe, it, expect } from 'vitest';
import { normalizeEvent, normalizeEvents } from '../eventModel';
import type { WorksCalendarEvent } from '../../types/events';

function raw(patch: Partial<WorksCalendarEvent> = {}): WorksCalendarEvent {
  return { title: 'Meeting', start: new Date(2026, 0, 5, 9), ...patch };
}

// ─── normalizeEvent ───────────────────────────────────────────────────────────

describe('normalizeEvent', () => {
  it('preserves a Date start', () => {
    const d = new Date(2026, 0, 5, 9);
    const ev = normalizeEvent(raw({ start: d }));
    expect(ev.start).toEqual(d);
  });

  it('parses an ISO string start', () => {
    const ev = normalizeEvent(raw({ start: '2026-01-05T09:00:00.000Z' }));
    expect(ev.start).toBeInstanceOf(Date);
    expect(Number.isNaN(ev.start.getTime())).toBe(false);
  });

  it('defaults end to start + 1h when end is absent', () => {
    const start = new Date(2026, 0, 5, 9, 0);
    const ev = normalizeEvent({ title: 'T', start });
    const diffMs = ev.end.getTime() - ev.start.getTime();
    expect(diffMs).toBe(60 * 60 * 1000);
  });

  it('preserves explicit end', () => {
    const start = new Date(2026, 0, 5, 9);
    const end   = new Date(2026, 0, 5, 11);
    const ev = normalizeEvent(raw({ start, end }));
    expect(ev.end).toEqual(end);
  });

  it('defaults id to a generated uid when absent', () => {
    const ev = normalizeEvent(raw());
    expect(ev.id).toBeTruthy();
    expect(typeof ev.id).toBe('string');
  });

  it('preserves explicit id', () => {
    const ev = normalizeEvent(raw({ id: 'my-id' }));
    expect(ev.id).toBe('my-id');
  });

  it('defaults title to "(untitled)" when absent', () => {
    // @ts-expect-error intentional — test the fallback
    const ev = normalizeEvent({ start: new Date() });
    expect(ev.title).toBe('(untitled)');
  });

  it('defaults allDay to false', () => {
    expect(normalizeEvent(raw()).allDay).toBe(false);
  });

  it('preserves allDay=true', () => {
    expect(normalizeEvent(raw({ allDay: true })).allDay).toBe(true);
  });

  it('defaults category to null', () => {
    expect(normalizeEvent(raw()).category).toBeNull();
  });

  it('preserves category', () => {
    expect(normalizeEvent(raw({ category: 'PTO' })).category).toBe('PTO');
  });

  it('defaults resource to null', () => {
    expect(normalizeEvent(raw()).resource).toBeNull();
  });

  it('uses explicit color over category-derived color', () => {
    const ev = normalizeEvent(raw({ color: '#ff0000', category: 'Meetings' }));
    expect(ev.color).toBe('#ff0000');
  });

  it('derives a color when no color is provided', () => {
    const ev = normalizeEvent(raw({ category: 'Unique-Cat-XYZ' }));
    expect(ev.color).toBeTruthy();
    expect(ev.color).toMatch(/^(#|hsl)/);
  });

  it('derives the same color for the same category name regardless of call order', () => {
    // Issue #652: color must not depend on the order categories are first seen
    // across calendar instances. Seed with one ordering then check the target
    // category against the reverse ordering — same input must yield same output.
    normalizeEvent(raw({ category: 'A' }));
    normalizeEvent(raw({ category: 'B' }));
    const first = normalizeEvent(raw({ category: 'Target' })).color;
    normalizeEvent(raw({ category: 'C' }));
    normalizeEvent(raw({ category: 'D' }));
    const second = normalizeEvent(raw({ category: 'Target' })).color;
    expect(second).toBe(first);
  });

  it('derives colors deterministically from category name (no shared state)', () => {
    const a1 = normalizeEvent(raw({ category: 'Meetings' })).color;
    const b1 = normalizeEvent(raw({ category: 'PTO' })).color;
    const a2 = normalizeEvent(raw({ category: 'Meetings' })).color;
    const b2 = normalizeEvent(raw({ category: 'PTO' })).color;
    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it('defaults status to "confirmed"', () => {
    expect(normalizeEvent(raw()).status).toBe('confirmed');
  });

  it('preserves status', () => {
    expect(normalizeEvent(raw({ status: 'tentative' })).status).toBe('tentative');
  });

  it('defaults lifecycle to null when no signal', () => {
    const ev = normalizeEvent(raw());
    expect(ev.lifecycle).toBeNull();
  });

  it('uses top-level lifecycle field when valid', () => {
    const ev = normalizeEvent(raw({ lifecycle: 'approved' }));
    expect(ev.lifecycle).toBe('approved');
  });

  it('uses meta.lifecycle when top-level lifecycle is absent', () => {
    const ev = normalizeEvent(raw({ meta: { lifecycle: 'draft' } }));
    expect(ev.lifecycle).toBe('draft');
  });

  it('defaults rrule to null', () => {
    expect(normalizeEvent(raw()).rrule).toBeNull();
  });

  it('preserves rrule', () => {
    const ev = normalizeEvent(raw({ rrule: 'FREQ=WEEKLY' }));
    expect(ev.rrule).toBe('FREQ=WEEKLY');
  });

  it('defaults exdates to empty array', () => {
    expect(normalizeEvent(raw()).exdates).toEqual([]);
  });

  it('defaults meta to empty object', () => {
    expect(normalizeEvent(raw()).meta).toEqual({});
  });

  it('uses epoch fallback when start is an unrecognized type (object)', () => {
    // toDate returns null for non-null non-Date non-number non-string values
    const ev = normalizeEvent(raw({ start: {} as Record<string, unknown> }));
    expect(ev.start).toBeInstanceOf(Date);
  });

  it('sets _raw to the original event', () => {
    const orig = raw({ id: 'orig' });
    expect(normalizeEvent(orig)._raw).toBe(orig);
  });

  it('generates different uids for successive events with no id', () => {
    const a = normalizeEvent(raw());
    const b = normalizeEvent(raw());
    expect(a.id).not.toBe(b.id);
  });
});

// ─── normalizeEvents ──────────────────────────────────────────────────────────

describe('normalizeEvents', () => {
  it('normalizes an array of events', () => {
    const evs = normalizeEvents([raw({ id: 'a' }), raw({ id: 'b' })]);
    expect(evs).toHaveLength(2);
    expect(evs[0]!.id).toBe('a');
    expect(evs[1]!.id).toBe('b');
  });

  it('returns empty array for null input', () => {
    expect(normalizeEvents(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(normalizeEvents(undefined)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeEvents([])).toEqual([]);
  });

  it('drops non-object entries (null / undefined / primitives) instead of throwing', () => {
    const evs = normalizeEvents([
      null,
      undefined,
      'oops',
      42,
      raw({ id: 'real' }),
    ] as unknown as WorksCalendarEvent[]);
    expect(evs).toHaveLength(1);
    expect(evs[0]!.id).toBe('real');
  });
});
