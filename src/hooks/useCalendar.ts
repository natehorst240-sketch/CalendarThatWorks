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

export function useCalendar(rawEvents, initialView = 'month', filterSchema = DEFAULT_FILTER_SCHEMA) {
  const [view,        setView]        = useState(initialView);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [filters,     setFilters]     = useState(() => createInitialFilters(filterSchema));

  const events = useMemo(() => normalizeEvents(rawEvents), [rawEvents]);

  const categories = useMemo(() => getCategories(events), [events]);
  const resources  = useMemo(() => getResources(events),  [events]);

  const visibleEvents = useMemo(
    () => applyFilters(events, filters, filterSchema),
    [events, filters, filterSchema],
  );

  const navigate = useCallback((direction) => {
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

  const toggleCategory = useCallback((cat) => {
    setFilters(f => {
      const next = new Set((f as any).categories);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return { ...f, categories: next };
    });
  }, []);

  const toggleResource = useCallback((res) => {
    setFilters(f => {
      const next = new Set((f as any).resources);
      next.has(res) ? next.delete(res) : next.add(res);
      return { ...f, resources: next };
    });
  }, []);

  const toggleSourceFilter = useCallback((id) => {
    setFilters(f => {
      const next = new Set((f as any).sources);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...f, sources: next };
    });
  }, []);

  const setSearch    = useCallback((search)    => setFilters(f => ({ ...f, search })),    []);
  const setDateRange = useCallback((dateRange) => setFilters(f => ({ ...f, dateRange })), []);

  // ── Generic schema-driven API ─────────────────────────────────────────────────

  /** Set a single filter field by key. */
  const setFilter = useCallback((key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
  }, []);

  /** Toggle a single value inside a multi-select filter field. */
  const toggleFilter = useCallback((key, value) => {
    setFilters(f => {
      const current = f[key];
      const next = current instanceof Set ? new Set(current) : new Set();
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...f, [key]: next };
    });
  }, []);

  /** Clear one filter field back to its default (empty) value. */
  const clearFilter = useCallback((key) => {
    const field = filterSchema.find(fd => fd.key === key);
    setFilters(f => ({ ...f, [key]: clearFilterValue(field) }));
  }, [filterSchema]);

  const clearFilters = useCallback(() => {
    setFilters(createInitialFilters(filterSchema));
  }, [filterSchema]);

  /** Replace the entire filter state at once (used by saved-view apply). */
  const replaceFilters = useCallback((newFilters) => {
    setFilters(newFilters);
  }, []);

  return {
    view, setView,
    currentDate, setCurrentDate,
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
