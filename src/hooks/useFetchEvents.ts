/**
 * useFetchEvents — async data loading with AbortController cleanup.
 *
 * Calls `fetchEvents({ start, end, signal })` whenever the visible
 * date range changes (driven by view + currentDate).
 *
 * Returns raw (un-normalized) events; WorksCalendar merges these with
 * static `events` before normalizing.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays,
} from 'date-fns';

/** Compute the visible [start, end] range for a given view + date. */
function visibleRange(view: string, currentDate: Date, weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0) {
  switch (view) {
    case 'week':
      return {
        start: startOfWeek(currentDate, { weekStartsOn: weekStartDay }),
        end:   endOfWeek(currentDate,   { weekStartsOn: weekStartDay }),
      };
    case 'day':
      return { start: currentDate, end: addDays(currentDate, 1) };
    case 'schedule': {
      const s = startOfWeek(startOfMonth(currentDate), { weekStartsOn: weekStartDay });
      return { start: s, end: addDays(s, 7 * 6 - 1) };
    }
    case 'month':
    case 'agenda':
    case 'timeline':
    default:
      return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }
}

type FetchEventsFn<T> = (args: { start: Date; end: Date; signal: AbortSignal }) => Promise<T[]>;

export function useFetchEvents<T extends Record<string, any>>(
  fetchEvents: FetchEventsFn<T> | null | undefined,
  view: string,
  currentDate: Date,
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0,
): {
  fetchedEvents: T[];
  loading: boolean;
  error: unknown;
} {
  const [fetchedEvents, setFetchedEvents] = useState<T[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stable range key so the effect only fires when the range actually changes
  const range = useMemo(
    () => visibleRange(view, currentDate, weekStartDay),
    [view, currentDate, weekStartDay],
  );

  useEffect(() => {
    if (!fetchEvents) {
      setFetchedEvents([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    fetchEvents({ start: range.start, end: range.end, signal: ctrl.signal })
      .then((raw: T[]) => {
        if (ctrl.signal.aborted) return;
        setFetchedEvents(Array.isArray(raw) ? raw : []);
      })
      .catch((err: unknown) => {
        const errorName = typeof err === 'object' && err && 'name' in err
          ? String((err as { name?: unknown }).name)
          : '';
        if (ctrl.signal.aborted || errorName === 'AbortError') return;
        console.error('[WorksCalendar] fetchEvents error:', err);
        setError(err);
        setFetchedEvents([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [fetchEvents, range.start, range.end]);

  return { fetchedEvents, loading, error };
}
