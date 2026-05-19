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
import type { NormalizedEvent } from '../types/events';

/**
 * @param {import('../index.d.ts').NormalizedEvent[]} events
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @returns {import('../index.d.ts').NormalizedEvent[]}
 */
export function useOccurrences(events: NormalizedEvent[], rangeStart: Date, rangeEnd: Date): NormalizedEvent[] {
  return useMemo(() => {
    const result: NormalizedEvent[] = [];
    // Expand the range by 1 week on each side so events that start just
    // before or end just after the visible range are still shown correctly.
    const expStart = addDays(rangeStart, -7);
    const expEnd   = addDays(rangeEnd,    7);

    for (const ev of events) {
      if (!ev.rrule) {
        result.push(ev);
        continue;
      }

      const exdates = (ev.exdates ?? []).map((d: Date | string) => d instanceof Date ? d : new Date(d));
      const durationMs = ev.end.getTime() - ev.start.getTime();

      const starts = expandRRule(ev.start, ev.rrule, exdates, expStart, expEnd);

      starts.forEach((start) => {
        // Derive a stable per-occurrence id from the start instant rather
        // than the array index. The index shifts every time the visible
        // window scrolls — the first occurrence in March is occurrence #4
        // when you scroll to January — so an index-based id used to swap
        // which physical occurrence inherited the parent's `ev.id`. Hosts
        // keying selection / focus / audit links by id would silently map
        // to a different occurrence after navigation, and React keys
        // churned for the entire series.
        result.push({
          ...ev,
          id:          `${ev.id}-r${start.getTime()}`,
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
