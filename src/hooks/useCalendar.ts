/**
 * useCalendar.js — Central state hook: current date, view, filters.
 *
 * Accepts an optional filterSchema (FilterField[]) that drives the initial
 * filter state shape and the applyFilters call.  When omitted,
 * DEFAULT_FILTER_SCHEMA is used and behaviour is identical to before.
 */
import { useState, useMemo, useCallback } from 'react';
import { addMonths, addWeeks, addDays } from 'date-fns';
import { normalizeEvents } from '../core/eventModel';
import { applyFilters, getCategories, getResources } from '../filters/filterEngine';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema';
import { createInitialFilters, clearFilterValue } from '../filters/filterState';

type CalendarView = 'month' | 'agenda' | 'schedule' | 'timeline' | 'base' | 'assets' | 'week' | 'day' | string;
type CalendarFilters = Record<string, any>;
type CalendarState = {
  view: CalendarView;
  setView: (value: CalendarView) => void;
  currentDate: Date;
  setCurrentDate: (value: Date) => void;
  /**
   * User-controlled day-span window (in days) for the timeline-style views.
   * Bound to the 7/14/30/90 pills in the sub-toolbar.
   *
   * TODO(shell-rework reflow): no view currently observes this value, so
   * picking a pill only shifts the active swatch. Wiring up the views is
   * a separate per-view refactor — TimelineView, BaseGanttView, and
   * AssetsView all hardcode month-spanning math around `currentDate` and
   * need their own props + range derivation to honour an arbitrary
   * dayWindow. Tracked as a followup to the shell-rework PR series.
   *
   * Views that have an intrinsic span (month, week, day) are expected to
   * keep ignoring this value.
   */
  dayWindow: number;
  setDayWindow: (value: number) => void;
  events: any[];
  visibleEvents: any[];
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
  rawEvents: any[],
  initialView: CalendarView = 'month',
  filterSchema: any[] = DEFAULT_FILTER_SCHEMA,
  initialDayWindow: number = 30,
): CalendarState {
  const [view,        setView]        = useState(initialView);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [filters,     setFilters]     = useState(() => createInitialFilters(filterSchema));
  const [dayWindow,   setDayWindow]   = useState(initialDayWindow);

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

  const toggleCategory = useCallback((cat: string) => {
    setFilters((f: CalendarFilters) => {
      const next = new Set<string>(f['categories']);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return { ...f, categories: next };
    });
  }, []);

  const toggleResource = useCallback((res: string) => {
    setFilters((f: CalendarFilters) => {
      const next = new Set<string>(f['resources']);
      next.has(res) ? next.delete(res) : next.add(res);
      return { ...f, resources: next };
    });
  }, []);

  const toggleSourceFilter = useCallback((id: string) => {
    setFilters((f: CalendarFilters) => {
      const next = new Set<string>(f['sources']);
      next.has(id) ? next.delete(id) : next.add(id);
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
      const next = current instanceof Set ? new Set(current) : new Set();
      next.has(value) ? next.delete(value) : next.add(value);
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
