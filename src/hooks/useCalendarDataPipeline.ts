import { useState, useEffect, useMemo, useRef } from 'react';
import { useFetchEvents } from './useFetchEvents';
import { useSourceStore } from './useSourceStore';
import { useSourceAggregator } from './useSourceAggregator';
import { useRealtimeEvents } from './useRealtimeEvents';
import type { SupabaseRealtimeClientLike } from './useRealtimeEvents';
import { normalizeEvents } from '../core/eventModel';
import { useCalendarEngine } from './useCalendarEngine';
import { useTabScopedEvents } from './useTabScopedEvents';
import { shiftEmployeeIdsAt } from './useShiftOverlap';
import { viewRange, ALL_VIEWS } from '../core/calendarViewConfig';
import { applyFilters, getCategories, getResources } from '../filters/filterEngine';
import { sortEvents } from '../core/sortEngine';
import { viewScopedSchema } from '../filters/filterSchema';
import { resolveLabels } from '../core/config/resolveLabels';
import { SCHEDULE_WORKFLOW_CATEGORIES } from '../core/scheduleModel';
import type { AnnouncerRef } from '../ui/ScreenReaderAnnouncer';
import type { CalendarView, WorksCalendarProps } from '../WorksCalendar.types';
import type { WorksCalendarEvent } from '../types/events';
import type { FilterField } from '../filters/filterSchema';
import type { SortConfig } from '../types/grouping.ts';
import type { CalObject } from './useCalendarSetup';
import { useOwnerConfig } from './useOwnerConfig';

export interface UseCalendarDataPipelineInput {
  cal: CalObject;
  ownerCfg: ReturnType<typeof useOwnerConfig>;
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  rawEvents: WorksCalendarProps['events'];
  fetchEvents: WorksCalendarProps['fetchEvents'];
  icalFeeds: WorksCalendarProps['icalFeeds'];
  calendarId: string;
  supabaseUrl: string | undefined;
  supabaseKey: string | undefined;
  supabaseTable: string | undefined;
  supabaseFilter: string | undefined;
  rawPools: WorksCalendarProps['pools'];
  businessHours: WorksCalendarProps['businessHours'];
  blockedWindows: WorksCalendarProps['blockedWindows'];
  onPoolsChange: WorksCalendarProps['onPoolsChange'];
  configuredEmployees: NonNullable<WorksCalendarProps['employees']>;
  effectiveAssets: WorksCalendarProps['assets'];
  selectedBaseIds: string[];
  assetRequestCategories: WorksCalendarProps['assetRequestCategories'];
  categoriesConfig: WorksCalendarProps['categoriesConfig'];
  schema: FilterField[];
  activeSort: SortConfig[] | null;
  initialView: string | undefined;
}

/**
 * Resolve the active calendar view from a priority-ordered list of candidates.
 * Called from the consolidated view-resolution effect; exported for unit testing.
 *
 * Priority (first match wins):
 *   1. `initialView` — if set and present in `enabledIds`
 *   2. `configDefault` — if set, enabled, and this is the first resolution for the current
 *      calendarId (`isNewCalendar`); prevents re-applying on every user navigation.
 *   3. The current `calView` — if still enabled (no change needed).
 *   4. `configDefault` as a general invalid-view fallback (even after initial application).
 *   5. `'month'` (always-on view, guaranteed to exist).
 *
 * When `isNewCalendar` is false the caller has already done the initial
 * resolution: we only need to recover from an invalid current view, so we
 * skip priority #1 and #3 and jump straight to the fallback path.
 */
export function resolveActiveView({
  enabledIds,
  calView,
  initialView,
  configDefault,
  isNewCalendar,
}: {
  enabledIds: Set<string>;
  calView: string;
  initialView: string | undefined;
  configDefault: string | undefined;
  isNewCalendar: boolean;
}): string {
  if (isNewCalendar) {
    if (initialView && enabledIds.has(initialView)) return initialView;
    if (configDefault && enabledIds.has(configDefault)) return configDefault;
    if (enabledIds.has(calView)) return calView;
  }
  return configDefault && enabledIds.has(configDefault) ? configDefault : 'month';
}

