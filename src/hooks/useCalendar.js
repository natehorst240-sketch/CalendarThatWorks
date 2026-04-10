/**
 * useCalendar.js — Central state hook: current date, view, filters.
 */
import { useState, useMemo, useCallback } from 'react';
import { addMonths, addWeeks, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { normalizeEvents } from '../core/eventModel.js';
import { applyFilters, getCategories, getResources } from '../filters/filterEngine.js';

export function useCalendar(rawEvents, initialView = 'month') {
  const [view,        setView]        = useState(initialView);
  // Use actual today — views compute their own visible range from currentDate
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [filters,     setFilters]     = useState({
    categories: new Set(),
    resources:  new Set(),
    sources:    new Set(),
    dateRange:  null,
    search:     '',
  });

  const events = useMemo(() => normalizeEvents(rawEvents), [rawEvents]);

  const categories = useMemo(() => getCategories(events), [events]);
  const resources  = useMemo(() => getResources(events),  [events]);

  const visibleEvents = useMemo(
    () => applyFilters(events, filters),
    [events, filters],
  );

  const navigate = useCallback((direction) => {
    setCurrentDate(prev => {
      switch (view) {
        case 'month':
        case 'agenda':
        case 'schedule':
        case 'timeline': return addMonths(prev, direction);
        case 'week':     return addWeeks(prev, direction);
        case 'day':      return addDays(prev, direction);
        default:         return prev;
      }
    });
  }, [view]);

  /** Jump to today in the context of the current view. */
  const goToToday = useCallback(() => setCurrentDate(new Date()), []);

  const toggleCategory = useCallback((cat) => {
    setFilters(f => {
      const next = new Set(f.categories);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return { ...f, categories: next };
    });
  }, []);

  const toggleResource = useCallback((res) => {
    setFilters(f => {
      const next = new Set(f.resources);
      next.has(res) ? next.delete(res) : next.add(res);
      return { ...f, resources: next };
    });
  }, []);

  const toggleSourceFilter = useCallback((id) => {
    setFilters(f => {
      const next = new Set(f.sources);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...f, sources: next };
    });
  }, []);

  const setSearch    = useCallback((search)    => setFilters(f => ({ ...f, search })),    []);
  const setDateRange = useCallback((dateRange) => setFilters(f => ({ ...f, dateRange })), []);

  const clearFilters = useCallback(() => {
    setFilters({ categories: new Set(), resources: new Set(), sources: new Set(), dateRange: null, search: '' });
  }, []);

  /** Replace the entire filter state at once (used by profile apply). */
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
    toggleCategory, toggleResource, toggleSourceFilter,
    setSearch, setDateRange,
    clearFilters,
    replaceFilters,
  };
}
