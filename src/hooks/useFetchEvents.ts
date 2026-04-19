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
function visibleRange(view, currentDate, weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0) {
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

export function useFetchEvents(fetchEvents, view, currentDate, weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0) {
  const [fetchedEvents, setFetchedEvents] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const abortRef = useRef(null);

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
      .then(raw => {
        if (ctrl.signal.aborted) return;
        setFetchedEvents(Array.isArray(raw) ? raw : []);
      })
      .catch(err => {
        if (ctrl.signal.aborted || err?.name === 'AbortError') return;
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
