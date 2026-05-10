/**
 * WorksCalendar — main component.
 */
import {
  useState, useCallback, useEffect, useRef,
  useImperativeHandle, forwardRef, useMemo,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, addMonths } from 'date-fns';
import { Bookmark, ChevronLeft, ChevronRight, Download, Filter, Plus, Settings, Sparkles, Upload } from 'lucide-react';

import type { WorksCalendarProps, CalendarApi, CalendarView } from './WorksCalendar.types';
export type { WorksCalendarEvent, CalendarView, CalendarRole, ScheduleInstantiationLimits, CalendarApi, WorksCalendarProps, DispatchMissionCandidate, DispatchMissionReadiness, DispatchEvaluator } from './WorksCalendar.types';
import { ALL_VIEWS, DEFAULT_SCHEDULE_INSTANTIATION_LIMITS, exportVisibleEvents, viewRange } from './core/calendarViewConfig';
import type { ViewDef } from './core/calendarViewConfig';

import { useOwnerConfig }     from './hooks/useOwnerConfig';
import { useFetchEvents }     from './hooks/useFetchEvents';
import { useSourceStore }      from './hooks/useSourceStore';
import { useSourceAggregator } from './hooks/useSourceAggregator';
import { useSavedViews } from './hooks/useSavedViews';
import { sortEvents } from './core/sortEngine.ts';
import { useRealtimeEvents }  from './hooks/useRealtimeEvents';
import { usePermissions }     from './hooks/usePermissions';
import { useEventOptions }    from './hooks/useEventOptions';
import { useTouchSwipe }     from './hooks/useTouchSwipe';
import { CalendarContext }    from './core/CalendarContext';
import type { CalendarContextValue } from './types/ui';
import { normalizeEvents }    from './core/eventModel';
import type { AnnouncerRef } from './ui/ScreenReaderAnnouncer';
import { useCalendarEngine } from './hooks/useCalendarEngine';
import { useEventMutations } from './hooks/useEventMutations';
import { useScheduleMutations } from './hooks/useScheduleMutations';
import { useGroupingSort } from './hooks/useGroupingSort';
import { useCascadeFilters } from './hooks/useCascadeFilters';
import { useSetupLanding } from './hooks/useSetupLanding';
import { useSavedViewsManager } from './hooks/useSavedViewsManager';
import { useScheduleTemplates } from './hooks/useScheduleTemplates';
import { useModalState } from './hooks/useModalState';
import CalendarModals from './ui/CalendarModals';
import SetupLanding, { type SetupLandingResult } from './ui/SetupLanding';
import { applyFilters, getCategories, getResources } from './filters/filterEngine';
import { resolveCssTheme, normalizeTheme, THEME_META } from './styles/themes';
import { buildDefaultFilterSchema, makeResourceResolver, viewScopedSchema, type FilterField } from './filters/filterSchema';
import { SCHEDULE_WORKFLOW_CATEGORIES, isScheduleWorkflowEvent } from './core/scheduleModel';
import { useTabScopedEvents } from './hooks/useTabScopedEvents';
import { captureSavedViewFields, type ViewId } from './core/viewScope';
import { resolveLabels } from './core/config/resolveLabels';
import { buildActiveFilterPills, buildFilterSummary, hasActiveFilters, createInitialFilters, clearFilterValue } from './filters/filterState';
import { AppShell }           from './ui/AppShell';
import { AppHeader }          from './ui/AppHeader';
import { LeftRail }           from './ui/LeftRail';
import { SubToolbar }         from './ui/SubToolbar';
import { DayWindowPills }     from './ui/DayWindowPills';
import { RightPanel, RightPanelSection, CrewOnShiftList } from './ui/RightPanel';
import { shiftEmployeeIdsAt } from './hooks/useShiftOverlap';
import ProfileBar             from './ui/ProfileBar';
import FilterGroupSidebar, { SidebarToggleButton } from './ui/FilterGroupSidebar';
import FocusChips, { DEFAULT_FOCUS_CHIPS } from './ui/FocusChips';
import type { FocusChipDef } from './ui/FocusChips';
import type { SidebarTab } from './ui/FilterGroupSidebar';
import OwnerLock              from './ui/OwnerLock';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import SavedFlash             from './ui/SavedFlash';
import ActiveFilterStrip      from './ui/ActiveFilterStrip';
import CalendarErrorBoundary   from './ui/CalendarErrorBoundary';
import MonthView              from './views/MonthView';
import WeekView               from './views/WeekView';
import DayView                from './views/DayView';
import AgendaView             from './views/AgendaView';
import ScheduleView           from './views/ScheduleView';
import AssetsView             from './views/AssetsView';
import BaseGanttView          from './views/BaseGanttView';
import DispatchView           from './views/DispatchView';
import RequestQueueView       from './views/RequestQueueView';
import { MapPeekWidget }      from './ui/MapPeekWidget';

import { createManualLocationProvider } from './providers/ManualLocationProvider.ts';
import type { AssetsZoomLevel, LocationProvider } from './types/assets';

import styles from './WorksCalendar.module.css';
import './styles/family/index.css';
import { customThemeToCssVars } from './core/themeSchema';

// Phase 1 migration boundary: keep WorksCalendar callback seams intentionally
// loose while removing implicit `any` from root handlers.
type LooseValue = any; // eslint-disable-line @typescript-eslint/no-explicit-any




