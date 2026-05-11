import { describe, it, expect } from 'vitest';
import { displayEndDay, layoutOverlaps, layoutSpans } from '../layout';

function makeEvent(start: Date, end: Date, allDay: boolean = false) {
  return {
    id: `${start.toISOString()}-${end.toISOString()}-${allDay ? 'all' : 'timed'}`,
    title: 'ev',
    start,
    end,
    allDay,
  };
}

// ─── layoutOverlaps ───────────────────────────────────────────────────────────

describe('layoutOverlaps', () => {
  it('returns empty array for empty input', () => {
    expect(layoutOverlaps([])).toEqual([]);
  });

  it('assigns a single event to column 0 with 1 column', () => {
    const ev = makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T10:00:00Z'));
    const [result] = layoutOverlaps([ev]);
    expect(result!._col).toBe(0);
    expect(result!._numCols).toBe(1);
  });

  it('assigns non-overlapping events to the same column', () => {
    const a = makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T10:00:00Z'));
    const b = makeEvent(new Date('2026-04-13T10:00:00Z'), new Date('2026-04-13T11:00:00Z'));
    const result = layoutOverlaps([a, b]);
    expect(result).toHaveLength(2);
    expect(result[0]!._col).toBe(0);
    expect(result[1]!._col).toBe(0);
    expect(result[0]!._numCols).toBe(1);
  });

  it('assigns overlapping events to different columns', () => {
    const a = makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T11:00:00Z'));
    const b = makeEvent(new Date('2026-04-13T10:00:00Z'), new Date('2026-04-13T12:00:00Z'));
    const result = layoutOverlaps([a, b]);
    expect(result).toHaveLength(2);
    const cols = result.map(r => r._col).sort();
    expect(cols).toEqual([0, 1]);
    expect(result[0]!._numCols).toBe(2);
  });

  it('packs 3 simultaneous events into 3 columns', () => {
    const a = makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T10:00:00Z'));
    const b = makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T10:00:00Z'));
    const c = makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T10:00:00Z'));
    const result = layoutOverlaps([a, b, c]);
    expect(result).toHaveLength(3);
    const cols = result.map(r => r._col).sort();
    expect(cols).toEqual([0, 1, 2]);
    expect(result[0]!._numCols).toBe(3);
  });

  it('sorts events by start time before assigning columns', () => {
    const late  = makeEvent(new Date('2026-04-13T10:00:00Z'), new Date('2026-04-13T11:00:00Z'));
    const early = makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T10:30:00Z'));
    const result = layoutOverlaps([late, early]);
    // early starts first and gets col 0; late overlaps early so gets col 1
    const byCol = result.sort((a, b) => a._col - b._col);
    expect(byCol[0]!.start).toEqual(early.start);
  });

  it('preserves extra properties from the original event', () => {
    const ev = { ...makeEvent(new Date('2026-04-13T09:00:00Z'), new Date('2026-04-13T10:00:00Z')), color: '#ff0000' };
    const [result] = layoutOverlaps([ev]);
    expect(result!.color).toBe('#ff0000');
  });
});

// ─── displayEndDay ────────────────────────────────────────────────────────────

describe('displayEndDay', () => {
  it('all-day event: subtracts one day when end is at local midnight', () => {
    const ev = makeEvent(
      new Date(2026, 3, 13),
      new Date(2026, 3, 15, 0, 0, 0), // midnight = exclusive end
      true,
    );
    const endDay = displayEndDay(ev);
    expect(endDay.getDate()).toBe(14); // April 14
  });

  it('all-day event: does NOT subtract day when end is not at midnight', () => {
    const ev = makeEvent(
      new Date(2026, 3, 13),
      new Date(2026, 3, 15, 12, 0, 0),
      true,
    );
    const endDay = displayEndDay(ev);
    expect(endDay.getDate()).toBe(15);
  });

  it('timed event ending mid-day uses that UTC day', () => {
    const ev = makeEvent(
      new Date('2026-04-13T09:00:00.000Z'),
      new Date('2026-04-13T17:00:00.000Z'),
      false,
    );
    const endDay = displayEndDay(ev);
    expect(endDay.toISOString()).toBe('2026-04-13T00:00:00.000Z');
  });
});

