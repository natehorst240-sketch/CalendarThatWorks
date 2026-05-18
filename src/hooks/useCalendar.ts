/**
 * useCalendar.js — Central state hook: current date, view, filters.
 *
 * Accepts an optional filterSchema (FilterField[]) that drives the initial
 * filter state shape and the applyFilters call.  When omitted,
 * DEFAULT_FILTER_SCHEMA is used and behaviour is identical to before.
 */
import { useState, useMemo, useCallback } from 'react';
import { addMonths, addWeeks, addDays } from 'date-fns';
import { normalizeEvents } from 'works-calendar-engine';
import { applyFilters, getCategories, getResources } from '../filters/filterEngine';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema';
import { createInitialFilters, clearFilterValue } from '../filters/filterState';
import type { FilterField } from '../filters/filterSchema';
import type { WorksCalendarEvent, NormalizedEvent } from '../types/events';

type CalendarView = 'month' | 'agenda' | 'schedule' | 'timeline' | 'base' | 'assets' | 'week' | 'day' | string;
type CalendarFilters = Record<string, unknown>;
export type CalendarState = {
  view: CalendarView;
  setView: (value: CalendarView) => void;
  currentDate: Date;
  setCurrentDate: (value: Date) => void;
  /**
   * User-controlled day-span window (in days) for the timeline-style views.
   * Bound to the 7/14/30/90 pills in the sub-toolbar.
   *
   * `null` is the implicit "auto" / "view default" — timeline views fall
   * back to their intrinsic range (e.g. ScheduleView shows the calendar
   * month around currentDate). When set to a positive number, observing
   * views render exactly that many days starting from currentDate.
   *
   * Views that have a fixed intrinsic span (month, week, day) ignore this
   * value entirely.
   */
  dayWindow: number | null;
  setDayWindow: (value: number | null) => void;
  events: NormalizedEvent[];
  visibleEvents: NormalizedEvent[];
  categories: string[];
  resources: string[];
  filters: CalendarFilters;
  navigate: (direction: number) => void;
  goToToday: () => void;
  toggleCategory: (cat: string) => void;
  toggleResource: (res: string) => void;
  toggleSourceFilter: (id: string) => void;
  setSearch: (search: string) => void;
  setDateRange: (dateRange: unknown) => void;
  setFilter: (key: string, value: unknown) => void;
  toggleFilter: (key: string, value: unknown) => void;
  clearFilter: (key: string) => void;
  clearFilters: () => void;
  replaceFilters: (newFilters: CalendarFilters) => void;
};

export function useCalendar(
  rawEvents: WorksCalendarEvent[],
  initialView: CalendarView = 'month',
  filterSchema: FilterField[] = DEFAULT_FILTER_SCHEMA,
  initialDayWindow: number | null = null,
): CalendarState {
  const [view,        setView]        = useState(initialView);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [filters,     setFilters]     = useState(() => createInitialFilters(filterSchema));
  const [dayWindow,   setDayWindow]   = useState<number | null>(initialDayWindow);

  const events = useMemo(() => normalizeEvents(rawEvents), [rawEvents]);

  const categories = useMemo(() => getCategories(events), [events]);
  const resources  = useMemo(() => getResources(events),  [events]);

  const visibleEvents = useMemo(
    () => applyFilters(events, filters, filterSchema),
    [events, filters, filterSchema],
  );

  const navigate = useCallback((direction: number) => {
    setCurrentDate(prev => {
      switch (view) {
        case 'month':
        case 'agenda':
        case 'schedule':
        case 'timeline':
        case 'base':
        case 'assets':   return addMonths(prev, direction);
        case 'week':     return addWeeks(prev, direction);
        case 'day':      return addDays(prev, direction);
        default:         return prev;
      }
    });
  }, [view]);

  const goToToday = useCallback(() => setCurrentDate(new Date()), []);

  // ── Named toggles (backward-compatible) ──────────────────────────────────────

  const asStringSet = (value: unknown): Set<string> => {
    if (value instanceof Set) return new Set([...value].map(String));
    if (Array.isArray(value)) return new Set(value.map(String));
    return new Set<string>();
  };

  const toggleCategory = useCallback((cat: string) => {
    setFilters((f: CalendarFilters) => {
      const next = asStringSet(f['categories']);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return { ...f, categories: next };
    });
  }, []);

  const toggleResource = useCallback((res: string) => {
    setFilters((f: CalendarFilters) => {
      const next = asStringSet(f['resources']);
      if (next.has(res)) next.delete(res); else next.add(res);
      return { ...f, resources: next };
    });
  }, []);

  const toggleSourceFilter = useCallback((id: string) => {
    setFilters((f: CalendarFilters) => {
      const next = asStringSet(f['sources']);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...f, sources: next };
    });
  }, []);

  const setSearch    = useCallback((search: string)    => setFilters((f: CalendarFilters) => ({ ...f, search })),    []);
  const setDateRange = useCallback((dateRange: unknown) => setFilters((f: CalendarFilters) => ({ ...f, dateRange })), []);

  // ── Generic schema-driven API ─────────────────────────────────────────────────

  /** Set a single filter field by key. */
  const setFilter = useCallback((key: string, value: unknown) => {
    setFilters((f: CalendarFilters) => ({ ...f, [key]: value }));
  }, []);

  /** Toggle a single value inside a multi-select filter field. */
  const toggleFilter = useCallback((key: string, value: unknown) => {
    setFilters((f: CalendarFilters) => {
      const current = f[key];
      const next: Set<unknown> = current instanceof Set ? new Set(current) : new Set();
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...f, [key]: next };
    });
  }, []);

  /** Clear one filter field back to its default (empty) value. */
  const clearFilter = useCallback((key: string) => {
    const field = filterSchema.find(fd => fd.key === key);
    setFilters((f: CalendarFilters) => ({ ...f, [key]: clearFilterValue(field) }));
  }, [filterSchema]);

  const clearFilters = useCallback(() => {
    setFilters(createInitialFilters(filterSchema));
  }, [filterSchema]);

  /** Replace the entire filter state at once (used by saved-view apply). */
  const replaceFilters = useCallback((newFilters: CalendarFilters) => {
    setFilters(newFilters);
  }, []);

  return {
    view, setView,
    currentDate, setCurrentDate,
    dayWindow, setDayWindow,
    events, visibleEvents,
    categories, resources,
    filters,
    navigate, goToToday,
    // Named callbacks (backward compat)
    toggleCategory, toggleResource, toggleSourceFilter,
    setSearch, setDateRange,
    // Generic schema-driven API
    setFilter, toggleFilter, clearFilter,
    clearFilters,
    replaceFilters,
  };
}
