/**
 * useOccurrences — expand recurring events for a visible date range.
 *
 * Events with an `rrule` field are expanded into individual occurrences.
 * Non-recurring events pass through unchanged.
 *
 * Call this after normalizing events and before applying filters.
 */
import { useMemo } from 'react';
import { addDays } from 'date-fns';
import { expandRRule } from '../core/icalParser';

/**
 * @param {import('../index.d.ts').NormalizedEvent[]} events
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @returns {import('../index.d.ts').NormalizedEvent[]}
 */
export function useOccurrences(events, rangeStart, rangeEnd) {
  return useMemo(() => {
    const result = [];
    // Expand the range by 1 week on each side so events that start just
    // before or end just after the visible range are still shown correctly.
    const expStart = addDays(rangeStart, -7);
    const expEnd   = addDays(rangeEnd,    7);

    for (const ev of events) {
      if (!ev.rrule) {
        result.push(ev);
        continue;
      }

      const exdates = (ev.exdates ?? []).map(d => d instanceof Date ? d : new Date(d));
      const durationMs = ev.end.getTime() - ev.start.getTime();

      const starts = expandRRule(ev.start, ev.rrule, exdates, expStart, expEnd);

      starts.forEach((start, i) => {
        result.push({
          ...ev,
          id:          i === 0 ? ev.id : `${ev.id}-r${i}`,
          start,
          end:         new Date(start.getTime() + durationMs),
          _recurring:  true,
          _seriesId:   ev.id,
        });
      });
    }

    return result;
  }, [events, rangeStart, rangeEnd]);
}
