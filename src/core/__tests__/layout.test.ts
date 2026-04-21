import { describe, it, expect } from 'vitest';
import { displayEndDay, layoutSpans } from '../layout';

function makeEvent(start: Date, end: Date, allDay: boolean = false) {
  return {
    id: `${start.toISOString()}-${end.toISOString()}-${allDay ? 'all' : 'timed'}`,
    title: 'ev',
    start,
    end,
    allDay,
  };
}

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
    expect(spans[0].lane).toBe(0);
    expect(spans[1].lane).toBe(0);
  });
});
