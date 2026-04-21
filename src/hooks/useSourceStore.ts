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
import type { WorksCalendarEvent } from '../types/events';

// ── Storage keys ──────────────────────────────────────────────────────────────

const SOURCE_PREFIX = 'wc-sources-';
const LEGACY_PREFIX = 'wc-feeds-';

type IcsSource = {
  id: string;
  type: 'ics';
  label: string;
  color: string;
  enabled: boolean;
  addedAt: string;
  url: string;
  refreshInterval: number;
};
type CsvSource = {
  id: string;
  type: 'csv';
  label: string;
  color: string;
  enabled: boolean;
  addedAt: string;
  events: WorksCalendarEvent[];
  importedAt?: string;
};
type CalendarSource = {
  id: string;
  type: string;
  label?: string;
  color?: string;
  enabled?: boolean;
  addedAt?: string;
  url?: string;
  refreshInterval?: number;
  events?: WorksCalendarEvent[];
  importedAt?: string;
};
type SourcePatch = Partial<Omit<CalendarSource, 'id'>>;
type NewSource = Partial<CalendarSource> & { type?: string };
type ActiveIcsSource = {
  url: string;
  label?: string;
  refreshInterval?: number;
};

function sourceKey(calendarId: string): string { return `${SOURCE_PREFIX}${calendarId}`; }
function legacyKey(calendarId: string): string { return `${LEGACY_PREFIX}${calendarId}`; }

// ── Persistence helpers ───────────────────────────────────────────────────────

export function loadSources(calendarId: string): CalendarSource[] {
  try {
    const raw = localStorage.getItem(sourceKey(calendarId));
    if (raw) return JSON.parse(raw);

    // One-time migration: convert legacy wc-feeds- entries to typed sources
    const legacy = localStorage.getItem(legacyKey(calendarId));
    if (legacy) {
      const migrated = (JSON.parse(legacy) as Array<Omit<IcsSource, 'type'>>).map((f) => ({ ...f, type: 'ics' as const }));
      persistSources(calendarId, migrated);
      return migrated;
    }
  } catch {}
  return [];
}

export function persistSources(calendarId: string, sources: CalendarSource[]): void {
  try {
    localStorage.setItem(sourceKey(calendarId), JSON.stringify(sources));
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSourceStore(calendarId: string): {
  sources: CalendarSource[];
  activeIcsSources: ActiveIcsSource[];
  activeCsvSources: CsvSource[];
  addSource: (partial: NewSource) => CalendarSource;
  removeSource: (id: string) => void;
  updateSource: (id: string, patch: SourcePatch) => void;
  toggleSource: (id: string) => void;
} {
  const [sources, setSources] = useState<CalendarSource[]>(() => loadSources(calendarId));

  // Re-load when calendarId changes (multiple embedded calendar instances)
  useEffect(() => {
    setSources(loadSources(calendarId));
  }, [calendarId]);

  // Persist on every change
  useEffect(() => {
    persistSources(calendarId, sources);
  }, [calendarId, sources]);

  const addSource = useCallback((partial: NewSource): CalendarSource => {
    const sourceType = partial.type ?? 'ics';
    const isCsv = sourceType === 'csv';
    const source: CalendarSource = {
      id:              createId('src'),
      type:            sourceType,
      label:           '',
      color:           '#3b82f6',
      enabled:         true,
      addedAt:         new Date().toISOString(),
      // ICS defaults (overridden by partial)
      url:             '',
      refreshInterval: 300_000,
      // CSV defaults (overridden by partial)
      importedAt:      undefined,
      ...(isCsv ? { events: [] } : {}),
      ...partial,
    };
    setSources(prev => [...prev, source]);
    return source;
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateSource = useCallback((id: string, patch: SourcePatch) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const toggleSource = useCallback((id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }, []);

  // ICS feeds ready for useFeedEvents
  const activeIcsSources = useMemo<ActiveIcsSource[]>(
    () =>
      sources
        .filter(
          (s): s is CalendarSource & { type: 'ics'; url: string } =>
            s.type === 'ics'
            && s.enabled === true
            && typeof s.url === 'string'
            && s.url.length > 0,
        )
        .map(({ url, label, refreshInterval }) => ({ url, label, refreshInterval })),
    [sources],
  );

  // CSV datasets with at least one event
  const activeCsvSources = useMemo<CsvSource[]>(
    () => sources.filter((s): s is CsvSource => s.type === 'csv' && s.enabled && (s.events?.length ?? 0) > 0),
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