// ─── layoutSpans ──────────────────────────────────────────────────────────────

describe('layout span end-day behavior', () => {
  it('treats timed cross-midnight events ending at 00:00 as exclusive of the boundary day', () => {
    const ev = makeEvent(
      new Date('2026-04-13T09:00:00.000Z'),
      new Date('2026-04-15T00:00:00.000Z'),
      false,
    );

    const endDay = displayEndDay(ev);
    expect(endDay.toISOString()).toBe('2026-04-14T00:00:00.000Z');
  });

  it('packs back-to-back midnight-ended timed spans into one lane', () => {
    const weekStart = new Date('2026-04-13T00:00:00.000Z'); // Monday
    const weekEnd = new Date('2026-04-19T00:00:00.000Z');

    const first = makeEvent(
      new Date('2026-04-13T09:00:00.000Z'),
      new Date('2026-04-15T00:00:00.000Z'),
      false,
    );
    const second = makeEvent(
      new Date('2026-04-15T00:00:00.000Z'),
      new Date('2026-04-17T00:00:00.000Z'),
      false,
    );

    const spans = layoutSpans([first, second], weekStart, weekEnd);

    expect(spans).toHaveLength(2);
    expect(spans[0]!.lane).toBe(0);
    expect(spans[1]!.lane).toBe(0);
  });

  it('assigns overlapping spans to different lanes', () => {
    const weekStart = new Date('2026-04-13T00:00:00.000Z');
    const weekEnd   = new Date('2026-04-19T00:00:00.000Z');

    const a = makeEvent(
      new Date('2026-04-13T09:00:00.000Z'),
      new Date('2026-04-16T00:00:00.000Z'),
    );
    const b = makeEvent(
      new Date('2026-04-14T09:00:00.000Z'),
      new Date('2026-04-17T00:00:00.000Z'),
    );
    const spans = layoutSpans([a, b], weekStart, weekEnd);
    expect(spans).toHaveLength(2);
    const lanes = spans.map(s => s.lane).sort();
    expect(lanes).toEqual([0, 1]);
  });

  it('sets continuesBefore when span starts before the week', () => {
    const weekStart = new Date('2026-04-13T00:00:00.000Z');
    const weekEnd   = new Date('2026-04-19T00:00:00.000Z');

    const ev = makeEvent(
      new Date('2026-04-10T09:00:00.000Z'), // before Monday
      new Date('2026-04-15T00:00:00.000Z'),
    );
    const [span] = layoutSpans([ev], weekStart, weekEnd);
    expect(span!.continuesBefore).toBe(true);
    expect(span!.startCol).toBe(0); // clipped to 0
  });

  it('sets continuesAfter when span ends after the week', () => {
    const weekStart = new Date('2026-04-13T00:00:00.000Z');
    const weekEnd   = new Date('2026-04-19T00:00:00.000Z');

    const ev = makeEvent(
      new Date('2026-04-14T09:00:00.000Z'),
      new Date('2026-04-22T00:00:00.000Z'), // after Sunday
    );
    const [span] = layoutSpans([ev], weekStart, weekEnd);
    expect(span!.continuesAfter).toBe(true);
    expect(span!.endCol).toBe(6); // clipped to 6
  });

  it('excludes events entirely outside the week', () => {
    const weekStart = new Date('2026-04-13T00:00:00.000Z');
    const weekEnd   = new Date('2026-04-19T00:00:00.000Z');

    const before = makeEvent(
      new Date('2026-04-01T09:00:00.000Z'),
      new Date('2026-04-05T00:00:00.000Z'),
    );
    const after = makeEvent(
      new Date('2026-04-20T09:00:00.000Z'),
      new Date('2026-04-22T00:00:00.000Z'),
    );
    expect(layoutSpans([before, after], weekStart, weekEnd)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const weekStart = new Date('2026-04-13T00:00:00.000Z');
    const weekEnd   = new Date('2026-04-19T00:00:00.000Z');
    expect(layoutSpans([], weekStart, weekEnd)).toHaveLength(0);
  });
});