export const WorksCalendar = forwardRef<CalendarApi, WorksCalendarProps>(function WorksCalendar(
  {
    // ── Data ──
    events:     rawEvents   = [],
    fetchEvents,
    icalFeeds,
    onImport,
    scheduleTemplates = [],
    scheduleTemplateAdapter,
    scheduleInstantiationLimits = DEFAULT_SCHEDULE_INSTANTIATION_LIMITS,
    onScheduleTemplateAnalytics,

    // ── Identity ──
    calendarId              = 'default',

    // ── Owner ──
    ownerPassword           = '',
    onConfigSave,

    // ── Dev mode — unlocks all admin features without a password ──
    devMode                 = false,

    // ── Notes ──
    notes       = {},
    onNoteSave,
    onNoteDelete,

    // ── Event callbacks ──
    onEventClick: onEventClickProp,
    onEventSave,
    onEventMove,
    onEventResize,
    onEventDelete,
    onEventGroupChange,
    onDateSelect,
    onViewChange,
    onMapWidgetOpenChange,
    showMapWidget = true,
    enableApprovalFlowsTab = true,

    // ── Supabase realtime ──
    supabaseUrl,
    supabaseKey,
    supabaseTable,
    supabaseFilter,

    // ── Access control ──
    role        = 'admin',   // 'admin' | 'user' | 'readonly'

    // ── Employees (for schedule/timeline view) ──
    employees   = [],
    onEmployeeAdd,
    onEmployeeDelete,
    onEmployeeAction,
    onAvailabilitySave,
    onScheduleSave,

    // ── Validation ──
    blockedWindows,

    // ── Appearance ──
    // No default here: a hard-coded fallback ('light') would always be
    // truthy and short-circuit the rawTheme `||` chain, hiding the
    // owner-config-driven theme even when the host doesn't pass a prop.
    // The actual default is applied in the rawTheme expression below.
    theme,
    colorRules,
    businessHours,

    // ── Custom rendering ──
    renderEvent,
    renderHoverCard,
    renderToolbar,
    leftRailExtras,
    rightPanelExtras,
    renderFilterBar,
    renderSavedViewsBar,
    focusChips,
    dispatchMissions,
    dispatchEvaluator,
    onDispatchAssign,
    emptyState,

    // ── Filter schema (pass a custom FilterField[] to extend or replace defaults) ──
    filterSchema,
    cascadeConfig,

    // ── UI toggles ──
    showAddButton           = false,
    hideEventTemplates       = false,
    eventResourceSuggestions,
    showSetupLanding        = false,

    // ── Initial view (overrides saved config on first render) ──
    initialView,

    // ── Week start day (prop takes priority over owner config) ──
    weekStartDay: weekStartDayProp,

    // ── Grouping ──
    groupBy,
    sort,
    showAllGroups,

    // ── Assets view ──
    locationProvider,
    categoriesConfig,
    assets,
    strictAssetFiltering,
    assetRequestCategories,
    onConflictCheck,
    onApprovalAction,
    renderAssetLocation,
    renderPoolLocation,
    renderAssetBadges,
    maintenanceRules,
    renderConflictBody,

    // ── Resource pools (#212) ──
    pools: rawPools,
    onPoolsChange,

    // ── Branding ──
    logoSrc,
    logoAlt,
    backgroundImage,

    // ── Map view (optional plugin) ──
    mapStyle,
  }: WorksCalendarProps,
  ref: ForwardedRef<CalendarApi>,
) {
  // SSR guard: avoid touching browser-only APIs during server rendering.
  if (typeof window === 'undefined') return null;

  // ── View / date / filter state ───────────────────────────────────────────
  const ownerCfg = useOwnerConfig({ calendarId, ownerPassword, onConfigSave, devMode });
  const weekStartDay = weekStartDayProp ?? ownerCfg.config?.['display']?.weekStartDay ?? 0;
  const customThemeVars = useMemo(() => customThemeToCssVars(ownerCfg.config?.['customTheme']), [ownerCfg.config?.['customTheme']]);
  const rootStyle = useMemo<React.CSSProperties>(() => ({
    ...(customThemeVars ?? {}),
    ...(backgroundImage ? ({ '--wc-bg-image': `url(${backgroundImage})` } as React.CSSProperties) : {}),
  }), [customThemeVars, backgroundImage]);
  // The raw theme value (from props, owner config, or default). The new theme
  // system uses `family-mode` IDs (see src/styles/themes.ts); the CSS runtime
  // still matches the historical single-word selectors, so we resolve the
  // user-facing ID to a CSS selector via resolveCssTheme().
  const rawTheme = theme || ownerCfg.config?.['setup']?.preferredTheme || 'canvas-light';
  const effectiveTheme = resolveCssTheme(rawTheme);
  const themeId = normalizeTheme(rawTheme);
  const themeFamily = THEME_META[themeId].family;
  const themeMode   = THEME_META[themeId].mode;
  const calendarTitle = ownerCfg.config?.['title'] || 'My WorksCalendar';
  // Merge parent's employees prop with owner-config team.members so edits
  // made from the Settings → Employees tab (e.g. renaming a member) are
  // reflected live in the schedule, even when the parent's prop is stale.
  // Config entries take precedence for matching ids; parent-only entries
  // (not yet mirrored into config) are preserved.
  const configuredEmployees = useMemo(() => {
    const configMembers = ownerCfg.config?.['team']?.members ?? [];
    const parentMembers = Array.isArray(employees) ? employees : [];
    if (configMembers.length === 0) return parentMembers;
    if (parentMembers.length === 0) return configMembers;
    const configById = new Map(configMembers.map((m: LooseValue) => [String(m.id), m]));
    const parentOnly = parentMembers.filter((m) => !configById.has(String(m.id)));
    return [...configMembers, ...parentOnly];
  }, [employees, ownerCfg.config?.['team']?.members]);

  // Resolve resource ids (e.g. "emp-sarah") to human-readable labels
  // (e.g. "Sarah Chen") using merged employees + assets directory.
  const effectiveAssets = assets ?? ownerCfg.config?.['assets'];
  const resolveResourceLabel = useMemo(
    () => makeResourceResolver({ employees: configuredEmployees, assets: effectiveAssets }),
    [configuredEmployees, effectiveAssets],
  );

  // When no custom schema is supplied, build the default schema with the
  // live resolver so People-filter options render names instead of ids.
  const schema = useMemo(
    () => filterSchema
      ?? buildDefaultFilterSchema({ employees: configuredEmployees, assets: effectiveAssets }),
    [filterSchema, configuredEmployees, effectiveAssets],
  );
  // ── Calendar navigation & filter state ──────────────────────────────────────
  // Engine is the authoritative source for view and cursor (see sync effects
  // after useCalendarEngine below). Extended filter state (dayWindow +
  // schema-driven fields) remains in React state since the engine doesn't model it.
  const [view, _setViewState]         = useState<string>(initialView ?? 'month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [filters, _setFilters]        = useState<Record<string, unknown>>(() => createInitialFilters(schema));
  const [dayWindow, setDayWindow]     = useState<number | null>(null);

  const navigate = useCallback((direction: number) => {
    setCurrentDate(prev => {
      switch (view) {
        case 'week': return addWeeks(prev, direction);
        case 'day':  return addDays(prev, direction);
        default:     return addMonths(prev, direction);
      }
    });
  }, [view]);

  const goToToday    = useCallback(() => setCurrentDate(new Date()), []);
  const setView      = useCallback((v: string) => _setViewState(v), []);
  const replaceFilters = useCallback((newFilters: Record<string, unknown>) => _setFilters(newFilters), []);
  const clearFilters = useCallback(() => _setFilters(createInitialFilters(schema)), [schema]);
  const setFilter    = useCallback((key: string, value: unknown) => _setFilters(f => ({ ...f, [key]: value })), []);
  const toggleFilter = useCallback((key: string, value: unknown) => {
    _setFilters(f => {
      const current = f[key];
      const next = current instanceof Set ? new Set<unknown>(current) : new Set<unknown>();
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...f, [key]: next };
    });
  }, []);
  const clearFilter = useCallback((key: string) => {
    const field = schema.find((fd: FilterField) => fd.key === key);
    _setFilters(f => ({ ...f, [key]: clearFilterValue(field) }));
  }, [schema]);

  const cal = {
    view, setView,
    currentDate, setCurrentDate,
    dayWindow, setDayWindow,
    filters,
    navigate, goToToday,
    replaceFilters, clearFilters, setFilter, toggleFilter, clearFilter,
  };

  // Notify host on view changes (toolbar click, keyboard shortcut, programmatic
  // setView). Skips the initial mount so consumers don't get a synthetic event
  // for the default view. Used by the demo walkthrough to advance steps when
  // the user switches to schedule/map.
  const lastViewRef = useRef<string | null>(null);
  useEffect(() => {
    const next = cal.view;
    if (lastViewRef.current === null) {
      lastViewRef.current = next;
      return;
    }
    if (lastViewRef.current === next) return;
    lastViewRef.current = next;
    onViewChange?.(next as CalendarView);
  }, [cal.view, onViewChange]);

  // Wrap parent employee handlers so edits from ANY surface (timeline add-form
  // or TeamTab settings) flow both to the consumer's state AND to the owner
  // config. Keeps TeamTab and the live schedule in sync. See issue #101.
  const handleEmployeeAddInternal = useCallback((member: LooseValue) => {
    ownerCfg.updateConfig(c => {
      const existing = c['team']?.members ?? [];
      if (existing.some((m: LooseValue) => String(m.id) === String(member.id))) return c;
      return {
        ...c,
        team: { ...(c['team'] ?? {}), members: [...existing, member] },
        setup: { ...(c['setup'] ?? {}), completed: true },
      };
    });
    onEmployeeAdd?.(member);
  }, [ownerCfg.updateConfig, onEmployeeAdd]);

  const handleEmployeeDeleteInternal = useCallback((id: LooseValue) => {
    ownerCfg.updateConfig(c => ({
      ...c,
      team: { ...(c['team'] ?? {}), members: (c['team']?.members ?? []).filter((m: LooseValue) => String(m.id) !== String(id)) },
    }));
    onEmployeeDelete?.(id);
  }, [ownerCfg.updateConfig, onEmployeeDelete]);

  // Honor defaultView from owner config (applied once after config loads).
  // Explicit initialView prop takes precedence — hosts that opt into a
  // specific startup view shouldn't be overridden by DEFAULT_CONFIG's 'month'.
  const defaultViewApplied = useRef(false);
  useEffect(() => {
    if (initialView) return;
    const defaultView = ownerCfg.config?.['display']?.defaultView;
    if (defaultView && !defaultViewApplied.current) {
      defaultViewApplied.current = true;
      cal.setView(defaultView);
    }
  }, [ownerCfg.config?.['display']?.defaultView, initialView]);

  // ── Permissions ──────────────────────────────────────────────────────────
  const perms = usePermissions(role);

  // ── Admin-managed event options (categories) ─────────────────────────────
  const eventOptions = useEventOptions(calendarId);

  // ── Saved views store ────────────────────────────────────────────────────
  const savedViews = useSavedViews(calendarId);

  // ── Setup landing gate ──────────────────────────────────────────────────
  const setupCompleted = !!ownerCfg.config?.['setup']?.completed;
  const {
    setupDismissed,
    shouldShowSetup,
    handleSetupSkip,
    handleReopenSetup,
    handleSetupFinish,
  } = useSetupLanding({
    showSetupLanding,
    setupCompleted,
    updateConfig: ownerCfg.updateConfig,
    closeConfig:  ownerCfg.closeConfig,
    savedViews,
    weekStartDay,
  });

  // ── Active groupBy / sort (controlled by props; overridden when a saved view is applied) ──
  const {
    activeGroupBy,
    setActiveGroupBy,
    activeSort,
    setActiveSort,
    activeShowAllGroups,
    setActiveShowAllGroups,
    sidebarGroupLevels,
    handleSidebarGroupLevelsChange,
  } = useGroupingSort({ groupBy, sort: sort ?? null, showAllGroups: !!showAllGroups });

  // ── FilterGroupSidebar state ──
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarInitialTab, setSidebarInitialTab] = useState<SidebarTab>('focus');

  const handleScopeClick = useCallback(() => {
    setSidebarInitialTab('focus');
    setSidebarOpen(true);
  }, []);

  const handleSidebarFiltersChange = useCallback((filters: Record<string, unknown>) => {
    cal.replaceFilters(filters);
  }, [cal]);

  // ── Cascade scope selections ──
  const { cascadeSelections, handleCascadeSelectionsChange } = useCascadeFilters({
    cascadeConfig,
    calFilters: cal.filters,
    replaceFilters: cal.replaceFilters,
  });

  // Keyboard shortcut: Cmd/Ctrl + / to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Assets view: zoom level + collapse state + location provider ──
  const [activeAssetsZoom, setActiveAssetsZoom] = useState<AssetsZoomLevel>('month');
  const [activeAssetsCollapsed, setActiveAssetsCollapsed] = useState<Set<string>>(
    () => new Set(),
  );

  // ── Base/Region view: multi-base selection ──
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>([]);
  const effectiveLocationProvider = useMemo<LocationProvider>(
    () => locationProvider ?? createManualLocationProvider(),
    [locationProvider],
  );

  // ── Saved views manager (apply / dirty-track / delete / sidebar-save) ───
  const {
    savedViewActiveId,
    savedViewDirty,
    handleApplyView,
    handleClearFilters,
    handleDeleteView,
    handleSidebarSaveView,
  } = useSavedViewsManager({
    cal,
    schema,
    savedViews,
    activeGroupBy,
    setActiveGroupBy,
    activeSort,
    setActiveSort,
    activeShowAllGroups,
    setActiveShowAllGroups,
    activeAssetsZoom,
    setActiveAssetsZoom,
    activeAssetsCollapsed,
    setActiveAssetsCollapsed,
    selectedBaseIds,
    setSelectedBaseIds,
  });

  // ── Visible date range (drives fetch + occurrence expansion) ─────────────
  const range = useMemo(
    () => viewRange(cal.view, cal.currentDate, weekStartDay),
    [cal.view, cal.currentDate, weekStartDay],
  );

  // ── Async fetch ──────────────────────────────────────────────────────────
  const { fetchedEvents, loading: fetchLoading } = useFetchEvents(
    fetchEvents, cal.view, cal.currentDate, weekStartDay,
  );

  // ── Source store (ICS feeds + CSV datasets, persisted per calendarId) ───
  const sourceStore = useSourceStore(calendarId);

  // ── Aggregator: merges prop feeds + stored ICS + stored CSV ─────────────
  const { events: sourceEvents, feedErrors, isFetchingFeeds } = useSourceAggregator({
    icalFeedsProp: icalFeeds,
    sourceStore,
  });

  // ── Supabase Realtime ────────────────────────────────────────────────────
  const [supabaseClient, setSupabaseClient] = useState<LooseValue | null>(null);
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;
    import('@supabase/supabase-js')
      .then(({ createClient }) => setSupabaseClient(createClient(supabaseUrl, supabaseKey)))
      .catch(() => console.warn('[WorksCalendar] @supabase/supabase-js not installed.'));
  }, [supabaseUrl, supabaseKey]);

  const { events: realtimeEvents } = useRealtimeEvents({
    supabaseClient,
    table:  supabaseTable,
    filter: supabaseFilter,
  });

  // ── Merge all sources → normalize ────────────────────────────────────────
  const allNormalized = useMemo(() => {
    // Deduplicate by id across sources (static + fetch + feed + realtime).
    // Events without an id cannot be reliably deduplicated so they are
    // included as-is — using title+start as a fallback key would silently
    // drop events that happen to share the same title and start time.
    const map = new Map();
    const noId: LooseValue[] = [];
    [...rawEvents, ...fetchedEvents, ...sourceEvents, ...realtimeEvents].forEach(ev => {
      if (ev.id != null) map.set(String(ev.id), ev);
      else noId.push(ev);
    });
    return normalizeEvents([...map.values(), ...noId]);
  }, [rawEvents, fetchedEvents, sourceEvents, realtimeEvents]);

  // ── CalendarEngine — single source of truth for mutations & expansions ───
  // announcerRef stays here: it attaches to <ScreenReaderAnnouncer> in JSX
  // and is also used by the keyboard-shortcut undo/redo announcements below.
  const announcerRef = useRef<AnnouncerRef | null>(null);
  const {
    engine,
    undoManager,
    engineVer,
    expandedEvents,
    approvalRequestEvents,
    applyEngineOp,
    applyWithRecurringCheck,
    getSavedEventPayload,
    pendingAlert,
    setPendingAlert,
    recurringPrompt,
  } = useCalendarEngine({
    allNormalized,
    rawPools: rawPools ?? null,
    businessHours: ownerCfg.config?.['businessHours'] ?? businessHours,
    blockedWindows,
    announcerRef,
    range,
    onPoolsChange,
  });

  // ── Sync UI view/cursor into engine ──────────────────────────────────────────
  // Engine is the authoritative source for view and cursor (#3). These effects
  // keep engine.state.view and .cursor in sync with the local navigation state
  // so any engine query or pool operation sees the correct values.
  useEffect(() => {
    engine.dispatch({ type: 'SET_VIEW', view: view as CalendarView });
  }, [engine, view]);

  useEffect(() => {
    engine.dispatch({ type: 'NAVIGATE_TO', date: currentDate });
  }, [engine, currentDate]);

  // ── Base/Region view config ───────────────────────────────────────────────
  const configuredBases   = ownerCfg.config?.['team']?.bases ?? [];
  const configuredRegions = ownerCfg.config?.['team']?.regions ?? [];
  // Profile-aware labels (#424 wk5). Hosts can keep using the legacy
  // `team.locationLabel` / `team.assetsLabel` overrides, but when neither
  // exists we fall back to the profile preset's defaults via
  // `resolveLabels` — so an air-medical config picks "Aircraft" / "Base"
  // automatically without per-key wiring.
  const profileLabels = useMemo(
    () => resolveLabels({
      profile: ownerCfg.config?.['profile'] as string | undefined,
      labels:  ownerCfg.config?.['labels']  as Record<string, string> | undefined,
    }),
    [ownerCfg.config?.['profile'], ownerCfg.config?.['labels']],
  );
  const locationLabel     = ownerCfg.config?.['team']?.locationLabel ?? profileLabels.location;
  const assetsLabel       = ownerCfg.config?.['team']?.assetsLabel   ?? profileLabels.resource;

  // ── Visible-tabs config (Setup/ConfigPanel → Views) ──────────────────────
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

  // Self-heal: if the active tab is no longer enabled, fall back to default/month.
  useEffect(() => {
    if (VIEWS.some(v => v.id === cal.view)) return;
    const fallback = (ownerCfg.config?.['display']?.defaultView as ViewId) ?? 'month';
    const target = VIEWS.some(v => v.id === fallback) ? fallback : 'month';
    if (cal.view !== target) cal.setView(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [VIEWS, cal.view, ownerCfg.config?.['display']?.defaultView]);

  // ── Derive categories / resources / filtered events ──────────────────────
  // Events scoped to the active tab — drives BOTH FilterBar option lists and
  // applyFilters, so they can never drift. See src/core/viewScope.ts.
  const scopedEvents = useTabScopedEvents(cal.view, expandedEvents, {
    employees: configuredEmployees ?? [],
    assets:    effectiveAssets ?? [],
    bases:     configuredBases ?? [],
    selectedBaseIds,
  });

  const categories    = useMemo(() => getCategories(scopedEvents), [scopedEvents]);
  // Categories offered in the generic EventForm — hide schedule-workflow
  // categories (shift/PTO/etc) which are managed through EmployeeActionCard.
  const eventFormCats = useMemo(
    () => categories.filter(c => !SCHEDULE_WORKFLOW_CATEGORIES.has(c) && !SCHEDULE_WORKFLOW_CATEGORIES.has(String(c).toLowerCase())),
    [categories],
  );

  // Resolve asset-request category ids → {id, label} pairs by looking up the
  // host's configured categories. Falls back to using the id as the label so
  // the modal never renders a blank dropdown.
  const resolvedAssetRequestCategories = useMemo(() => {
    if (!Array.isArray(assetRequestCategories) || assetRequestCategories.length === 0) return [];
    const cfg = categoriesConfig ?? ownerCfg.config?.['categoriesConfig'];
    const defs = (Array.isArray(cfg?.categories) ? cfg.categories : []) as Array<{
      id: string
      label?: string
      color?: string
    }>;
    const byId = new Map(defs.map(d => [d.id, d]));
    return assetRequestCategories.map(id => {
      const def = byId.get(id);
      return { id, label: def?.label ?? id, color: def?.color };
    });
  }, [assetRequestCategories, categoriesConfig, ownerCfg.config?.['categoriesConfig']]);

  const canRequestAsset =
    resolvedAssetRequestCategories.length > 0 &&
    Array.isArray(effectiveAssets) &&
    effectiveAssets.length > 0;
  const resources     = useMemo(() => getResources(scopedEvents),  [scopedEvents]);
  const filteredEvents = useMemo(
    () => applyFilters(scopedEvents, cal.filters, schema),
    [scopedEvents, cal.filters, schema],
  );
  const filterBarSchema = useMemo(
    () => viewScopedSchema(schema, cal.view),
    [schema, cal.view],
  );
  const visibleEvents = useMemo(
    () => (activeSort && activeSort.length > 0
      ? sortEvents(filteredEvents, activeSort)
      : filteredEvents),
    [filteredEvents, activeSort],
  );

  // Set of employee ids whose shift / on-call event covers "right now".
  // Drives the AppShell RightPanel's CrewOnShiftList narrowing — only people
  // currently scheduled to work appear there, not the entire roster.
  // Recomputed when visibleEvents change; intentionally not refreshed on a
  // wall-clock interval (a shift transition is rare enough that requiring
  // a re-render to pick it up is acceptable; see useShiftOverlap.ts).
  const onShiftIds = useMemo(() => shiftEmployeeIdsAt(visibleEvents), [visibleEvents]);

  // ── Mutation pipeline ────────────────────────────────────────────────────
  // applyEngineOp, applyWithRecurringCheck, getSavedEventPayload, pendingAlert,
  // and recurringPrompt are all owned by useCalendarEngine above.

  // ── Local UI state ───────────────────────────────────────────────────────
  const {
    selectedEvent, setSelectedEvent,
    formEvent, setFormEvent,
    conflictingEventIds, handleLiveConflicts,
    assetRequestOpen, setAssetRequestOpen,
    importOpen, setImportOpen,
    importMsg, setImportMsg,
    importFlash,
    scheduleOpen, setScheduleOpen,
    availabilityState, setAvailabilityState,
    scheduleEditorState, setScheduleEditorState,
    pillHoverTitle, setPillHoverTitle,
    editMode, setEditMode,
    helpOpen, setHelpOpen,
    inlineEditTarget, setInlineEditTarget,
    lastClickCoordsRef,
    editModeRef,
  } = useModalState();

  // ── Schedule templates ───────────────────────────────────────────────────
  const {
    templateError,
    visibleScheduleTemplates,
    mergedScheduleTemplates,
    buildSchedulePreview,
    handleScheduleInstantiate,
    handleCreateScheduleTemplate,
    handleDeleteScheduleTemplate,
  } = useScheduleTemplates({
    scheduleTemplates,
    scheduleInstantiationLimits,
    scheduleTemplateAdapter,
    onScheduleTemplateAnalytics,
    role,
    isOwner: ownerCfg.isOwner,
    engine: engine as unknown as { state: { events: Map<string, LooseValue> } },
    ownerBusinessHours: ownerCfg.config?.['businessHours'],
    businessHours,
    blockedWindows,
    applyEngineOp,
    getSavedEventPayload,
    onEventSave,
    onInstantiateSuccess: () => setScheduleOpen(false),
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKeyDown = (e: LooseValue) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      // Undo: Ctrl+Z / Cmd+Z
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const did = undoManager.undo();
        if (did) announcerRef.current?.announce('Undo.');
        return;
      }
      // Redo: Ctrl+Y / Cmd+Y  or  Ctrl+Shift+Z / Cmd+Shift+Z
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        const did = undoManager.redo();
        if (did) announcerRef.current?.announce('Redo.');
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoManager]);

  // ── CalendarApi / imperative handle ─────────────────────────────────────
  const api = useMemo(() => ({
    navigateTo:       (date: LooseValue) => cal.setCurrentDate(date),
    setView:          (view: LooseValue) => cal.setView(view),
    goToToday:        ()     => cal.goToToday(),
    openEvent:        (id: LooseValue)   => {
      const ev = expandedEvents.find((e: LooseValue) => e.id === id);
      if (ev) setSelectedEvent(ev);
    },
    getVisibleEvents: ()     => visibleEvents,
    clearFilters:     ()     => cal.clearFilters(),
    addEvent:         (d={}) => setFormEvent(d),
    undo:             ()     => undoManager.undo(),
    redo:             ()     => undoManager.redo(),
    get canUndo()            { return undoManager.canUndo; },
    get canRedo()            { return undoManager.canRedo; },
  }), [cal, expandedEvents, visibleEvents, undoManager]);

  useImperativeHandle(ref, () => api, [api]);

  // ── Event mutations ──────────────────────────────────────────────────────
  const {
    emitEventSave,
    checkEventConflicts,
    handleEventSave,
    handleEventMove,
    handleEventResize,
    handleEventGroupChange,
    handleEventDelete,
    handleInlineSave,
    handleInlineDelete,
  } = useEventMutations({
    applyEngineOp,
    applyWithRecurringCheck,
    getSavedEventPayload,
    engine,
    engineVer,
    expandedEvents,
    onEventSave,
    onEventMove,
    onEventResize,
    onEventDelete,
    onEventGroupChange,
    ownerConfig: ownerCfg.config,
    inlineEditTarget,
    setFormEvent,
    setInlineEditTarget,
  });

  // ── Callbacks ────────────────────────────────────────────────────────────
  const handleEventClick = useCallback((ev: LooseValue) => {
    if (editModeRef.current) {
      setSelectedEvent(null);
      setInlineEditTarget({
        event: ev,
        x: lastClickCoordsRef.current.x,
        y: lastClickCoordsRef.current.y,
      });
      return;
    }
    setSelectedEvent(ev);
    onEventClickProp?.(ev);
  }, [onEventClickProp]);

  // ── Schedule mutations ───────────────────────────────────────────────────
  const {
    handleShiftStatusChange,
    handleCoverageAssign,
    handleEmployeeAction,
    handleAvailabilitySave,
    handleScheduleEditorSave,
  } = useScheduleMutations({
    applyEngineOp,
    emitEventSave,
    getSavedEventPayload,
    expandedEvents,
    configuredEmployees,
    onEventDelete,
    onAvailabilitySave,
    onScheduleSave,
    onEmployeeAction: onEmployeeAction as LooseValue,
    ownerConfig: ownerCfg.config,
    setAvailabilityState,
    setScheduleEditorState,
  });



  const handleImport = useCallback((imported: LooseValue, meta: LooseValue) => {
    onImport?.(imported);
    // Persist as a toggleable CSV source so events survive across sessions
    sourceStore.addSource({
      type:       'csv',
      label:      meta?.label ?? 'CSV Import',
      color:      '#8b5cf6',
      events:     imported,
      importedAt: new Date().toISOString(),
    });
    setImportOpen(false);
    const count = Array.isArray(imported) ? imported.length : 0;
    setImportMsg(`Imported ${count} event${count === 1 ? '' : 's'}`);
    importFlash.trigger();
  }, [onImport, sourceStore, importFlash]);

  const handleEditFromHoverCard = useCallback((ev: LooseValue) => {
    setSelectedEvent(null);
    let formEv = ev._raw ?? ev;
    // Recurring occurrences carry rrule:null — look up the series master so the
    // EventForm shows the correct repeat cadence and preserves it on save.
    if (ev._recurring && ev._eventId) {
      const master = engine.state.events.get(ev._eventId);
      if (master?.rrule) {
        formEv = { ...formEv, rrule: master.rrule };
      }
    }
    setFormEvent(formEv);
  }, [engine]);

  // ── Context value ────────────────────────────────────────────────────────
  const ctxValue = useMemo((): CalendarContextValue => ({
    renderEvent:     renderEvent     as CalendarContextValue['renderEvent'],
    renderHoverCard: renderHoverCard as CalendarContextValue['renderHoverCard'],
    colorRules, businessHours, emptyState,
    permissions: perms,
    editMode,
    conflictingEventIds,
  }), [renderEvent, renderHoverCard, colorRules, businessHours, emptyState, perms, editMode, conflictingEventIds]);

  // ── Toolbar date label ───────────────────────────────────────────────────
  function getDateLabel() {
    const d = cal.currentDate;
    switch (cal.view) {
      case 'day':
        return format(d, 'EEEE, MMMM d, yyyy');
      case 'week': {
        const ws = startOfWeek(d, { weekStartsOn: weekStartDay });
        const we = endOfWeek(d,   { weekStartsOn: weekStartDay });
        const sameMo = ws.getMonth() === we.getMonth();
        const sameYr = ws.getFullYear() === we.getFullYear();
        if (sameMo)  return `${format(ws, 'MMM d')} – ${format(we, 'd, yyyy')}`;
        if (sameYr)  return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
        return `${format(ws, 'MMM d, yyyy')} – ${format(we, 'MMM d, yyyy')}`;
      }
      default:
        return format(d, 'MMMM yyyy');
    }
  }

  const swipeAreaRef = useRef<HTMLDivElement | null>(null);
  const swipeNavigationEnabled = cal.view === 'month' || cal.view === 'schedule';
  useTouchSwipe({
    targetRef: swipeAreaRef,
    enabled: swipeNavigationEnabled,
    onSwipeLeft: () => cal.navigate(1),
    onSwipeRight: () => cal.navigate(-1),
  });

  useKeyboardShortcuts({
    setView: cal.setView,
    navigate: cal.navigate,
    goToToday: cal.goToToday,
    openHelp: () => setHelpOpen(true),
  });

  const hasAddButton = (showAddButton || ownerCfg.isOwner || devMode) && perms.canAddEvent;
  const hasScheduleTemplates = Array.isArray(visibleScheduleTemplates) && visibleScheduleTemplates.length > 0;
  const hasImport    = !!(onImport || ownerCfg.isOwner);
  const isEmpty      = visibleEvents.length === 0;

  // Date-select (drag-to-create or day click) → open form seeded with the range
  const handleDateSelect = useCallback((start: LooseValue, end: LooseValue) => {
    if (!hasAddButton) return;
    onDateSelect?.(start, end);
    setFormEvent({ start, end });
  }, [hasAddButton, onDateSelect]);

  // Schedule cell select → route to schedule-specific editor, not generic EventForm.
  // When the dropped cell isn't a known employee (no resource match), fall back
  // to the generic EventForm so the user still has a way to create an event.
  const handleScheduleDateSelect = useCallback((start: LooseValue, end: LooseValue, resourceId: LooseValue) => {
    if (!hasAddButton) return;
    onDateSelect?.(start, end, resourceId);

    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);

    const emp = configuredEmployees.find((e: LooseValue) => String(e.id) === String(resourceId));
    if (!emp) {
      setFormEvent({ start: startDate, end: endDate, resource: resourceId });
      return;
    }

    setScheduleEditorState({ emp, start: startDate, end: endDate });
  }, [configuredEmployees, hasAddButton, onDateSelect]);

  // Pool cell select (AssetsView pool row, #212). The EventForm spreads
  // the initial formEvent into its submit payload, so seeding
  // resourcePoolId here is enough to get the engine to resolve it on
  // save — the generic form doesn't need a pool-picker field.
  const handlePoolDateSelect = useCallback((start: LooseValue, end: LooseValue, poolId: LooseValue) => {
    if (!hasAddButton) return;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate   = end   instanceof Date ? end   : new Date(end);
    setFormEvent({ start: startDate, end: endDate, resourcePoolId: poolId });
  }, [hasAddButton]);

  const sharedViewProps = {
    currentDate:   cal.currentDate,
    events:        visibleEvents,
    onEventClick:  handleEventClick,
    onEventMove:   handleEventMove,
    onEventResize: handleEventResize,
    onEventGroupChange: handleEventGroupChange,
    onDateSelect:  handleDateSelect,
    config:        ownerCfg.config,
    weekStartDay,
    pillHoverTitle,
    groupBy:       activeGroupBy,
    sort:          activeSort,
    showAllGroups: activeShowAllGroups,
  };

  const savedViewCaptureCtx = {
    groupBy:         activeGroupBy,
    sort:            activeSort,
    showAllGroups:   activeShowAllGroups,
    zoomLevel:       activeAssetsZoom,
    collapsedGroups: activeAssetsCollapsed,
    selectedBaseIds,
  };

  if (shouldShowSetup) {
    return (
      <CalendarErrorBoundary>
        <div
          className={styles['root']}
          data-wc-theme={effectiveTheme}
          data-wc-theme-family={themeFamily}
          data-wc-theme-mode={themeMode}
          data-testid="works-calendar-setup"
          style={rootStyle}
        >
          <SetupLanding
            onSkip={handleSetupSkip}
            onFinish={handleSetupFinish}
            initialName={ownerCfg.config?.['title']}
            initialTheme={ownerCfg.config?.['setup']?.preferredTheme ?? rawTheme}
            initialAssetTypes={ownerCfg.config?.['assetTypes']}
            initialRequirementTemplates={ownerCfg.config?.['requirementTemplates']}
          />
        </div>
      </CalendarErrorBoundary>
    );
  }

  return (
    <CalendarErrorBoundary>
      <CalendarContext.Provider value={ctxValue}>
        <div className={styles['root']} data-wc-theme={effectiveTheme} data-wc-theme-family={themeFamily} data-wc-theme-mode={themeMode} data-testid="works-calendar" data-wc-edit-mode={editMode ? '' : undefined} style={rootStyle}>

        <div className={styles['transientToast']} aria-hidden={!importFlash.flash}>
          <SavedFlash visible={importFlash.flash} label={importMsg} />
        </div>

        <AppShell
          leftRail={
            <LeftRail
              actions={[
                {
                  id: 'saved-views',
                  label: 'Saved views',
                  hint: 'Manage your view library',
                  icon: <Bookmark size={18} aria-hidden="true" />,
                  onClick: () => { setSidebarInitialTab('saved'); setSidebarOpen(true); },
                },
                {
                  id: 'focus',
                  label: 'Focus filters',
                  hint: 'Narrow the calendar by region, base, role, or category',
                  icon: <Filter size={18} aria-hidden="true" />,
                  onClick: () => { setSidebarInitialTab('focus'); setSidebarOpen(true); },
                },
                // Map is rendered as a floating MapPeekWidget at chrome
                // level (peek → panel → fullscreen) rather than as a
                // workspace-replacing view tab.
                ...(ownerCfg.isOwner ? [{
                  id: 'settings',
                  label: 'Settings',
                  hint: 'Calendar configuration',
                  icon: <Settings size={18} aria-hidden="true" />,
                  onClick: () => ownerCfg.setConfigOpen(true),
                }] : []),
                // Embedder-supplied actions (optional). Appended last so
                // the built-in actions keep stable positions across
                // consumer apps. Filter out any id collisions defensively.
                ...(leftRailExtras ?? []).filter(extra =>
                  !['saved-views', 'focus', 'settings'].includes(extra.id),
                ),
              ]}
            />
          }
          rightPanel={
            <RightPanel>
              {/* Region map is the inline preview; clicking it pops a
                  70vw modal that mounts the real MapLibre basemap.
                  Sitting above Crew so the spatial reference is always
                  the first thing the operator sees in the rail. */}
              {showMapWidget && (
                <RightPanelSection title="Region map">
                  <MapPeekWidget
                  events={(expandedEvents as any[]).filter(ev => !isScheduleWorkflowEvent(ev)) as never}
                  onEventClick={handleEventClick as never}
                  {...(onMapWidgetOpenChange ? { onOpenChange: onMapWidgetOpenChange } : {})}
                  {...(mapStyle ? { mapStyle } : {})}
                  />
                </RightPanelSection>
              )}
              <RightPanelSection title="Crew on shift">
                <CrewOnShiftList employees={configuredEmployees} onShiftIds={onShiftIds} />
              </RightPanelSection>
              {/* Embedder-supplied sections (optional). Appended after the
                  built-ins so the stock content keeps stable position. */}
              {rightPanelExtras}
            </RightPanel>
          }
          header={<>
        {/* ── Toolbar ── */}
        {renderToolbar ? (
          <div className={styles['customToolbar']}>{renderToolbar(api)}</div>
        ) : (
          <AppHeader
            leftSlot={
              <div className={styles['navGroup']}>
                {logoSrc && (
                  <img
                    src={logoSrc}
                    alt={logoAlt ?? ''}
                    className={styles['logo']}
                    aria-hidden={!logoAlt ? 'true' : undefined}
                  />
                )}
                <button
                  className={styles['navBtn']}
                  onClick={() => cal.navigate(-1)}
                  aria-label="Previous"
                  title={`Previous ${cal.view}`}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button className={styles['todayBtn']} onClick={cal.goToToday}>Today</button>
                <button
                  className={styles['navBtn']}
                  onClick={() => cal.navigate(1)}
                  aria-label="Next"
                  title={`Next ${cal.view}`}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <span className={styles['dateLabel']} aria-live="polite" aria-atomic="true">{getDateLabel()}</span>
                <span className={styles['calendarTitle']}>{calendarTitle}</span>
                {fetchLoading && <span className={styles['loadingDot']} title="Loading…" aria-label="Loading events" role="status" />}
              </div>
            }
            centerSlot={
              // Views are grouped Calendar | Operations (#424 wk6) so a
              // new user sees scheduling tabs separately from the
              // operational boards (Assets / Dispatch / Requests / Map).
              // Both groups share the same buttonGroup styling; the
              // separator is purely visual.
              (() => {
                const calendarViews   = VIEWS.filter(v => v.group === 'calendar');
                const operationsViews = VIEWS.filter(v => v.group === 'operations');
                const renderBtn = (v: ViewDef) => (
                  <button
                    key={v.id}
                    className={[styles['viewBtn'], cal.view === v.id && styles['activeView']].filter(Boolean).join(' ')}
                    onClick={() => cal.setView(v.id)}
                    aria-pressed={cal.view === v.id}
                    title={v.hint}
                    data-wc-view-button={v.id}
                  >
                    {v.label}
                  </button>
                );
                return (
                  <div className={styles['viewGroup']} role="group" aria-label="Calendar view">
                    {calendarViews.map(renderBtn)}
                    {operationsViews.length > 0 && (
                      <span
                        className={styles['viewGroupDivider']}
                        aria-hidden="true"
                        role="presentation"
                      />
                    )}
                    {operationsViews.map(renderBtn)}
                  </div>
                );
              })()
            }
            rightSlot={
              <div className={styles['actions']}>
                {devMode && <span className={styles['devBadge']}>Dev</span>}
                {(ownerCfg.isOwner || devMode) && (
                  <button
                    className={[styles['wandBtn'], editMode && styles['wandBtnActive']].filter(Boolean).join(' ')}
                    onClick={() => { setEditMode(v => !v); setInlineEditTarget(null); }}
                    aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode — click events to customize them'}
                    title={editMode ? 'Exit edit mode' : 'Customize events'}
                  >
                    <Sparkles size={15} aria-hidden="true" />
                    {editMode && <span className={styles['wandBtnLabel']}>Done</span>}
                  </button>
                )}
                {ownerPassword && (
                  <OwnerLock
                    isOwner={ownerCfg.isOwner}
                    authError={ownerCfg.authError}
                    isAuthLoading={ownerCfg.isAuthLoading}
                    onAuthenticate={ownerCfg.authenticate}
                    onOpen={() => ownerCfg.setConfigOpen(true)}
                  />
                )}
              </div>
            }
            menuItems={[
              ...(ownerCfg.isOwner ? [
                { label: 'Settings',          sub: 'Calendar config, integrations', onClick: () => ownerCfg.setConfigOpen(true) },
                { label: 'Themes',            sub: 'Switch palette / appearance',   onClick: () => ownerCfg.openConfigToTab('theme') },
                { label: 'Advanced settings', sub: 'Smart views, fields, approvals', onClick: () => ownerCfg.openConfigToTab('smartViews') },
              ] : []),
              { label: 'Saved views',         sub: 'Manage your view library',      onClick: () => { setSidebarInitialTab('saved'); setSidebarOpen(true); } },
              { label: 'Keyboard shortcuts',  sub: 'Quick reference',               onClick: () => setHelpOpen(true) },
              { label: 'Help & feedback',                                          onClick: () => window.open('https://github.com/WorksCalendar/CalendarThatWorks/issues', '_blank', 'noopener') },
            ]}
          />
        )}

        {/* ── Profile / Saved-views Bar ── */}
        {renderSavedViewsBar
          ? renderSavedViewsBar({
              views:       savedViews.views,
              activeId:    savedViewActiveId,
              isDirty:     savedViewDirty,
              applyView:   handleApplyView,
              saveView:    (name: LooseValue, opts: LooseValue) => savedViews.saveView(name, cal.filters, { view: cal.view, ...captureSavedViewFields(cal.view, savedViewCaptureCtx), ...opts }),
              updateView:  savedViews.updateView,
              resaveView:  (id: LooseValue) => savedViews.resaveView(id, cal.filters, cal.view, activeGroupBy, captureSavedViewFields(cal.view, savedViewCaptureCtx)),
              deleteView:  handleDeleteView,
              toggleStripVisibility: savedViews.toggleStripVisibility,
              clearFilters: cal.clearFilters,
              hasActiveFilters: hasActiveFilters(cal.filters, schema),
              currentFilters: cal.filters,
              currentView:    cal.view,
              schema,
              buildFilterSummary: (filters: LooseValue) => buildFilterSummary(filters, schema),
            })
          : (() => {
            // Build the merged "tail" for compact ProfileBar: focus chips +
            // scope text live inline on the same row as saved-view chips.
            // ContextSummary's View/Focus segments are dropped — the sidebar
            // already surfaces grouping and the chips themselves show focus.
            const resolvedFocusChips: FocusChipDef[] | null = focusChips
              ? (Array.isArray(focusChips) ? focusChips : DEFAULT_FOCUS_CHIPS)
              : null;
            const activeCategories = cal.filters?.['categories'] as Set<string> | undefined;
            const tailSlot = resolvedFocusChips ? (
              <>
                <FocusChips
                  chips={resolvedFocusChips}
                  activeCategories={activeCategories}
                  onCategoriesChange={(next) => cal.setFilter('categories', next)}
                />
                <button
                  type="button"
                  className={styles['scopePill']}
                  onClick={handleScopeClick}
                  title="Change scope"
                >
                  <span>All regions</span>
                  <span className={styles['scopePillChevron']} aria-hidden="true">›</span>
                </button>
              </>
            ) : null;
            return (
              <ProfileBar
                compact
                views={savedViews.views}
                activeId={savedViewActiveId}
                isDirty={savedViewDirty}
                schema={schema}
                currentView={cal.view}
                viewOrder={ALL_VIEWS.map(v => v.id)}
                enabledViews={VIEWS.map(v => v.id)}
                locationLabel={locationLabel}
                assetsLabel={assetsLabel}
                hasActiveFilters={hasActiveFilters(cal.filters, schema)}
                tailSlot={tailSlot}
                onApply={handleApplyView}
                onAdd={({ name, color }: { name: LooseValue; color: LooseValue }) =>
                  savedViews.saveView(name, cal.filters, { color, view: cal.view, ...captureSavedViewFields(cal.view, savedViewCaptureCtx) })
                }
                onResave={(id: LooseValue) => savedViews.resaveView(id, cal.filters, cal.view, activeGroupBy, captureSavedViewFields(cal.view, savedViewCaptureCtx))}
                onUpdate={savedViews.updateView}
                onDelete={handleDeleteView}
                onToggleVisibility={savedViews.toggleStripVisibility}
                onClearFilters={handleClearFilters}
                onEditConditions={ownerCfg.isOwner ? (id: LooseValue) => ownerCfg.openConfigToTab('smartViews', { smartViewEditId: id }) : undefined}
              />
            );
          })()
        }

        {/* ── Filter Bar (legacy, kept for renderFilterBar override) ── */}
        {renderFilterBar && renderFilterBar({
          schema:        filterBarSchema,
          filters:       cal.filters,
          setFilter:     cal.setFilter,
          toggleFilter:  cal.toggleFilter,
          clearFilter:   cal.clearFilter,
          clearAllFilters: cal.clearFilters,
          activePills:   buildActiveFilterPills(cal.filters, filterBarSchema),
          items:         scopedEvents,
        })}
          </>}
          main={
        <div className={styles['mainPane']}>
          <div className={styles['calendarCard']}>
            <SubToolbar
              leftSlot={<>
                <SidebarToggleButton
                  isOpen={sidebarOpen}
                  onClick={() => setSidebarOpen(v => !v)}
                  filterCount={hasActiveFilters(cal.filters, schema) ? 1 : 0}
                  groupCount={sidebarGroupLevels.length}
                />
                {hasAddButton && cal.view !== 'schedule' && (
                  <button
                    className={styles['addBtn']}
                    onClick={() => setFormEvent({})}
                    aria-label={`Add new ${profileLabels.event.toLowerCase()}`}
                    title={profileLabels.event === 'Event' ? undefined : `Create a new ${profileLabels.event.toLowerCase()}`}
                  >
                    <Plus size={14} aria-hidden="true" />
                    <span className={styles['addBtnLabel']}> New {profileLabels.event}</span>
                  </button>
                )}
                {hasAddButton && hasScheduleTemplates && (
                  <button
                    className={styles['addBtn']}
                    onClick={() => {
                      setScheduleOpen(true);
                      onScheduleTemplateAnalytics?.({
                        event: 'schedule_dialog_opened',
                        at: new Date().toISOString(),
                        templateCount: visibleScheduleTemplates.length,
                      });
                    }}
                    aria-label="Add schedule from template"
                  >
                    <Plus size={14} aria-hidden="true" /><span className={styles['addBtnLabel']}> Add Schedule</span>
                  </button>
                )}
              </>}
              centerSlot={
                /* Day-window pills only have meaning on the Gantt-style
                 * timeline views — the other views (Month / Week / Day /
                 * Agenda) have intrinsic spans and ignore cal.dayWindow.
                 * Hiding the pills there avoids the "pressing this button
                 * does nothing" UX trap. */
                (cal.view === 'schedule' || cal.view === 'base' || cal.view === 'assets')
                  ? <DayWindowPills value={cal.dayWindow} onChange={cal.setDayWindow} />
                  : null
              }
              rightSlot={<>
                {hasImport && (
                  <button className={styles['exportBtn']} onClick={() => setImportOpen(true)} aria-label="Import .ics calendar">
                    <Upload size={15} aria-hidden="true" />
                  </button>
                )}
                <button className={styles['exportBtn']} onClick={() => exportVisibleEvents(visibleEvents)} aria-label="Export to Excel">
                  <Download size={15} aria-hidden="true" />
                </button>
              </>}
            />
            <ActiveFilterStrip
              filters={cal.filters as Record<string, unknown>}
              schema={schema}
              onChange={(key, value) => cal.setFilter(key, value)}
              onClear={(key) => cal.clearFilter(key)}
              onClearAll={handleClearFilters}
            />
        {/* ── View area ── */}
        <div
          ref={swipeAreaRef}
          className={styles['viewArea']}
          onClickCapture={editMode ? (e) => {
            lastClickCoordsRef.current = { x: e.clientX, y: e.clientY };
          } : undefined}
        >
          {isEmpty && emptyState ? (
            <div className={styles['emptyStateWrap']}>{emptyState}</div>
          ) : (
            <>
              {cal.view === 'month'    && <MonthView    {...sharedViewProps} />}
              {cal.view === 'week'     && <WeekView     {...sharedViewProps} />}
              {cal.view === 'day'      && <DayView      {...sharedViewProps} />}
              {cal.view === 'agenda'   && <AgendaView   currentDate={cal.currentDate} events={visibleEvents} onEventClick={handleEventClick} onEventGroupChange={handleEventGroupChange} groupBy={activeGroupBy} sort={activeSort} showAllGroups={activeShowAllGroups} employees={configuredEmployees} />}
              {cal.view === 'schedule' && (
                <ScheduleView
                  currentDate={cal.currentDate}
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                  onEventGroupChange={handleEventGroupChange}
                  onDateSelect={handleScheduleDateSelect}
                  employees={configuredEmployees}
                  onEmployeeAdd={perms.canManagePeople ? handleEmployeeAddInternal : undefined}
                  onEmployeeDelete={perms.canManagePeople ? handleEmployeeDeleteInternal : undefined}
                  onShiftStatusChange={handleShiftStatusChange}
                  onCoverageAssign={handleCoverageAssign}
                  onEmployeeAction={handleEmployeeAction}
                  groupBy={activeGroupBy}
                  sort={activeSort}
                  roles={ownerCfg.config?.['team']?.roles ?? []}
                  bases={ownerCfg.config?.['team']?.bases ?? []}
                  dayWindow={cal.dayWindow}
                />
              )}
              {cal.view === 'base' && (
                <BaseGanttView
                  currentDate={cal.currentDate}
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                  employees={configuredEmployees}
                  assets={effectiveAssets ?? []}
                  bases={configuredBases}
                  regions={configuredRegions}
                  locationLabel={locationLabel}
                  assetsLabel={assetsLabel}
                  selectedBaseIds={selectedBaseIds}
                  onBaseSelectionChange={setSelectedBaseIds}
                  dayWindow={cal.dayWindow}
                />
              )}
              {cal.view === 'assets'   && (
                <AssetsView
                  currentDate={cal.currentDate}
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                  onDateSelect={handleScheduleDateSelect}
                  onPoolDateSelect={handlePoolDateSelect}
                  groupBy={activeGroupBy}
                  onGroupByChange={setActiveGroupBy}
                  categoriesConfig={categoriesConfig ?? ownerCfg.config?.['categoriesConfig']}
                  assets={effectiveAssets}
                  pools={rawPools ?? []}
                  strictAssetFiltering={strictAssetFiltering}
                  resolveResourceLabel={resolveResourceLabel}
                  zoomLevel={activeAssetsZoom}
                  onZoomChange={setActiveAssetsZoom}
                  collapsedGroups={activeAssetsCollapsed}
                  onCollapsedGroupsChange={setActiveAssetsCollapsed}
                  locationProvider={effectiveLocationProvider}
                  renderAssetLocation={renderAssetLocation}
                  renderPoolLocation={renderPoolLocation}
                  renderAssetBadges={renderAssetBadges}
                  onEditAssets={ownerCfg.isOwner ? () => ownerCfg.openConfigToTab('assets') : undefined}
                  onRequestAsset={canRequestAsset ? () => setAssetRequestOpen(true) : undefined}
                  approvalsConfig={ownerCfg.config?.['approvals']}
                  onApprovalAction={onApprovalAction as ((event: LooseValue, action: string) => void | Promise<void>) | undefined}
                  label={assetsLabel}
                  dayWindow={cal.dayWindow}
                />
              )}
              {cal.view === 'dispatch' && (
                <DispatchView
                  events={expandedEvents}
                  employees={configuredEmployees}
                  assets={effectiveAssets ?? []}
                  bases={configuredBases}
                  locationLabel={locationLabel}
                  label={assetsLabel}
                  onEventClick={handleEventClick}
                  missions={dispatchMissions}
                  evaluateForMission={dispatchEvaluator}
                  onAssign={onDispatchAssign}
                  // Sync the calendar's currentDate with the dispatcher's chosen
                  // as-of moment so recurring-event expansion + fetch ranges
                  // re-anchor around it. Without this, a far-future as-of would
                  // see no overlapping events (since they were never expanded
                  // for the original currentDate range) and the row would be
                  // wrongly classified Available.
                  onAsOfChange={cal.setCurrentDate}
                />
              )}
              {cal.view === 'requests' && (
                <RequestQueueView
                  // Approval queue must be window-independent — see
                  // `approvalRequestEvents` above for why we use the
                  // engine's master records instead of expandedEvents.
                  events={approvalRequestEvents as never}
                  approvalsConfig={ownerCfg.config?.['approvals'] as Record<string, unknown> | undefined}
                  onApprovalAction={onApprovalAction as ((event: LooseValue, action: string) => void | Promise<void>) | undefined}
                  onEventClick={handleEventClick}
                />
              )}
              {/* Map lives in the right rail (see `rightPanel` above)
                  rather than as a workspace overlay — it shouldn't sit
                  on top of the active view's content. */}
            </>
          )}
        </div>
          </div>
        </div>
          }
        />

        {/* ── Filter / Groups / Views overlay drawer ── */}
        <FilterGroupSidebar
          open={sidebarOpen}
          initialTab={sidebarInitialTab}
          onClose={() => setSidebarOpen(false)}
          // Groups tab
          groupLevels={sidebarGroupLevels}
          onGroupLevelsChange={handleSidebarGroupLevelsChange}
          sort={activeSort ?? []}
          onSortChange={(next) => setActiveSort(next.length > 0 ? next : null)}
          showAllGroups={activeShowAllGroups}
          onShowAllGroupsChange={setActiveShowAllGroups}
          // Focus tab
          {...(cascadeConfig ? { cascadeConfig } : {})}
          cascadeSelections={cascadeSelections}
          onCascadeSelectionsChange={handleCascadeSelectionsChange}
          schema={filterBarSchema}
          items={scopedEvents}
          onFiltersChange={handleSidebarFiltersChange}
          // Views tab
          views={savedViews.views}
          activeViewId={savedViewActiveId}
          isViewDirty={savedViewDirty}
          onApplyView={handleApplyView}
          onSaveView={handleSidebarSaveView}
          onResaveView={(id) => savedViews.resaveView(id, cal.filters, cal.view, activeGroupBy, captureSavedViewFields(cal.view, savedViewCaptureCtx))}
          onUpdateView={savedViews.updateView}
          onDeleteView={handleDeleteView}
          onToggleViewVisibility={savedViews.toggleStripVisibility}
          locationLabel={locationLabel}
          assetsLabel={assetsLabel}
        />

        <CalendarModals
          selectedEvent={selectedEvent}
          setSelectedEvent={setSelectedEvent}
          renderHoverCard={renderHoverCard}
          ownerConfig={ownerCfg.config}
          notes={notes}
          onNoteSave={onNoteSave}
          onNoteDelete={onNoteDelete}
          canEditEvent={perms.canEditEvent}
          handleEditFromHoverCard={handleEditFromHoverCard}
          resolveResourceLabel={resolveResourceLabel}
          formEvent={formEvent}
          setFormEvent={setFormEvent}
          canAddEvent={perms.canAddEvent}
          eventFormCats={eventFormCats}
          eventOptions={eventOptions}
          handleEventSave={handleEventSave}
          handleEventDelete={handleEventDelete}
          onEventDelete={onEventDelete}
          canDeleteEvent={perms.canDeleteEvent}
          permissions={perms}
          canManageOptions={perms.canManageOptions}
          maintenanceRules={maintenanceRules}
          checkEventConflicts={checkEventConflicts}
          handleLiveConflicts={handleLiveConflicts}
          resolvedAssetRequestCategories={resolvedAssetRequestCategories}
          rawPools={rawPools ?? []}
          hideEventTemplates={hideEventTemplates}
          eventResourceSuggestions={eventResourceSuggestions}
          assetRequestOpen={assetRequestOpen}
          setAssetRequestOpen={setAssetRequestOpen}
          canRequestAsset={canRequestAsset}
          effectiveAssets={effectiveAssets}
          currentDate={cal.currentDate}
          requirementTemplates={ownerCfg.config?.['requirementTemplates'] as LooseValue}
          availabilityState={availabilityState}
          setAvailabilityState={setAvailabilityState}
          handleAvailabilitySave={handleAvailabilitySave}
          scheduleEditorState={scheduleEditorState}
          setScheduleEditorState={setScheduleEditorState}
          onCallCategory={ownerCfg.config?.['onCallCategory'] ?? 'on-call'}
          handleScheduleEditorSave={handleScheduleEditorSave}
          importOpen={importOpen}
          setImportOpen={setImportOpen}
          handleImport={handleImport}
          scheduleOpen={scheduleOpen}
          setScheduleOpen={setScheduleOpen}
          visibleScheduleTemplates={visibleScheduleTemplates}
          buildSchedulePreview={buildSchedulePreview}
          handleScheduleInstantiate={handleScheduleInstantiate}
          recurringPrompt={recurringPrompt}
          pendingAlert={pendingAlert}
          setPendingAlert={setPendingAlert}
          configOpen={ownerCfg.configOpen}
          calendarId={calendarId}
          categories={categories}
          resources={resources}
          schema={schema}
          expandedEvents={expandedEvents}
          configInitialTab={ownerCfg.configInitialTab ?? undefined}
          smartViewEditId={ownerCfg.smartViewEditId ?? undefined}
          updateConfig={ownerCfg.updateConfig}
          closeConfig={ownerCfg.closeConfig}
          showSetupLanding={!!showSetupLanding}
          handleReopenSetup={handleReopenSetup}
          savedViews={savedViews}
          handleDeleteView={handleDeleteView}
          isOwner={ownerCfg.isOwner}
          openConfigToTab={ownerCfg.openConfigToTab}
          sourceStore={sourceStore}
          feedErrors={feedErrors}
          isFetchingFeeds={isFetchingFeeds}
          mergedScheduleTemplates={mergedScheduleTemplates}
          handleCreateScheduleTemplate={handleCreateScheduleTemplate}
          handleDeleteScheduleTemplate={handleDeleteScheduleTemplate}
          templateError={templateError}
          onEmployeeAdd={handleEmployeeAddInternal}
          onEmployeeDelete={handleEmployeeDeleteInternal}
          canManagePeople={perms.canManagePeople}
          helpOpen={helpOpen}
          setHelpOpen={setHelpOpen}
          assetsLabel={assetsLabel}
          announcerRef={announcerRef}
          inlineEditTarget={inlineEditTarget}
          setInlineEditTarget={setInlineEditTarget}
          handleInlineSave={handleInlineSave}
          handleInlineDelete={handleInlineDelete}
        />
        </div>
      </CalendarContext.Provider>
    </CalendarErrorBoundary>
  );
});
