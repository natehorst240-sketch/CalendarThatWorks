/**
 * useSourceStore — unified store for all calendar data sources.
 *
 * Supersedes useFeedStore. Handles two source types:
 *   'ics'  — iCal feed (fetched by URL at refreshInterval)
 *   'csv'  — CSV dataset (pre-parsed events[], imported by user)
 *
 * Stored per calendarId under `wc-sources-${calendarId}`.
 * On first load, migrates legacy `wc-feeds-${calendarId}` entries automatically.
 *
 * Returns:
 *   sources          — CalendarSource[]  (all, including disabled)
 *   activeIcsSources — ICalFeed[]        (enabled ICS → shape for useFeedEvents)
 *   activeCsvSources — CalendarSource[]  (enabled CSV sources with events)
 *   addSource        — (partial) => CalendarSource
 *   removeSource     — (id) => void
 *   updateSource     — (id, patch) => void
 *   toggleSource     — (id) => void
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { createId } from '../core/createId';

// ── Storage keys ──────────────────────────────────────────────────────────────

const SOURCE_PREFIX = 'wc-sources-';
const LEGACY_PREFIX = 'wc-feeds-';

function sourceKey(calendarId) { return `${SOURCE_PREFIX}${calendarId}`; }
function legacyKey(calendarId) { return `${LEGACY_PREFIX}${calendarId}`; }

// ── Persistence helpers ───────────────────────────────────────────────────────

export function loadSources(calendarId) {
  try {
    const raw = localStorage.getItem(sourceKey(calendarId));
    if (raw) return JSON.parse(raw);

    // One-time migration: convert legacy wc-feeds- entries to typed sources
    const legacy = localStorage.getItem(legacyKey(calendarId));
    if (legacy) {
      const migrated = JSON.parse(legacy).map(f => ({ ...f, type: 'ics' }));
      persistSources(calendarId, migrated);
      return migrated;
    }
  } catch {}
  return [];
}

export function persistSources(calendarId, sources) {
  try {
    localStorage.setItem(sourceKey(calendarId), JSON.stringify(sources));
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSourceStore(calendarId) {
  const [sources, setSources] = useState(() => loadSources(calendarId));

  // Re-load when calendarId changes (multiple embedded calendar instances)
  useEffect(() => {
    setSources(loadSources(calendarId));
  }, [calendarId]);

  // Persist on every change
  useEffect(() => {
    persistSources(calendarId, sources);
  }, [calendarId, sources]);

  const addSource = useCallback((partial) => {
    const source = {
      id:              createId('src'),
      type:            'ics',
      label:           '',
      color:           '#3b82f6',
      enabled:         true,
      addedAt:         new Date().toISOString(),
      // ICS defaults (overridden by partial)
      url:             '',
      refreshInterval: 300_000,
      // CSV defaults (overridden by partial)
      events:          undefined,
      importedAt:      undefined,
      ...partial,
    };
    setSources(prev => [...prev, source]);
    return source;
  }, []);

  const removeSource = useCallback((id) => {
    setSources(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateSource = useCallback((id, patch) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const toggleSource = useCallback((id) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }, []);

  // ICS feeds ready for useFeedEvents
  const activeIcsSources = useMemo(
    () =>
      sources
        .filter(s => s.type === 'ics' && s.enabled && s.url)
        .map(({ url, label, refreshInterval }) => ({ url, label, refreshInterval })),
    [sources],
  );

  // CSV datasets with at least one event
  const activeCsvSources = useMemo(
    () => sources.filter(s => s.type === 'csv' && s.enabled && s.events?.length),
    [sources],
  );

  return {
    sources,
    activeIcsSources,
    activeCsvSources,
    addSource,
    removeSource,
    updateSource,
    toggleSource,
  };
}
