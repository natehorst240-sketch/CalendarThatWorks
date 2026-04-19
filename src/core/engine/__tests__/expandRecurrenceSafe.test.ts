import { describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../schema/eventSchema';
import { expandRecurrenceSafe } from '../recurrence/expandRecurrenceSafe';

describe('expandRecurrenceSafe', () => {
  it('returns [] and emits onError for invalid ranges', () => {
    const onError = vi.fn();
    const event = makeEvent('e1', {
      title: 'Bad range check',
      start: new Date('2026-01-01T10:00:00Z'),
      end: new Date('2026-01-01T11:00:00Z'),
    });

    const result = expandRecurrenceSafe(
      [event],
      new Date('invalid'),
      new Date('2026-01-02T00:00:00Z'),
      { onError },
    );

    expect(result).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('skips malformed events and continues partial expansion', () => {
    const onError = vi.fn();

    const good = makeEvent('good', {
      title: 'Valid',
      start: new Date('2026-03-01T10:00:00Z'),
      end: new Date('2026-03-01T11:00:00Z'),
    });

    const malformed = {
      ...good,
      id: 'bad',
      end: new Date('2026-03-01T09:59:00Z'),
    };

    const result = expandRecurrenceSafe(
      [good, malformed],
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-02T00:00:00Z'),
      { onError },
    );

    expect(result.some(occ => occ.eventId === 'good')).toBe(true);
    expect(result.some(occ => occ.eventId === 'bad')).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it.todo('adds DST transition coverage for spring-forward + fall-back boundaries');
});