export function useCalendarDataPipeline({
  cal, ownerCfg, weekStartDay,
  rawEvents, fetchEvents, icalFeeds, calendarId,
  supabaseUrl, supabaseKey, supabaseTable, supabaseFilter,
  rawPools, businessHours, blockedWindows, onPoolsChange,
  configuredEmployees, effectiveAssets, selectedBaseIds,
  assetRequestCategories, categoriesConfig, schema, activeSort, initialView,
}: UseCalendarDataPipelineInput) {
  const range = useMemo(
    () => viewRange(cal.view, cal.currentDate, weekStartDay),
    [cal.view, cal.currentDate, weekStartDay],
  );

  const { fetchedEvents, loading: fetchLoading } = useFetchEvents(
    fetchEvents, cal.view, cal.currentDate, weekStartDay,
  );

  const sourceStore = useSourceStore(calendarId);

  const { events: sourceEvents, feedErrors, isFetchingFeeds } = useSourceAggregator({
    icalFeedsProp: icalFeeds,
    sourceStore,
  });

  const [supabaseClient, setSupabaseClient] = useState<SupabaseRealtimeClientLike | null>(null);
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;
    import('@supabase/supabase-js')
      .then(({ createClient }) => setSupabaseClient(createClient(supabaseUrl, supabaseKey) as unknown as SupabaseRealtimeClientLike))
      .catch(() => console.warn('[WorksCalendar] @supabase/supabase-js not installed.'));
  }, [supabaseUrl, supabaseKey]);

  const { events: realtimeEvents } = useRealtimeEvents({
    supabaseClient,
    table:  supabaseTable,
    filter: supabaseFilter,
  });

  const allNormalized = useMemo(() => {
    // Heterogeneous inputs (host events, fetched events, CSV/ICS source rows,
    // realtime rows) are reconciled by id here, then normalized into the
    // canonical event shape.
    const incoming = [
      ...(rawEvents ?? []), ...fetchedEvents, ...sourceEvents, ...realtimeEvents,
    ] as unknown as WorksCalendarEvent[];
    const map = new Map<string, WorksCalendarEvent>();
    const noId: WorksCalendarEvent[] = [];
    incoming.forEach(ev => {
      // A null/undefined/primitive entry from any of the four sources would
      // crash on `.id` here (and again in `normalizeEvent`) — skip it.
      if (ev == null || typeof ev !== 'object') return;
      const id = (ev as { id?: unknown }).id;
      if (id != null && String(id) !== '') map.set(String(id), ev);
      else noId.push(ev);
    });
    return normalizeEvents([...map.values(), ...noId]);
  }, [rawEvents, fetchedEvents, sourceEvents, realtimeEvents]);

  const announcerRef = useRef<AnnouncerRef | null>(null);
  const engineResult = useCalendarEngine({
    allNormalized,
    rawPools: rawPools ?? null,
    businessHours: ownerCfg.config?.['businessHours'] ?? businessHours,
    blockedWindows,
    announcerRef,
    range,
    onPoolsChange,
  });

  useEffect(() => {
    engineResult.engine.dispatch({ type: 'SET_VIEW', view: cal.view as CalendarView });
  }, [engineResult.engine, cal.view]);

  useEffect(() => {
    engineResult.engine.dispatch({ type: 'NAVIGATE_TO', date: cal.currentDate });
  }, [engineResult.engine, cal.currentDate]);

  const configuredBases   = ownerCfg.config?.['team']?.bases   ?? [];
  const configuredRegions = ownerCfg.config?.['team']?.regions ?? [];

  const profileLabels = useMemo(
    () => resolveLabels({
      profile: ownerCfg.config?.['profile'] as string | undefined,
      labels:  ownerCfg.config?.['labels']  as Record<string, string> | undefined,
    }),
    [ownerCfg.config?.['profile'], ownerCfg.config?.['labels']],
  );
  const locationLabel = ownerCfg.config?.['team']?.locationLabel ?? profileLabels.location;
  const assetsLabel   = ownerCfg.config?.['team']?.assetsLabel   ?? profileLabels.resource;

  const VIEWS = useMemo(() => {
    const enabled = new Set<string>(ownerCfg.config?.['display']?.enabledViews ?? []);
    return ALL_VIEWS
      .filter(v => v.alwaysOn || enabled.has(v.id))
      .map(v => {
        if (v.id === 'base')   return { ...v, label: locationLabel };
        if (v.id === 'assets') return { ...v, label: `${assetsLabel}s` };
        return v;
      });
  }, [ownerCfg.config?.['display']?.enabledViews, locationLabel, assetsLabel]);

  // Tracks the calendarId for which the initial view was last resolved.
  // Using the calendarId (not a boolean) means a switch to a different
  // calendar automatically re-arms without a separate effect.
  const defaultViewAppliedForRef = useRef<string | null>(null);
  useEffect(() => {
    const enabledIds = new Set<string>(VIEWS.map(v => v.id));
    const configDefault = ownerCfg.config?.['display']?.defaultView as string | undefined;
    const isNewCalendar = defaultViewAppliedForRef.current !== calendarId;

    // Nothing to do: current view is valid and we have already done the
    // initial resolution for this calendarId.
    if (enabledIds.has(cal.view) && !isNewCalendar) return;

    const target = resolveActiveView({
      enabledIds, calView: cal.view, initialView, configDefault, isNewCalendar,
    });
    if (isNewCalendar) defaultViewAppliedForRef.current = calendarId;
    if (cal.view !== target) cal.setView(target);
  }, [VIEWS, cal.view, initialView, calendarId, ownerCfg.config?.['display']?.defaultView]);

  const scopedEvents = useTabScopedEvents(cal.view, engineResult.expandedEvents, {
    employees: (configuredEmployees ?? []) as { id: string; base?: string | null }[],
    assets:    effectiveAssets ?? [],
    bases:     (configuredBases ?? []) as { id: string; name: string }[],
    selectedBaseIds,
  });

  const categories = useMemo(() => getCategories(scopedEvents), [scopedEvents]);
  const eventFormCats = useMemo(
    () => categories.filter(c => !SCHEDULE_WORKFLOW_CATEGORIES.has(c) && !SCHEDULE_WORKFLOW_CATEGORIES.has(String(c).toLowerCase())),
    [categories],
  );

  const resolvedAssetRequestCategories = useMemo(() => {
    if (!Array.isArray(assetRequestCategories) || assetRequestCategories.length === 0) return [];
    const cfg = (categoriesConfig ?? ownerCfg.config?.['categoriesConfig']) as { categories?: unknown[] };
    const defs = (Array.isArray(cfg?.categories) ? cfg.categories : []) as Array<{ id: string; label?: string; color?: string }>;
    const byId = new Map(defs.map(d => [d.id, d]));
    return assetRequestCategories.map((id: string) => {
      const def = byId.get(id);
      return { id, label: def?.label ?? id, color: def?.color };
    });
  }, [assetRequestCategories, categoriesConfig, ownerCfg.config?.['categoriesConfig']]);

  const canRequestAsset =
    resolvedAssetRequestCategories.length > 0 &&
    Array.isArray(effectiveAssets) &&
    effectiveAssets.length > 0;

  const resources      = useMemo(() => getResources(scopedEvents), [scopedEvents]);
  const filteredEvents = useMemo(
    () => applyFilters(scopedEvents, cal.filters, schema),
    [scopedEvents, cal.filters, schema],
  );
  const filterBarSchema = useMemo(
    () => viewScopedSchema(schema, cal.view),
    [schema, cal.view],
  );
  const visibleEvents = useMemo(
    () => (activeSort && activeSort.length > 0 ? sortEvents(filteredEvents, activeSort) : filteredEvents),
    [filteredEvents, activeSort],
  );
  const onShiftIds = useMemo(() => shiftEmployeeIdsAt(visibleEvents), [visibleEvents]);

  return {
    ...engineResult,
    announcerRef,
    fetchLoading,
    sourceStore,
    feedErrors,
    isFetchingFeeds,
    configuredBases,
    configuredRegions,
    profileLabels,
    locationLabel,
    assetsLabel,
    VIEWS,
    scopedEvents,
    categories,
    eventFormCats,
    resolvedAssetRequestCategories,
    canRequestAsset,
    resources,
    filterBarSchema,
    visibleEvents,
    onShiftIds,
  };
}
