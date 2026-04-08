/**
 * useCalendar.js — Central state hook: current date, view, filters.
 */
import { useState, useMemo, useCallback } from 'react';
import { addMonths, addWeeks, addDays, startOfMonth } from 'date-fns';
import { normalizeEvents } from '../core/eventModel.js';
import { applyFilters, getCategories, getResources } from '../filters/filterEngine.js';

export function useCalendar(rawEvents, initialView = 'month') {
  const [view,        setView]        = useState(initialView);
  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));
  const [filters,     setFilters]     = useState({
    categories: new Set(),
    resources:  new Set(),
    dateRange:  null,
    search:     '',
  });

  const events = useMemo(() => normalizeEvents(rawEvents), [rawEvents]);

  const categories = useMemo(() => getCategories(events), [events]);
  const resources  = useMemo(() => getResources(events),  [events]);

  const visibleEvents = useMemo(
    () => applyFilters(events, filters),
    [events, filters]
  );

  const navigate = useCallback((direction) => {
    setCurrentDate(prev => {
      if (view === 'month' || view === 'agenda' || view === 'schedule') {
        return addMonths(prev, direction);
      }
      if (view === 'week') return addWeeks(prev, direction);
      if (view === 'day')  return addDays(prev, direction);
      return prev;
    });
  }, [view]);

  const goToToday = useCallback(() => {
    setCurrentDate(startOfMonth(new Date()));
  }, []);

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

  const setSearch = useCallback((search) => {
    setFilters(f => ({ ...f, search }));
  }, []);

  const setDateRange = useCallback((dateRange) => {
    setFilters(f => ({ ...f, dateRange }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ categories: new Set(), resources: new Set(), dateRange: null, search: '' });
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
    toggleCategory, toggleResource,
    setSearch, setDateRange,
    clearFilters,
    replaceFilters,
  };
}
