/**
 * WorksCalendar — main component.
 */
import {
  useState, useCallback, useEffect, useRef, useReducer,
  useImperativeHandle, forwardRef, useMemo,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfDay,
  startOfWeek, endOfWeek, addDays,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Plus, Sparkles, Upload } from 'lucide-react';

import { useCalendar }        from './hooks/useCalendar';
import { useOwnerConfig }     from './hooks/useOwnerConfig';
import { useFetchEvents }     from './hooks/useFetchEvents';
import { useSourceStore }      from './hooks/useSourceStore';
import { useSourceAggregator } from './hooks/useSourceAggregator';
import { useSavedViews, deserializeFilters } from './hooks/useSavedViews';
import type { GroupByInput } from './hooks/useNormalizedConfig.ts';
import type { SortConfig } from './types/grouping.ts';
import { sortEvents } from './core/sortEngine.ts';
import { useRealtimeEvents }  from './hooks/useRealtimeEvents';
import { usePermissions }     from './hooks/usePermissions';
import { useEventOptions }    from './hooks/useEventOptions';
import { useTouchSwipe }     from './hooks/useTouchSwipe';
import { CalendarContext }    from './core/CalendarContext';
import { normalizeEvents }    from './core/eventModel';
import { CalendarEngine }     from './core/engine/CalendarEngine.ts';
import { UndoRedoManager }   from './core/engine/UndoRedoManager.ts';
import type { ResourcePool } from './core/pools/resourcePoolSchema.ts';
import { fromLegacyEvents }   from './core/engine/adapters/fromLegacyEvents.ts';
import type { LegacyEvent } from './core/engine/adapters/fromLegacyEvents.ts';
import { occurrenceToLegacy, toLegacyEvent } from './core/engine/adapters/toLegacyEvents.ts';
import { validateOperation } from './core/engine/validation/validateOperation.ts';
import type { OperationContext } from './core/engine/validation/validationTypes';
import type { AnnouncerRef } from './ui/ScreenReaderAnnouncer';
import RecurringScopeDialog   from './ui/RecurringScopeDialog';
import SetupLanding, { type SetupLandingResult, type SetupRecipeId } from './ui/SetupLanding';
import { applyFilters, getCategories, getResources } from './filters/filterEngine';
import { resolveCssTheme, normalizeTheme, THEME_META } from './styles/themes';
import { DEFAULT_FILTER_SCHEMA, buildDefaultFilterSchema, makeResourceResolver, viewScopedSchema, type FilterField } from './filters/filterSchema';
import { SCHEDULE_WORKFLOW_CATEGORIES } from './core/scheduleModel';
import { useTabScopedEvents } from './hooks/useTabScopedEvents';
import { captureSavedViewFields, type ViewId } from './core/viewScope';
import { buildActiveFilterPills, buildFilterSummary, hasActiveFilters } from './filters/filterState';
import { AppShell }           from './ui/AppShell';
import { AppHeader }          from './ui/AppHeader';
import { SubToolbar }         from './ui/SubToolbar';
import { DayWindowPills }     from './ui/DayWindowPills';
import FilterBar              from './ui/FilterBar';
import ProfileBar             from './ui/ProfileBar';
import FilterGroupSidebar, { SidebarToggleButton } from './ui/FilterGroupSidebar';
import FocusChips, { DEFAULT_FOCUS_CHIPS } from './ui/FocusChips';
import type { FocusChipDef } from './ui/FocusChips';
import type { SidebarTab } from './ui/FilterGroupSidebar';
import type { GroupLevel } from './ui/GroupsPanel';
import HoverCard              from './ui/HoverCard';
import OwnerLock              from './ui/OwnerLock';
import KeyboardHelpOverlay   from './ui/KeyboardHelpOverlay';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import ConfigPanel            from './ui/ConfigPanel';
import EventForm              from './ui/EventForm';
import AssetRequestForm       from './ui/AssetRequestForm';
import ImportZone             from './ui/ImportZone';
import ScheduleTemplateDialog from './ui/ScheduleTemplateDialog';
import AvailabilityForm        from './ui/AvailabilityForm';
import ScheduleEditorForm      from './ui/ScheduleEditorForm';
import { detectShiftConflicts, buildOpenShiftEvent } from './core/scheduleOverlap';
import {
  buildCoverageMeta,
  buildOpenShiftPatch,
  buildShiftStatusMeta,
  findLinkedMirroredCoverage,
  findLinkedOpenShifts,
  resolveEventId,
} from './core/scheduleMutations';
import {
  normalizeScheduleKind,
  SCHEDULE_KINDS,
} from './core/scheduleModel';
import { createId } from './core/createId';
import ValidationAlert          from './ui/ValidationAlert';
import InlineEventEditor        from './ui/InlineEventEditor';
import ScreenReaderAnnouncer   from './ui/ScreenReaderAnnouncer';
import CalendarErrorBoundary   from './ui/CalendarErrorBoundary';
import MonthView              from './views/MonthView';
import WeekView               from './views/WeekView';
import DayView                from './views/DayView';
import AgendaView             from './views/AgendaView';
import TimelineView           from './views/TimelineView';
import AssetsView             from './views/AssetsView';
import BaseGanttView          from './views/BaseGanttView';
import DispatchView           from './views/DispatchView';
import type { DispatchMissionCandidate, DispatchMissionReadiness } from './views/DispatchView';
import MapView                from './views/MapView';

type DispatchEvaluator = (
  assetId: string,
  missionId: string,
  asOf: Date,
) => DispatchMissionReadiness;
export type { DispatchMissionCandidate, DispatchMissionReadiness, DispatchEvaluator };
import { createManualLocationProvider } from './providers/ManualLocationProvider.ts';
import type { AssetsZoomLevel, LocationData, LocationProvider } from './types/assets';
import { canViewScheduleTemplate, instantiateScheduleTemplate } from './api/v1/templates.ts';
import type { CalendarEventV1 } from './api/v1/types.ts';

import styles from './WorksCalendar.module.css';
import './styles/family/index.css';
import { customThemeToCssVars } from './core/themeSchema';

import type { EventStatus, WorksCalendarEvent } from './types/events';
export type { WorksCalendarEvent };
export type CalendarView = ViewId;
export type CalendarRole = 'admin' | 'user' | 'readonly';

export type ScheduleInstantiationLimits = {
  previewMax?: number;
  createMax?: number;
};

type UnknownRecord = Record<string, unknown>;
type ScheduleTemplateAdapter = {
  listScheduleTemplates?: () => Promise<unknown>;
  createScheduleTemplate?: (template: UnknownRecord) => Promise<unknown>;
  deleteScheduleTemplate?: (templateId: string) => Promise<unknown>;
  [key: string]: unknown;
};
type EmployeeId = string | number;
type EmployeeRecord = { id: EmployeeId; name?: string; [key: string]: unknown };
type EmployeeActionInput = { type?: string; [key: string]: unknown };
type EventGroupPatch = Record<string, unknown>;
type AssetLocationData = LocationData | null;
type AvailabilitySavePayload = {
  status?: string;
  coveredBy?: string | null;
  [key: string]: unknown;
};
type ScheduleDialogRequest = {
  templateId?: string | undefined;
  anchor: Date;
  resource?: string | undefined;
  category?: string | undefined;
};
type SchedulePreviewConflict = {
  index: number;
  title: string;
  severity: string;
  violations: Array<{ rule?: string | undefined; message?: string | undefined }>;
};
type SchedulePreviewResult = {
  generated: Array<{
    id?: string | undefined;
    title?: string | undefined;
    start?: string | number | Date | undefined;
    end?: string | Date | undefined;
    startOffsetMinutes?: number | undefined;
    durationMinutes?: number | undefined;
    category?: string | null | undefined;
    resource?: string | null | undefined;
    status?: EventStatus | undefined;
    color?: string | null | undefined;
    rrule?: string | undefined;
    exdates?: Array<string | Date> | undefined;
    meta?: Record<string, unknown> | undefined;
  }>;
  conflicts: SchedulePreviewConflict[];
  error: string;
};

export type CalendarApi = {
  navigateTo: (date: Date) => void;
  setView: (view: CalendarView) => void;
  goToToday: () => void;
  openEvent: (id: string) => void;
  getVisibleEvents: () => WorksCalendarEvent[];
  clearFilters: () => void;
  addEvent: (defaults?: Partial<WorksCalendarEvent>) => void;
  undo: () => boolean;
  redo: () => boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};

export type WorksCalendarProps = {
  events?: WorksCalendarEvent[];
  fetchEvents?: (...args: unknown[]) => Promise<WorksCalendarEvent[]>;
  icalFeeds?: UnknownRecord[];
  onImport?: (events: WorksCalendarEvent[]) => void;
  scheduleTemplates?: UnknownRecord[];
  scheduleTemplateAdapter?: ScheduleTemplateAdapter;
  scheduleInstantiationLimits?: ScheduleInstantiationLimits;
  onScheduleTemplateAnalytics?: (payload: UnknownRecord) => void;
  calendarId?: string;
  ownerPassword?: string;
  onConfigSave?: (config: UnknownRecord) => void;
  devMode?: boolean;
  notes?: UnknownRecord;
  onNoteSave?: (note: UnknownRecord) => void;
  onNoteDelete?: (noteId: string) => void;
  onEventClick?: (event: WorksCalendarEvent) => void;
  onEventSave?: (event: WorksCalendarEvent) => void;
  onEventMove?: (event: WorksCalendarEvent, newStart: Date, newEnd: Date) => void;
  onEventResize?: (event: WorksCalendarEvent, newStart: Date, newEnd: Date) => void;
  onEventDelete?: (eventId: string) => void;
  onEventGroupChange?: (event: WorksCalendarEvent, patch: EventGroupPatch) => void;
  onDateSelect?: (start: Date, end: Date, resourceId?: string) => void;
  supabaseUrl?: string;
  supabaseKey?: string;
  supabaseTable?: string;
  supabaseFilter?: string;
  role?: CalendarRole;
  employees?: EmployeeRecord[];
  onEmployeeAdd?: (member: EmployeeRecord) => void;
  onEmployeeDelete?: (employeeId: EmployeeId) => void;
  onEmployeeAction?: (employeeId: EmployeeId, action: EmployeeActionInput) => void;
  onAvailabilitySave?: (payload: AvailabilitySavePayload) => void;
  onScheduleSave?: (payload: WorksCalendarEvent) => void;
  blockedWindows?: UnknownRecord[];
  theme?: string;
  colorRules?: UnknownRecord[];
  /**
   * Forwarded to the optional Map view (`initialView="map"`) as its
   * MapLibre style URL. Ignored when the map view isn't active or when the
   * `react-map-gl` / `maplibre-gl` peers aren't installed.
   */
  mapStyle?: string;
  businessHours?: UnknownRecord;
  renderEvent?: (event: WorksCalendarEvent, context?: UnknownRecord) => ReactNode;
  renderHoverCard?: (event: WorksCalendarEvent, onClose: () => void) => ReactNode;
  renderToolbar?: (api: CalendarApi) => ReactNode;
  renderFilterBar?: (args: UnknownRecord) => ReactNode;
  renderSavedViewsBar?: (args: UnknownRecord) => ReactNode;
  /**
   * Visible quick-filter chips rendered above the view area. Opt-in:
   *   - omitted (default) → no chip row renders
   *   - `true`            → renders the library's DEFAULT_FOCUS_CHIPS
   *   - `FocusChipDef[]`  → renders that custom chip list
   * Clicking a chip toggles its categories on the calendar's `category`
   * filter. Hosts that don't define the referenced categories render a
   * no-op chip (harmless).
   */
  focusChips?: FocusChipDef[] | boolean;
  /**
   * Pending missions/requests offered as the "For mission" picker on the
   * Dispatch view. Empty/undefined hides the picker (the view falls back
   * to generic readiness). Pair with `dispatchEvaluator` — the picker is
   * also hidden when no evaluator is wired.
   */
  dispatchMissions?: DispatchMissionCandidate[];
  /**
   * Per-(asset, mission) readiness evaluator for the Dispatch view. Hosts
   * translate their domain primitives (cert matching, capability checks,
   * hours remaining, etc.) into the readiness shape the table expects.
   */
  dispatchEvaluator?: DispatchEvaluator;
  emptyState?: ReactNode;
  filterSchema?: FilterField[];
  showAddButton?: boolean;
  /**
   * Opt-in interactive setup landing page. When true, first-time owners
   * (those with `config.setup.completed === false`) see a full-page
   * guided walkthrough before the calendar renders — with a prominent
   * "Skip setup guide" button for owners who already know the product.
   *
   * Defaults to false so hosts and test fixtures keep their current
   * behavior. Turn it on from the host app to enable the guided flow.
   */
  showSetupLanding?: boolean;
  initialView?: CalendarView;
  weekStartDay?: 0 | 1;
  groupBy?: GroupByInput;
  sort?: SortConfig | SortConfig[];
  showAllGroups?: boolean;

  // ── Assets view ──
  locationProvider?: LocationProvider;
  categoriesConfig?: Record<string, unknown>;
  assets?: { id: string; label: string; group?: string; meta?: Record<string, unknown> }[];
  strictAssetFiltering?: boolean;
  assetRequestCategories?: string[];
  onConflictCheck?: (event: WorksCalendarEvent, candidate: WorksCalendarEvent) => Promise<unknown>;
  onApprovalAction?: (event: WorksCalendarEvent, action: string) => void | Promise<void>;
  renderAssetLocation?: (locationData: AssetLocationData, asset: { id: string }) => ReactNode;
  renderAssetBadges?: (asset: { id: string }) => ReactNode;
  /** Maintenance rules offered in the EventForm. When non-empty, the form
   *  shows a Maintenance section; lifecycle='complete' triggers a built-in
   *  call to completeMaintenance() so projected nextDue* fields land on
   *  event.meta.maintenance automatically. */
  maintenanceRules?: readonly import('./types/maintenance').MaintenanceRule[];
  renderConflictBody?: (args: UnknownRecord) => ReactNode;

  /**
   * Resource pools (#212). Bookings can target a pool id via
   * `event.resourcePoolId`; the engine resolves a concrete member at
   * submit time and advances the round-robin cursor. Hosts that care
   * about cross-reload persistence should read the initial array from
   * their own store and keep it in sync via `onPoolsChange`.
   */
  pools?: ResourcePool[];
  /**
   * Fires whenever the engine commits a pool state change (e.g. a
   * round-robin cursor advance). Hosts should persist the array so the
   * cursor survives page reloads. Omit to skip persistence entirely.
   */
  onPoolsChange?: (pools: ResourcePool[]) => void;

  /** Optional logo image displayed at the left of the toolbar. */
  logoSrc?: string;
  /** Alt text for the logo image. Treated as decorative if omitted. */
  logoAlt?: string;
  /** Optional background image URL applied to the calendar root. */
  backgroundImage?: string;
};



// Phase 1 migration boundary: keep WorksCalendar callback seams intentionally
// loose while removing implicit `any` from root handlers.
type LooseValue = any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Human-readable announcement text for a completed engine operation. */
function opAnnouncement(op: LooseValue) {
  switch (op.type) {
    case 'create': return `Event "${op.event?.title ?? 'Untitled'}" created.`;
    case 'update': return 'Event updated.';
    case 'delete': return 'Event deleted.';
    case 'move':   return 'Event moved.';
    case 'resize': return 'Event resized.';
    case 'group-change': return 'Event reassigned.';
    default:       return 'Change applied.';
  }
}

type ViewDef = { id: ViewId; label: string; alwaysOn: boolean; hint?: string };
const ALL_VIEWS: readonly ViewDef[] = [
  { id: 'month',    label: 'Month',    alwaysOn: true,  hint: 'Scheduled events — appointments, missions, PTO' },
  { id: 'week',     label: 'Week',     alwaysOn: true,  hint: 'Scheduled events by day — not staffing or on-call' },
  { id: 'day',      label: 'Day',      alwaysOn: false },
  { id: 'agenda',   label: 'Agenda',   alwaysOn: false },
  { id: 'schedule', label: 'Schedule', alwaysOn: false, hint: 'Staffing — day/night shifts, on-call rotation, duty status' },
  { id: 'base',     label: 'Base',     alwaysOn: false, hint: 'Gantt-style — employees, aircraft, and base events side by side' },
  { id: 'assets',   label: 'Assets',   alwaysOn: false },
  { id: 'dispatch', label: 'Dispatch', alwaysOn: false, hint: 'Fleet readiness at a moment in time — what can launch now?' },
  { id: 'map',      label: 'Map',      alwaysOn: false, hint: 'Geographic plot of events that carry coordinates (meta.coords)' },
];

const DEFAULT_SCHEDULE_INSTANTIATION_LIMITS = {
  previewMax: 200,
  createMax: 200,
};

/**
 * Translate a SetupLanding recipe id into a real Saved View payload.
 * These are the "plain-language starting points" the landing page offers
 * owners who don't want to build filters by hand. Returns null if the id
 * isn't recognised so future additions fail soft.
 */
function buildRecipeSavedView(
  id: SetupRecipeId,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): { name: string; filters: Record<string, unknown>; view: string | null; groupBy: GroupByInput | null } | null {
  const emptyFilters = {
    categories: new Set<string>(),
    resources:  new Set<string>(),
    sources:    new Set<string>(),
    search:     '',
    dateRange:  null as null | { start: string; end: string },
  };

  switch (id) {
    case 'everything':
      return { name: 'Show everything', filters: { ...emptyFilters }, view: null, groupBy: null };

    case 'by-person':
      return {
        name:    'Group by person',
        filters: { ...emptyFilters },
        view:    'schedule',
        groupBy: 'resource',
      };

    case 'by-type':
      return {
        name:    'Group by type',
        filters: { ...emptyFilters },
        view:    null,
        groupBy: 'category',
      };

    case 'on-call':
      return {
        name:    'On-call only',
        filters: { ...emptyFilters, categories: new Set(['on-call']) },
        view:    null,
        groupBy: null,
      };

    case 'this-week': {
      const now      = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn });
      const weekEnd   = endOfWeek(now, { weekStartsOn });
      return {
        name: 'This week only',
        filters: {
          ...emptyFilters,
          dateRange: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
        },
        view:    'week',
        groupBy: null,
      };
    }

    default:
      return null;
  }
}
let exportToExcelFn: LooseValue = null;

async function exportVisibleEvents(events: LooseValue) {
  if (!exportToExcelFn) {
    ({ exportToExcel: exportToExcelFn } = await import('./export/excelExport.js'));
  }
  return exportToExcelFn(events);
}

/** Compute the visible [start, end] range for a given view + date. */
function viewRange(view: LooseValue, date: LooseValue, weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0) {
  switch (view) {
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: weekStartDay }), end: endOfWeek(date, { weekStartsOn: weekStartDay }) };
    case 'day':
      return { start: date, end: addDays(date, 1) };
    case 'base':
      // Base Gantt view defaults to 14 days and can expand to 90. Always
      // materialize the 90-day window so toggling in-view doesn't require
      // a re-fetch and occurrences at the end of the span aren't missing.
      return { start: startOfDay(date), end: addDays(startOfDay(date), 90) };
    default: // month, agenda, schedule (timeline), assets
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
}

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
    theme       = 'light',
    colorRules,
    businessHours,

    // ── Custom rendering ──
    renderEvent,
    renderHoverCard,
    renderToolbar,
    renderFilterBar,
    renderSavedViewsBar,
    focusChips,
    dispatchMissions,
    dispatchEvaluator,
    emptyState,

    // ── Filter schema (pass a custom FilterField[] to extend or replace defaults) ──
    filterSchema,

    // ── UI toggles ──
    showAddButton           = false,
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
  const cal = useCalendar([], initialView ?? 'month', schema);

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

  // ── Saved view active state ──────────────────────────────────────────────
  const [savedViewActiveId, setSavedViewActiveId] = useState<string | null>(null);
  const [savedViewDirty,    setSavedViewDirty]    = useState(false);
  const skipDirtyRef = useRef(false);
  const savedViews = useSavedViews(calendarId);

  // ── Setup landing gate ──────────────────────────────────────────────────
  // Shown before the calendar for first-time owners until they finish or
  // skip the guide. The landing persists its decision via setup.completed;
  // this session flag is just for "show on demand" re-opens later.
  const [setupDismissed, setSetupDismissed] = useState(false);
  const setupCompleted  = !!ownerCfg.config?.['setup']?.completed;
  const shouldShowSetup = showSetupLanding && !setupCompleted && !setupDismissed;

  const handleSetupSkip = useCallback(() => {
    ownerCfg.updateConfig(prev => ({
      ...prev,
      setup: { ...(prev['setup'] ?? {}), completed: true },
    }));
    setSetupDismissed(true);
  }, [ownerCfg.updateConfig]);

  // Re-trigger the SetupLanding guide on demand. Setting completed=false
  // alone is not enough because setupDismissed is a session flag set when
  // the guide was last finished/skipped — both must be reset to put the
  // user back on the landing page. Closing the config panel ensures the
  // landing has the screen to itself.
  const handleReopenSetup = useCallback(() => {
    ownerCfg.updateConfig(prev => ({
      ...prev,
      setup: { ...(prev['setup'] ?? {}), completed: false },
    }));
    setSetupDismissed(false);
    ownerCfg.closeConfig();
  }, [ownerCfg.updateConfig, ownerCfg.closeConfig]);

  const handleSetupFinish = useCallback((result: SetupLandingResult) => {
    // 1) Persist title / theme / default view / team / setup.completed.
    ownerCfg.updateConfig(prev => {
      // Merge wizard-seeded assets without clobbering existing entries (so
      // re-opening the wizard never blows away assets configured later).
      const existingAssets = (Array.isArray(prev['assets']) ? prev['assets'] : []) as Array<{ id: string }>;
      const existingIds = new Set(existingAssets.map(a => a.id));
      const seededAssets = result.assetSeeds
        .filter(seed => !existingIds.has(seed.id))
        .map(seed => ({
          id: seed.id,
          label: seed.label,
          meta: { assetTypeId: seed.assetTypeId },
        }));

      return {
        ...prev,
        title: result.calendarName,
        setup: {
          ...(prev['setup'] ?? {}),
          completed: true,
          preferredTheme: result.theme,
        },
        display: {
          ...(prev['display'] ?? {}),
          defaultView: result.defaultView,
          enabledViews: result.enabledViews,
        },
        team: {
          ...(prev['team'] ?? {}),
          locationLabel: result.locationLabel,
          members: [
            ...((prev['team']?.members ?? []) as Array<{ id: unknown }>)
              .filter(m => !result.teamMembers.some(r => String(r.id) === String(m.id))),
            ...result.teamMembers,
          ],
        },
        assetTypes: result.assetTypes,
        assets: [...existingAssets, ...seededAssets],
        requirementTemplates: result.requirementTemplates,
      };
    });

    // 2) Save each chosen recipe as a Smart View so it shows up in the
    //    views bar. Recipes map to real filter + groupBy state; the owner
    //    can edit or delete any of them later.
    for (const recipeId of result.recipes) {
      const recipe = buildRecipeSavedView(recipeId, weekStartDay);
      if (!recipe) continue;
      savedViews.saveView(recipe.name, recipe.filters, {
        view: recipe.view,
        groupBy: recipe.groupBy,
      });
    }

    setSetupDismissed(true);
  }, [ownerCfg.updateConfig, savedViews, weekStartDay]);

  // ── Active groupBy / sort (controlled by props; overridden when a saved view is applied) ──
  const [activeGroupBy, setActiveGroupBy] = useState<GroupByInput | null>(groupBy ?? null);
  useEffect(() => setActiveGroupBy(groupBy ?? null), [groupBy]);

  const normalizeSortProp = (s: SortConfig | SortConfig[] | null | undefined): SortConfig[] | null => {
    if (!s) return null;
    return Array.isArray(s) ? s : [s];
  };
  const [activeSort, setActiveSort] = useState<SortConfig[] | null>(normalizeSortProp(sort));
  useEffect(() => setActiveSort(normalizeSortProp(sort)), [sort]);

  const [activeShowAllGroups, setActiveShowAllGroups] = useState<boolean>(!!showAllGroups);
  useEffect(() => setActiveShowAllGroups(!!showAllGroups), [showAllGroups]);

  // ── FilterGroupSidebar state ──
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarInitialTab, setSidebarInitialTab] = useState<SidebarTab>('view');

  const handleScopeClick = useCallback(() => {
    setSidebarInitialTab('view');
    setSidebarOpen(true);
  }, []);

  // Derive GroupLevel[] from activeGroupBy for the sidebar's GroupsPanel
  const sidebarGroupLevels = useMemo<GroupLevel[]>(() => {
    if (!activeGroupBy) return [];
    if (typeof activeGroupBy === 'string') return [{ field: activeGroupBy, showEmpty: false }];
    if (Array.isArray(activeGroupBy)) {
      return activeGroupBy.map(item =>
        typeof item === 'string'
          ? { field: item, showEmpty: false }
          : { field: item.field, showEmpty: !!item.showEmpty },
      );
    }
    return [];
  }, [activeGroupBy]);

  const handleSidebarGroupLevelsChange = useCallback((levels: GroupLevel[]) => {
    if (levels.length === 0) {
      setActiveGroupBy(null);
    } else if (levels.length === 1) {
      setActiveGroupBy(levels[0]!.field);
    } else {
      setActiveGroupBy(levels.map(l => ({ field: l.field, showEmpty: l.showEmpty })));
    }
  }, []);

  const handleSidebarFiltersChange = useCallback((filters: Record<string, unknown>) => {
    cal.replaceFilters(filters);
  }, [cal]);

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

  const handleSidebarSaveView = useCallback((name: string, color: string | null) => {
    savedViews.saveView(name, cal.filters, {
      color,
      view: cal.view,
      ...captureSavedViewFields(cal.view, {
        groupBy: activeGroupBy,
        sort: activeSort,
        showAllGroups: activeShowAllGroups,
        zoomLevel: activeAssetsZoom,
        collapsedGroups: activeAssetsCollapsed,
        selectedBaseIds,
      }),
    });
  }, [cal, savedViews, activeGroupBy, activeSort, activeShowAllGroups, activeAssetsZoom, activeAssetsCollapsed, selectedBaseIds]);

  // Mark dirty when filters/view/groupBy/sort/showAllGroups/assets-state change
  // after a saved view was applied. A ref skips the first run that fires
  // synchronously after handleApplyView seeds state from the saved view.
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    if (savedViewActiveId)    setSavedViewDirty(true);
  }, [cal.filters, cal.view, activeGroupBy, activeSort, activeShowAllGroups, activeAssetsZoom, activeAssetsCollapsed, selectedBaseIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyView = useCallback((savedView: LooseValue) => {
    skipDirtyRef.current = true;
    cal.replaceFilters(deserializeFilters(savedView.filters, schema));
    if (savedView.view) cal.setView(savedView.view);
    setActiveGroupBy(savedView.groupBy ?? null);
    setActiveSort(Array.isArray(savedView.sort) ? savedView.sort : null);
    setActiveShowAllGroups(!!savedView.showAllGroups);
    if (savedView.zoomLevel) setActiveAssetsZoom(savedView.zoomLevel);
    setActiveAssetsCollapsed(
      Array.isArray(savedView.collapsedGroups)
        ? new Set(savedView.collapsedGroups)
        : new Set(),
    );
    setSelectedBaseIds(
      Array.isArray(savedView.selectedBaseIds) ? savedView.selectedBaseIds : [],
    );
    setSavedViewActiveId(savedView.id);
    setSavedViewDirty(false);
  }, [cal, schema]);

  const handleDeleteView = useCallback((id: LooseValue) => {
    savedViews.deleteView(id);
    if (savedViewActiveId === id) {
      setSavedViewActiveId(null);
      setSavedViewDirty(false);
    }
  }, [savedViews, savedViewActiveId]);

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
  const { events: sourceEvents, feedErrors } = useSourceAggregator({
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
  const engineRef      = useRef<CalendarEngine | null>(null);
  const undoManagerRef = useRef<UndoRedoManager | null>(null);
  const announcerRef   = useRef<AnnouncerRef | null>(null);
  // Tracks the pools map we last emitted so subsequent engine _notify calls
  // only fire onPoolsChange on real pool mutations (e.g. round-robin cursor
  // advance), not on every state tick.
  const lastPoolsRef = useRef<ReadonlyMap<string, ResourcePool> | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new CalendarEngine(
      rawPools && rawPools.length > 0 ? { pools: rawPools } : undefined,
    );
    undoManagerRef.current = new UndoRedoManager(engineRef.current, { maxSize: 50 });
    lastPoolsRef.current = engineRef.current.state.pools;
  }
  // Narrow refs into non-null locals for the rest of render. The init block
  // above runs synchronously and makes both refs singletons across renders.
  const engine = engineRef.current;
  const undoManager = undoManagerRef.current;
  if (engine === null || undoManager === null) {
    throw new Error('CalendarEngine/UndoRedoManager failed to initialize');
  }

  // Counts how many onEventSave-triggered prop updates to suppress clear() for.
  // Scope ops (single/following) emit multiple onEventSave calls; each one
  // causes a separate allNormalized update that must not wipe the undo stack.
  const engineMutationPendingRef = useRef(0);

  // Version counter: increments whenever the engine emits a state change.
  const [engineVer, tickEngine] = useReducer(n => n + 1, 0);
  useEffect(() => engine.subscribe(() => tickEngine()), [engine]);

  // Keep engine pools in sync when the host rewrites the prop (controlled
  // pattern: demo persists to localStorage in onPoolsChange, then re-renders
  // with the new array). Only the engine advances rrCursor, so replacing
  // via setPools after a mutation is safe as long as the host echoed the
  // latest onPoolsChange payload back in.
  useEffect(() => {
    if (!rawPools) return;
    engine.setPools(rawPools);
    lastPoolsRef.current = engine.state.pools;
  }, [engine, rawPools]);

  // Emit onPoolsChange whenever the engine commits a new pools map (typically
  // a round-robin cursor advance during applyMutation). Suppress emissions
  // driven by the host's own setPools round-trip above.
  useEffect(() => {
    if (!onPoolsChange) return;
    const current = engine.state.pools;
    if (current === lastPoolsRef.current) return;
    lastPoolsRef.current = current;
    onPoolsChange(Array.from(current.values()));
  }, [engine, engineVer, onPoolsChange]);

  // Keep engine in sync with the merged+normalized event list from all sources.
  // Skip clear() when the change was triggered by our own onEventSave so the
  // undo stack survives the controlled-events prop round-trip.
  useEffect(() => {
    engine.setEvents(fromLegacyEvents(allNormalized as any));
    if (engineMutationPendingRef.current > 0) {
      engineMutationPendingRef.current -= 1;
    } else {
      undoManager.clear();
    }
  }, [engine, undoManager, allNormalized]);

  // ── Expand recurring events within the visible range (via engine) ────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Cast preserves the file's existing loose typing pattern — expandedEvents
  // was previously inferred as `any` via a nullable ref, and many consumers
  // still rely on that looseness. Tightening is out of scope for this PR.
  const expandedEvents: LooseValue[] = useMemo(
    () => engine.getOccurrencesInRange(range.start, range.end).map(occurrenceToLegacy),
    [engine, engineVer, range],
  );

  // ── Base/Region view config ───────────────────────────────────────────────
  const configuredBases   = ownerCfg.config?.['team']?.bases ?? [];
  const configuredRegions = ownerCfg.config?.['team']?.regions ?? [];
  const locationLabel     = ownerCfg.config?.['team']?.locationLabel ?? 'Base';
  const assetsLabel       = ownerCfg.config?.['team']?.assetsLabel   ?? 'Asset';

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

  // ── Mutation pipeline (engine-authoritative) ─────────────────────────────
  // Stable ref so applyEngineOp closure never goes stale.
  // Cast preserves the prior loose-typed assignment — the prop shapes for
  // businessHours/blockedWindows don't yet match OperationContext's structured
  // type. Narrowing those prop types is out of scope for this PR.
  const opCtxRef = useRef<OperationContext | null>(null);
  opCtxRef.current = {
    businessHours:  ownerCfg.config?.['businessHours'] ?? businessHours ?? null,
    blockedWindows: blockedWindows ?? [],
  } as unknown as OperationContext;

  const [pendingAlert,      setPendingAlert]      = useState<LooseValue | null>(null); // { violations, isHard, onConfirm }
  // { op, occurrenceDate, onAccepted, actionLabel } — set when a recurring event edit needs a scope choice
  const [recurringPrompt, setRecurringPrompt] = useState<LooseValue | null>(null);

  const applyEngineOp = useCallback((op: LooseValue, onAccepted: LooseValue) => {
    const ctx = opCtxRef.current;
    if (ctx === null) return;

    // Pre-capture the state BEFORE mutation. We only record this to the undo
    // stack on acceptance to keep the history free of rejected operations.
    const preSnap = undoManager.captureSnapshot();

    const result = engine.applyMutation(op, ctx);

    if (result.status === 'accepted' || result.status === 'accepted-with-warnings') {
      // State has changed — record the pre-mutation snapshot.
      undoManager.record(preSnap, op.type);
      announcerRef.current?.announce(opAnnouncement(op));
      // Each emitted onEventSave call will trigger an allNormalized update; count
      // them so the effect can skip clear() for all of them.
      engineMutationPendingRef.current = Math.max(1, result.changes.length);
      onAccepted(result);

    } else if (result.status === 'pending-confirmation') {
      // Engine state is UNCHANGED at this point (pending means no commit yet).
      // preSnap is still accurate as the pre-mutation snapshot.
      setPendingAlert({
        violations: result.validation.violations,
        isHard: false,
        onConfirm: () => {
          const confirmed = engine.applyMutation(op, ctx, { overrideSoftViolations: true });
          if (confirmed.status === 'accepted' || confirmed.status === 'accepted-with-warnings') {
            undoManager.record(preSnap, op.type);
            announcerRef.current?.announce(opAnnouncement(op));
            engineMutationPendingRef.current = Math.max(1, confirmed.changes.length);
            onAccepted(confirmed);
          }
        },
      });

    } else {
      // Rejected — state unchanged, nothing to record.
      setPendingAlert({ violations: result.validation.violations, isHard: true, onConfirm: null });
    }
  }, [engine, undoManager]); // engine/undoManager are singleton refs — stable

  // ── Local UI state ───────────────────────────────────────────────────────
  const [selectedEvent,  setSelectedEvent]  = useState<LooseValue | null>(null);
  const [formEvent,        setFormEvent]        = useState<LooseValue | null>(null);
  const [assetRequestOpen, setAssetRequestOpen] = useState(false);
  const [importOpen,       setImportOpen]       = useState(false);
  const [scheduleOpen,     setScheduleOpen]     = useState(false);
  // { emp: { id, name, role? }, kind: 'pto' | 'unavailable' | 'availability', start?: Date, initialEvent?: object | null }
  const [availabilityState, setAvailabilityState] = useState<LooseValue | null>(null);
  // { emp: { id, name, role? }, start?: Date, end?: Date }
  const [scheduleEditorState, setScheduleEditorState] = useState<LooseValue | null>(null);
  const [pillHoverTitle, setPillHoverTitle] = useState(false);
  const [editMode,         setEditMode]         = useState(false);
  const [helpOpen,         setHelpOpen]         = useState(false);
  // { event, x, y } — set when an event is clicked in edit mode
  const [inlineEditTarget, setInlineEditTarget] = useState<LooseValue | null>(null);
  // Capture last click coords so InlineEventEditor can position near the pill
  const lastClickCoordsRef = useRef({ x: 0, y: 0 });
  const editModeRef = useRef(false);
  editModeRef.current = editMode;
  const [remoteTemplates, setRemoteTemplates] = useState<LooseValue[]>([]);
  const [templateError, setTemplateError] = useState('');

  const resolvedScheduleLimits = useMemo(() => {
    const previewMax = Number.isFinite(scheduleInstantiationLimits?.previewMax)
      ? Math.max(1, Number(scheduleInstantiationLimits.previewMax))
      : DEFAULT_SCHEDULE_INSTANTIATION_LIMITS.previewMax;
    const createMax = Number.isFinite(scheduleInstantiationLimits?.createMax)
      ? Math.max(1, Number(scheduleInstantiationLimits.createMax))
      : DEFAULT_SCHEDULE_INSTANTIATION_LIMITS.createMax;
    return { previewMax, createMax };
  }, [scheduleInstantiationLimits]);

  const trackScheduleTemplateAnalytics = useCallback((event: LooseValue, payload: LooseValue = {}) => {
    onScheduleTemplateAnalytics?.({
      event,
      at: new Date().toISOString(),
      ...payload,
    });
  }, [onScheduleTemplateAnalytics]);

  const reloadRemoteTemplates = useCallback(async () => {
    if (!scheduleTemplateAdapter?.listScheduleTemplates) return;
    try {
      const templates = await scheduleTemplateAdapter.listScheduleTemplates();
      setRemoteTemplates(Array.isArray(templates) ? templates : []);
      setTemplateError('');
    } catch {
      setTemplateError('Unable to load schedule templates from adapter.');
    }
  }, [scheduleTemplateAdapter]);

  useEffect(() => {
    reloadRemoteTemplates();
  }, [reloadRemoteTemplates]);

  const mergedScheduleTemplates = useMemo(() => {
    const combined = [...scheduleTemplates, ...remoteTemplates];
    const byId = new Map();
    combined.forEach((template) => {
      if (template?.id) byId.set(template.id, template);
    });
    return Array.from(byId.values());
  }, [remoteTemplates, scheduleTemplates]);

  const visibleScheduleTemplates = useMemo(
    () => mergedScheduleTemplates.filter((template) => canViewScheduleTemplate(template, { role, isOwner: ownerCfg.isOwner })),
    [mergedScheduleTemplates, ownerCfg.isOwner, role],
  );

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

  const getSavedEventPayload = useCallback((eventId: LooseValue, fallbackEvent: LooseValue = null, fallbackPatch: LooseValue = null) => {
    const normalizedId = eventId == null ? '' : String(eventId);
    if (normalizedId) {
      const saved = engine.state.events.get(normalizedId);
      if (saved) return toLegacyEvent(saved);
    }
    if (!fallbackEvent) return null;
    return fallbackPatch ? { ...fallbackEvent, ...fallbackPatch } : fallbackEvent;
  }, [engine]);

  const emitEventSave = useCallback((eventId: LooseValue, fallbackEvent: LooseValue = null, fallbackPatch: LooseValue = null) => {
    const savedPayload = getSavedEventPayload(eventId, fallbackEvent, fallbackPatch);
    if (savedPayload) onEventSave?.(savedPayload);
  }, [getSavedEventPayload, onEventSave]);

  const handleShiftStatusChange = useCallback((ev: LooseValue, status: LooseValue) => {
    const eventId = resolveEventId(ev);
    if (!eventId) return;
    const linkedOpenShifts = findLinkedOpenShifts(expandedEvents, ev);
    const primaryOpenShift = linkedOpenShifts[0] ?? null;
    const linkedMirroredCoverage = findLinkedMirroredCoverage(expandedEvents, ev);

    const newMeta = buildShiftStatusMeta(ev, { status, openShiftId: resolveEventId(primaryOpenShift) });
    applyEngineOp(
      { type: 'update', id: eventId, patch: { meta: newMeta }, source: 'api' },
      () => emitEventSave(eventId, ev, { meta: newMeta }),
    );

    if (!status) {
      linkedOpenShifts.forEach((openEv) => {
        const openId = resolveEventId(openEv);
        if (!openId) return;
        applyEngineOp({ type: 'delete', id: openId, source: 'api' }, () => onEventDelete?.(openId));
      });

      linkedMirroredCoverage.forEach((coverEv) => {
        const coverId = resolveEventId(coverEv);
        if (!coverId) return;
        applyEngineOp({ type: 'delete', id: coverId, source: 'api' }, () => onEventDelete?.(coverId));
      });
    }
  }, [applyEngineOp, emitEventSave, expandedEvents, onEventDelete]);

  const handleCoverageAssign = useCallback((ev: LooseValue, coveringEmployeeId: LooseValue) => {
    const eventId = resolveEventId(ev);
    if (!eventId) return;
    const normalizedCoveringEmployeeId = String(coveringEmployeeId ?? '');

    const openShiftCandidates = findLinkedOpenShifts(expandedEvents, ev);
    const primaryOpenShift = openShiftCandidates[0] ?? null;
    const mirroredCoverage = findLinkedMirroredCoverage(expandedEvents, ev);

    if (!normalizedCoveringEmployeeId) {
      const clearedMeta = {
        ...(ev.meta ?? {}),
        coveredBy: null as LooseValue,
      };
      applyEngineOp(
        { type: 'update', id: eventId, patch: { meta: clearedMeta }, source: 'api' },
        () => emitEventSave(eventId, ev, { meta: clearedMeta }),
      );

      if (primaryOpenShift) {
        const openId = resolveEventId(primaryOpenShift);
        if (openId) {
          const openMeta = {
            ...(primaryOpenShift.meta ?? {}),
            coveredBy: null as LooseValue,
            status: 'open',
          };
          applyEngineOp(
            { type: 'update', id: openId, patch: { meta: openMeta }, source: 'api' },
            () => emitEventSave(openId, primaryOpenShift, { meta: openMeta }),
          );
        }
      }

      mirroredCoverage.forEach((coverEv) => {
        const coverId = resolveEventId(coverEv);
        if (!coverId) return;
        applyEngineOp({ type: 'delete', id: coverId, source: 'api' }, () => onEventDelete?.(coverId));
      });
      return;
    }

    // 1. Mark the shift as covered
    const newMeta = buildCoverageMeta(ev, normalizedCoveringEmployeeId, resolveEventId(primaryOpenShift));
    applyEngineOp(
      { type: 'update', id: eventId, patch: { meta: newMeta }, source: 'api' },
      () => emitEventSave(eventId, ev, { meta: newMeta }),
    );

    // 2. If there is a linked open-shift record, mark it as covered too
    if (primaryOpenShift) {
      const [openShiftEv, ...duplicateOpenShifts] = openShiftCandidates;
      if (openShiftEv === undefined) return;
      duplicateOpenShifts.forEach((duplicateOpenShift) => {
        const duplicateId = resolveEventId(duplicateOpenShift);
        if (!duplicateId) return;
        applyEngineOp({ type: 'delete', id: duplicateId, source: 'api' }, () => onEventDelete?.(duplicateId));
      });
      const openMeta = {
        ...(openShiftEv.meta ?? {}),
        coveredBy: normalizedCoveringEmployeeId,
        status:    'covered',
      };
      const openId = resolveEventId(openShiftEv);
      if (openId) {
        applyEngineOp(
          { type: 'update', id: openId, patch: { meta: openMeta }, source: 'api' },
          () => emitEventSave(openId, openShiftEv, { meta: openMeta }),
        );
      }
    }

    mirroredCoverage.slice(1).forEach((duplicateEv) => {
      const duplicateId = resolveEventId(duplicateEv);
      if (!duplicateId) return;
      applyEngineOp({ type: 'delete', id: duplicateId, source: 'api' }, () => onEventDelete?.(duplicateId));
    });

    // 3. Create or update the mirrored on-call event on the covering employee's row.
    //    Clamp the mirrored event to the PTO request window (meta.requestStart/End)
    //    when available, so the coverage bar only spans the days actually needing
    //    coverage — not the entire underlying shift.
    const onCallCat = ownerCfg.config?.['onCallCategory'] ?? 'on-call';
    const shiftStart = ev.start instanceof Date ? ev.start : new Date(ev.start);
    const shiftEnd   = ev.end   instanceof Date ? ev.end   : new Date(ev.end);
    const requestStart = ev.meta?.requestStart ? new Date(ev.meta.requestStart) : shiftStart;
    const requestEnd   = ev.meta?.requestEnd   ? new Date(ev.meta.requestEnd)   : shiftEnd;
    const mirrorStart = requestStart > shiftStart ? requestStart : shiftStart;
    const mirrorEnd   = requestEnd   < shiftEnd   ? requestEnd   : shiftEnd;
    const mirroredPatch = {
      title:    `Covering: ${ev.title ?? 'Shift'}`,
      start:    mirrorStart,
      end:      mirrorEnd,
      category: onCallCat,
      resource: normalizedCoveringEmployeeId,
      meta: {
        kind:              SCHEDULE_KINDS.COVERING,
        sourceShiftId:     eventId,
        coveredEmployeeId: String(ev.resource ?? ev.employeeId ?? ''),
      },
    };
    const existingMirror = mirroredCoverage[0];
    if (existingMirror) {
      const mirrorId = resolveEventId(existingMirror);
      if (mirrorId) {
        applyEngineOp(
          { type: 'update', id: mirrorId, patch: mirroredPatch, source: 'api' },
          () => emitEventSave(mirrorId, existingMirror, mirroredPatch),
        );
      }
    } else {
      const mirrorId = createId('cover');
      applyEngineOp(
        { type: 'create', event: { ...mirroredPatch, id: mirrorId }, source: 'api' },
        () => emitEventSave(mirrorId, mirroredPatch, { id: mirrorId }),
      );
    }
  }, [applyEngineOp, emitEventSave, expandedEvents, onEventDelete, ownerCfg.config?.['onCallCategory']]);

  /**
   * Handle employee action card clicks.
   * - 'pto' | 'unavailable' | 'availability' → opens AvailabilityForm
   * - 'schedule' → opens ScheduleEditorForm
   * All actions also bubble to the external onEmployeeAction prop.
   */
  const handleEmployeeAction = useCallback((empId: LooseValue, actionInput: LooseValue) => {
    const emp = configuredEmployees.find((e: LooseValue) => String(e.id) === String(empId)) ?? { id: empId, name: empId };
    const actionPayload = typeof actionInput === 'string'
      ? { type: actionInput }
      : (actionInput ?? {});
    const action = actionPayload.type;
    if (!action) return;
    const AVAILABILITY_ACTIONS = new Set(['pto', 'unavailable', 'availability']);
    if (AVAILABILITY_ACTIONS.has(action)) {
      const initialEvent = action === 'availability'
        ? expandedEvents
          .filter((ev: LooseValue) => {
            const evKind = normalizeScheduleKind(ev?.kind ?? ev?.meta?.kind);
            const evCat  = String(ev?.category ?? '').toLowerCase();
            const resourceId = String(ev?.resource ?? ev?.resourceId ?? ev?.employeeId ?? '');
            return resourceId === String(empId) && (evKind === 'availability' || evCat === 'availability');
          })
          .sort((a: LooseValue, b: LooseValue) => {
            const aStart = a?.start ? new Date(a.start).getTime() : 0;
            const bStart = b?.start ? new Date(b.start).getTime() : 0;
            return bStart - aStart;
          })
          .map((ev: LooseValue) => ({ ...ev, id: ev?._eventId ?? ev?.id }))[0] ?? null
        : actionPayload.sourceShift
          ? {
            title: action === 'pto' ? 'PTO' : 'Unavailable',
            start: actionPayload.sourceShift.start,
            end: actionPayload.sourceShift.end,
            allDay: actionPayload.sourceShift.allDay ?? true,
            meta: actionPayload.sourceShift.meta ?? {},
          }
        : null;
      const initialStart = actionPayload.sourceShift?.start
        ? new Date(actionPayload.sourceShift.start)
        : new Date();
      setAvailabilityState({ emp, kind: action, start: initialStart, initialEvent });
    } else if (action === 'schedule') {
      setScheduleEditorState({ emp, start: new Date() });
    }
    onEmployeeAction?.(empId, actionInput);
  }, [configuredEmployees, expandedEvents, onEmployeeAction]);

  /** Save an availability/PTO event through the engine then notify the host.
   *  Also runs overlap detection: any uncovered shift that overlaps the PTO/
   *  unavailable window automatically gets an open-shift event created. */
  const handleAvailabilitySave = useCallback((availEv: LooseValue) => {
    const existingAvailability = expandedEvents.find(
      (ev: LooseValue) => String(ev._eventId ?? ev.id) === String(availEv.id),
    );
    const availabilityId = existingAvailability
      ? String(existingAvailability._eventId ?? existingAvailability.id)
      : String(availEv.id ?? createId('avail'));
    const saveOp = existingAvailability
      ? {
        type: 'update',
        id: availabilityId,
        patch: {
          title: availEv.title,
          start: availEv.start,
          end: availEv.end,
          allDay: availEv.allDay,
          category: availEv.category,
          color: availEv.color,
          resource: availEv.resource,
          resourceId: availEv.resource,
          meta: availEv.meta,
        },
        source: 'api',
      }
      : { type: 'create', event: { ...availEv, id: availabilityId }, source: 'api' };

    // 1. Create or update the availability event itself
    applyEngineOp(saveOp, () => {
      const savedPayload = getSavedEventPayload(availabilityId, availEv, { id: availabilityId });
      if (savedPayload) onAvailabilitySave?.(savedPayload);
    });

    // 2. Detect overlapping shifts and auto-create open-shift records
    const isLeave = availEv.kind === 'pto' || availEv.kind === 'unavailable';
    if (isLeave) {
      const onCallCat = ownerCfg.config?.['onCallCategory'] ?? 'on-call';
      const { conflictingEvents } = detectShiftConflicts({
        employeeId:    String(availEv.employeeId ?? availEv.resource ?? ''),
        requestStart:  availEv.start instanceof Date ? availEv.start : new Date(availEv.start),
        requestEnd:    availEv.end   instanceof Date ? availEv.end   : new Date(availEv.end),
        allEvents:     expandedEvents,
        onCallCategory: onCallCat,
      });
      conflictingEvents.forEach(shiftEv => {
        const shiftId = shiftEv._eventId ?? String(shiftEv.id ?? '');
        if (!shiftId) return;
        const existingOpenShifts = findLinkedOpenShifts(expandedEvents, shiftEv);
        existingOpenShifts.slice(1).forEach((duplicateOpenShift) => {
          const duplicateId = resolveEventId(duplicateOpenShift);
          if (!duplicateId) return;
          applyEngineOp({ type: 'delete', id: duplicateId, source: 'api' }, () => onEventDelete?.(duplicateId));
        });

        const openShiftPatch = buildOpenShiftPatch(existingOpenShifts[0], shiftEv, availEv.kind);
        const openShift = existingOpenShifts[0]
          ? { ...existingOpenShifts[0], ...openShiftPatch }
          : buildOpenShiftEvent({ shiftEvent: shiftEv, reason: availEv.kind });

        if (existingOpenShifts[0]) {
          const openId = resolveEventId(existingOpenShifts[0]);
          if (openId) {
            applyEngineOp(
              { type: 'update', id: openId, patch: openShiftPatch, source: 'api' },
              () => emitEventSave(openId, existingOpenShifts[0], openShiftPatch),
            );
          }
        } else {
          applyEngineOp(
            { type: 'create', event: openShift, source: 'api' },
            () => emitEventSave(openShift['id'], openShift),
          );
        }

        // Mark the original shift as needing coverage
        const updatedMeta = {
          ...(shiftEv.meta ?? {}),
          shiftStatus:  availEv.kind,   // 'pto' | 'unavailable'
          openShiftId:  openShift['id'],
          coveredBy:    null as LooseValue,
          requestStart: availEv.start instanceof Date ? availEv.start.toISOString() : String(availEv.start),
          requestEnd:   availEv.end   instanceof Date ? availEv.end.toISOString()   : String(availEv.end),
        };
        applyEngineOp(
          { type: 'update', id: shiftId, patch: { meta: updatedMeta }, source: 'api' },
          () => emitEventSave(shiftId, shiftEv, { meta: updatedMeta }),
        );
      });
    }

    setAvailabilityState(null);
  }, [applyEngineOp, emitEventSave, getSavedEventPayload, onAvailabilitySave, onEventDelete, expandedEvents, ownerCfg.config?.['onCallCategory']]);

  /** Save one or more shift events (from ScheduleEditorForm) through the engine. */
  const handleScheduleEditorSave = useCallback((shiftEvOrArr: LooseValue) => {
    const events = Array.isArray(shiftEvOrArr) ? shiftEvOrArr : [shiftEvOrArr];
    events.forEach((ev: LooseValue, index: LooseValue) => {
      const scheduleId = String(ev.id ?? createId(`shift-${index}`));
      applyEngineOp(
        { type: 'create', event: { ...ev, id: scheduleId }, source: 'api' },
        () => {
          const savedPayload = getSavedEventPayload(scheduleId, ev, { id: scheduleId });
          if (savedPayload) onScheduleSave?.(savedPayload);
        },
      );
    });
    setScheduleEditorState(null);
  }, [applyEngineOp, getSavedEventPayload, onScheduleSave]);

  // All handlers run through applyEngineOp before touching host state.

  /**
   * For a recurring event, show the scope picker and apply the op after the
   * user chooses 'single' | 'following' | 'series'.
   * For non-recurring events, apply the op immediately.
   *
   * Defined BEFORE any handler that references it to avoid stale closures.
   */
  const applyWithRecurringCheck = useCallback((ev: LooseValue, makeOp: LooseValue, onAccepted: LooseValue, actionLabel: LooseValue) => {
    if (!ev._recurring) {
      applyEngineOp(makeOp('series'), onAccepted);
      return;
    }
    setRecurringPrompt({
      actionLabel,
      onConfirm: (scope: LooseValue) => {
        setRecurringPrompt(null);
        applyEngineOp(
          { ...makeOp(scope), scope, occurrenceDate: ev.start instanceof Date ? ev.start : new Date(ev.start) },
          onAccepted,
        );
      },
      onCancel: () => setRecurringPrompt(null),
    });
  }, [applyEngineOp]);

  const handleEventSave = useCallback((rawEv: LooseValue) => {
    const newStart = rawEv.start instanceof Date ? rawEv.start : new Date(rawEv.start);
    const newEnd   = rawEv.end   instanceof Date ? rawEv.end   : new Date(rawEv.end);
    // Expanded recurring occurrences from the engine carry _eventId.
    // Legacy recurring shapes may only carry _seriesId.
    const recurringMasterId = rawEv._eventId ?? rawEv._seriesId ?? null;
    // Fallback to id for non-recurring/legacy event shapes from the EventForm.
    const eventId  = recurringMasterId ?? (rawEv.id ? String(rawEv.id) : null);

    // Defensive RRULE preservation: if a recurring edit payload arrives with a
    // missing RRULE (e.g. an occurrence shape that lost series fields), keep
    // the series master cadence instead of accidentally stripping recurrence.
    const existingMaster = recurringMasterId ? engine.state.events.get(String(recurringMasterId)) : null;
    const resolvedRrule = rawEv.rrule ?? existingMaster?.rrule ?? null;

    if (!eventId) {
      // New event — no scope picker needed.
      const createdId = String(rawEv.id ?? createId('event'));
      const op = {
        type:  'create',
        event: {
          id:             createdId,
          title:          rawEv.title      ?? '(untitled)',
          start:          newStart,
          end:            newEnd,
          allDay:         rawEv.allDay     ?? false,
          resourceId:     rawEv.resource   ?? null,
          // Pool-seeded drafts carry resourcePoolId through; the engine
          // resolves it to a concrete resourceId at submit (#212).
          resourcePoolId: rawEv.resourcePoolId ?? null,
          category:       rawEv.category   ?? null,
          color:          rawEv.color      ?? null,
          status:         rawEv.status     ?? 'confirmed',
          rrule:          resolvedRrule,
          exdates:        rawEv.exdates    ?? [],
          meta:           rawEv.meta       ?? {},
        },
        source: 'form',
      };
      applyEngineOp(op, (result: LooseValue) => {
        // applyCreate generates its own engine id, so look the saved
        // record up by the id the engine actually assigned — otherwise
        // pool-resolved events fall through to the fallback payload,
        // which still carries resource: null from the form (#212).
        const createdChange = result?.changes?.find((c: any) => c.type === 'created');
        const engineId = createdChange?.event?.id ?? createdId;
        const savedPayload = getSavedEventPayload(engineId, rawEv, { id: engineId });
        if (savedPayload) onEventSave?.(savedPayload);
        setFormEvent(null);
      });
      return;
    }

    // Existing event — may be a recurring occurrence.
    applyWithRecurringCheck(
      rawEv,
      (scope: LooseValue) => ({
        type:  'update',
        id:    eventId,
        patch: {
          title:      rawEv.title      ?? '(untitled)',
          start:      newStart,
          end:        newEnd,
          allDay:     rawEv.allDay     ?? false,
          resourceId: rawEv.resource   ?? null,
          category:   rawEv.category   ?? null,
          color:      rawEv.color      ?? null,
          status:     rawEv.status     ?? 'confirmed',
          rrule:      resolvedRrule,
        },
        source: 'form',
      }),
      (result: LooseValue) => {
        // For scoped recurring ops the engine may produce multiple changes
        // (e.g. updated master + created detached occurrence). Emit onEventSave
        // for every changed/created event so the host stays fully in sync.
        if (result?.changes?.length > 1) {
          result.changes.forEach((change: LooseValue) => {
            if (change.type === 'created') {
              onEventSave?.(toLegacyEvent(change.event) as any);
            } else if (change.type === 'updated') {
              onEventSave?.(toLegacyEvent(change.after) as any);
            }
          });
        } else {
          const savedPayload = getSavedEventPayload(eventId, rawEv);
          if (savedPayload) onEventSave?.(savedPayload);
        }
        setFormEvent(null);
      },
      'Edit',
    );
  }, [applyEngineOp, applyWithRecurringCheck, getSavedEventPayload, onEventSave]);

  const handleEventMove = useCallback((ev: LooseValue, newStart: LooseValue, newEnd: LooseValue) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (scope: LooseValue) => ({ type: 'move', id, newStart, newEnd, source: 'drag' }),
      (result: LooseValue) => {
        if (onEventMove) {
          onEventMove(ev, newStart, newEnd);
        } else if (result?.changes?.length > 1) {
          result.changes.forEach((change: LooseValue) => {
            if (change.type === 'created') onEventSave?.(toLegacyEvent(change.event) as any);
            else if (change.type === 'updated') onEventSave?.(toLegacyEvent(change.after) as any);
          });
        } else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Move',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventMove, onEventSave]);

  const handleEventResize = useCallback((ev: LooseValue, newStart: LooseValue, newEnd: LooseValue) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (scope: LooseValue) => ({ type: 'resize', id, newStart, newEnd, source: 'resize' }),
      (result: LooseValue) => {
        if (onEventResize) {
          onEventResize(ev, newStart, newEnd);
        } else if (result?.changes?.length > 1) {
          result.changes.forEach((change: LooseValue) => {
            if (change.type === 'created') onEventSave?.(toLegacyEvent(change.event) as any);
            else if (change.type === 'updated') onEventSave?.(toLegacyEvent(change.after) as any);
          });
        } else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Resize',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventResize, onEventSave]);

  const handleEventGroupChange = useCallback((ev: LooseValue, patch: LooseValue) => {
    if (!patch || typeof patch !== 'object') return;
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyEngineOp(
      { type: 'group-change', id, patch, source: 'drag' },
      () => {
        if (onEventGroupChange) onEventGroupChange(ev, patch);
        else emitEventSave(id, raw, patch);
      },
    );
  }, [applyEngineOp, emitEventSave, onEventGroupChange]);

  const handleEventDelete = useCallback((id: LooseValue) => {
    // Find the event so we can check if it's recurring.
    const ev      = expandedEvents.find((e: LooseValue) => String(e.id) === String(id)) ?? { id };
    const eventId = ev._eventId ?? String(id);
    applyWithRecurringCheck(
      ev,
      (scope: LooseValue) => ({ type: 'delete', id: eventId, source: 'form' }),
      () => { onEventDelete?.(id); setFormEvent(null); },
      'Delete',
    );
  }, [applyWithRecurringCheck, expandedEvents, onEventDelete]);

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
  }, [onImport, sourceStore]);

  const handleScheduleInstantiate = useCallback((request: ScheduleDialogRequest) => {
    const startedAt = Date.now();
    const template = visibleScheduleTemplates.find(t => t.id === request.templateId);
    if (!template || !Array.isArray(template.entries) || template.entries.length === 0) {
      trackScheduleTemplateAnalytics('schedule_instantiate_failed', {
        reason: 'template-missing-or-invalid',
        templateId: request?.templateId ?? null,
      });
      return;
    }
    const anchor = request?.anchor instanceof Date ? request.anchor : new Date(request?.anchor);
    if (Number.isNaN(anchor.getTime())) {
      trackScheduleTemplateAnalytics('schedule_instantiate_failed', {
        reason: 'invalid-anchor',
        templateId: template.id,
      });
      return;
    }
    let result;
    try {
      result = instantiateScheduleTemplate(template, request);
    } catch {
      trackScheduleTemplateAnalytics('schedule_instantiate_failed', {
        reason: 'instantiate-throw',
        templateId: template.id,
      });
      return;
    }
    if (result.generated.length > resolvedScheduleLimits.createMax) {
      trackScheduleTemplateAnalytics('schedule_instantiate_failed', {
        reason: 'create-limit-exceeded',
        templateId: template.id,
        generatedCount: result.generated.length,
        createMax: resolvedScheduleLimits.createMax,
      });
      return;
    }

    result.generated.forEach((ev, index) => {
      if (ev.start == null || ev.end == null) return;
      const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const end = ev.end instanceof Date ? ev.end : new Date(ev.end);
      const templateEventId = String(ev.id ?? createId(`template-${template.id}-${index}`));
      applyEngineOp({
        type: 'create',
        event: {
          id: templateEventId,
          title: ev.title ?? '(untitled)',
          start,
          end,
          allDay: ev.allDay ?? false,
          resourceId: ev.resource ?? null,
          category: ev.category ?? null,
          color: ev.color ?? null,
          status: ev.status ?? 'confirmed',
          rrule: ev.rrule ?? null,
          exdates: ev.exdates ?? [],
          meta: ev.meta ?? {},
        },
        source: 'template',
      }, () => {
        const savedPayload = getSavedEventPayload(templateEventId, ev, { id: templateEventId });
        if (savedPayload) onEventSave?.(savedPayload);
      });
    });
    trackScheduleTemplateAnalytics('schedule_instantiate_succeeded', {
      templateId: template.id,
      generatedCount: result.generated.length,
      elapsedMs: Date.now() - startedAt,
    });
    setScheduleOpen(false);
  }, [applyEngineOp, getSavedEventPayload, onEventSave, resolvedScheduleLimits.createMax, trackScheduleTemplateAnalytics, visibleScheduleTemplates]);

  const buildSchedulePreview = useCallback((request: ScheduleDialogRequest): SchedulePreviewResult => {
    const startedAt = Date.now();
    const template = visibleScheduleTemplates.find(t => t.id === request.templateId);
    if (!template) return { generated: [], conflicts: [], error: 'Selected template was not found.' };
    if (!Array.isArray(template.entries) || template.entries.length === 0) {
      return { generated: [], conflicts: [], error: 'Selected template does not have valid entries.' };
    }

    const anchor = request?.anchor instanceof Date ? request.anchor : new Date(request?.anchor);
    if (Number.isNaN(anchor.getTime())) {
      return { generated: [], conflicts: [], error: 'Enter a valid anchor date/time.' };
    }

    let generated: CalendarEventV1[];
    try {
      generated = [...instantiateScheduleTemplate(template, { ...request, anchor }).generated];
    } catch {
      trackScheduleTemplateAnalytics('schedule_preview_failed', {
        reason: 'instantiate-throw',
        templateId: template.id,
      });
      return { generated: [], conflicts: [], error: 'Unable to build schedule preview.' };
    }

    if (generated.length > resolvedScheduleLimits.previewMax) {
      trackScheduleTemplateAnalytics('schedule_preview_failed', {
        reason: 'preview-limit-exceeded',
        templateId: template.id,
        generatedCount: generated.length,
        previewMax: resolvedScheduleLimits.previewMax,
      });
      return {
        generated: [],
        conflicts: [],
        error: `This template would generate ${generated.length} events, which exceeds the preview limit of ${resolvedScheduleLimits.previewMax}.`,
      };
    }

    const ctx = opCtxRef.current;
    const seededEvents = [...engine.state.events.values()];
    const conflicts: SchedulePreviewConflict[] = [];

    generated.forEach((ev, index) => {
      const start = ev.start instanceof Date || typeof ev.start === 'string'
        ? ev.start
        : new Date(ev.start as number);
      const end = ev.end instanceof Date || typeof ev.end === 'string'
        ? ev.end
        : new Date(ev.end as number);
      const legacy: LegacyEvent[] = [{
        id: `preview:${template.id}:${index}`,
        title: typeof ev.title === 'string' ? ev.title : '(untitled)',
        start,
        end,
        allDay: ev.allDay ?? false,
        resource: typeof ev.resource === 'string' ? ev.resource : null,
        category: typeof ev.category === 'string' ? ev.category : null,
        color: typeof ev.color === 'string' ? ev.color : null,
        status: typeof ev.status === 'string' ? ev.status : 'confirmed',
        rrule: typeof ev.rrule === 'string' ? ev.rrule : null,
        exdates: Array.isArray(ev.exdates) ? ev.exdates : [],
        meta: typeof ev.meta === 'object' && ev.meta ? ev.meta as Record<string, unknown> : {},
      }];
      const previewEvent = fromLegacyEvents(legacy)[0];
      if (previewEvent === undefined) return;
      const op = { type: 'create' as const, event: previewEvent };
      const validation = validateOperation(op, { ...ctx, events: seededEvents }, seededEvents);
      if (validation.violations.length > 0) {
        conflicts.push({
          index,
          title: ev.title ?? '(untitled)',
          severity: validation.severity,
          violations: validation.violations.map((violation) => ({
            rule: typeof violation.rule === 'string' ? violation.rule : undefined,
            message: typeof violation.message === 'string' ? violation.message : undefined,
          })),
        });
      }
      seededEvents.push(previewEvent);
    });

    trackScheduleTemplateAnalytics('schedule_preview_built', {
      templateId: template.id,
      generatedCount: generated.length,
      conflictCount: conflicts.length,
      elapsedMs: Date.now() - startedAt,
    });
    const normalizedPreview = generated.map((ev) => ({
      ...ev,
      end: ev.end instanceof Date || typeof ev.end === 'string'
        ? ev.end
        : new Date(ev.end ?? 0),
    }));
    return { generated: normalizedPreview, conflicts, error: '' };
  }, [resolvedScheduleLimits.previewMax, trackScheduleTemplateAnalytics, visibleScheduleTemplates]);

  const handleCreateScheduleTemplate = useCallback(async (template: LooseValue) => {
    if (!scheduleTemplateAdapter?.createScheduleTemplate) return;
    try {
      await scheduleTemplateAdapter.createScheduleTemplate(template);
      await reloadRemoteTemplates();
      setTemplateError('');
    } catch {
      setTemplateError('Unable to create schedule template.');
    }
  }, [reloadRemoteTemplates, scheduleTemplateAdapter]);

  const handleDeleteScheduleTemplate = useCallback(async (templateId: LooseValue) => {
    if (!scheduleTemplateAdapter?.deleteScheduleTemplate) return;
    try {
      await scheduleTemplateAdapter.deleteScheduleTemplate(templateId);
      await reloadRemoteTemplates();
      setTemplateError('');
    } catch {
      setTemplateError('Unable to delete schedule template.');
    }
  }, [reloadRemoteTemplates, scheduleTemplateAdapter]);

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

  /** Save quick display customizations from InlineEventEditor. */
  const handleInlineSave = useCallback((patch: LooseValue) => {
    const ev = inlineEditTarget?.event;
    if (!ev) return;
    const eventId = ev._eventId ?? String(ev.id);
    applyEngineOp({
      type:   'update',
      id:     eventId,
      patch:  { title: patch.title, color: patch.color, meta: patch.meta },
      source: 'inline-edit',
    }, () => {
      const savedPayload = getSavedEventPayload(eventId, ev, patch);
      if (savedPayload) onEventSave?.(savedPayload);
      setInlineEditTarget(null);
    });
  }, [inlineEditTarget, applyEngineOp, getSavedEventPayload, onEventSave]);

  // ── Context value ────────────────────────────────────────────────────────
  const ctxValue = useMemo(() => ({
    renderEvent, renderHoverCard, colorRules, businessHours, emptyState,
    permissions: perms,
    editMode,
  }), [renderEvent, renderHoverCard, colorRules, businessHours, emptyState, perms, editMode]);

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

        <AppShell
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
              <div className={styles['viewGroup']} role="group" aria-label="Calendar view">
                {VIEWS.map(v => (
                  <button
                    key={v.id}
                    className={[styles['viewBtn'], cal.view === v.id && styles['activeView']].filter(Boolean).join(' ')}
                    onClick={() => cal.setView(v.id)}
                    aria-pressed={cal.view === v.id}
                    title={v.hint}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
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
                onClearFilters={cal.clearFilters}
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
                  <button className={styles['addBtn']} onClick={() => setFormEvent({})} aria-label="Add new event">
                    <Plus size={14} aria-hidden="true" /><span className={styles['addBtnLabel']}> Add Event</span>
                  </button>
                )}
                {hasAddButton && hasScheduleTemplates && (
                  <button
                    className={styles['addBtn']}
                    onClick={() => {
                      setScheduleOpen(true);
                      trackScheduleTemplateAnalytics('schedule_dialog_opened', {
                        templateCount: visibleScheduleTemplates.length,
                      });
                    }}
                    aria-label="Add schedule from template"
                  >
                    <Plus size={14} aria-hidden="true" /><span className={styles['addBtnLabel']}> Add Schedule</span>
                  </button>
                )}
              </>}
              centerSlot={<DayWindowPills value={cal.dayWindow} onChange={cal.setDayWindow} />}
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
                <TimelineView
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
                  renderAssetBadges={renderAssetBadges}
                  onEditAssets={ownerCfg.isOwner ? () => ownerCfg.openConfigToTab('assets') : undefined}
                  onRequestAsset={canRequestAsset ? () => setAssetRequestOpen(true) : undefined}
                  approvalsConfig={ownerCfg.config?.['approvals']}
                  onApprovalAction={onApprovalAction as ((event: LooseValue, action: string) => void | Promise<void>) | undefined}
                  label={assetsLabel}
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
                  // Sync the calendar's currentDate with the dispatcher's chosen
                  // as-of moment so recurring-event expansion + fetch ranges
                  // re-anchor around it. Without this, a far-future as-of would
                  // see no overlapping events (since they were never expanded
                  // for the original currentDate range) and the row would be
                  // wrongly classified Available.
                  onAsOfChange={cal.setCurrentDate}
                />
              )}
              {cal.view === 'map' && (
                <MapView
                  events={visibleEvents as any}
                  onEventClick={handleEventClick}
                  {...(mapStyle ? { mapStyle } : {})}
                />
              )}
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
          // Filters tab
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

        {/* ── Hover card ── */}
        {selectedEvent && (
          renderHoverCard
            ? renderHoverCard(selectedEvent, () => setSelectedEvent(null))
            : (
              <HoverCard
                event={selectedEvent}
                config={ownerCfg.config}
                note={notes[selectedEvent.id]}
                onClose={() => setSelectedEvent(null)}
                onNoteSave={onNoteSave}
                onNoteDelete={onNoteDelete}
                onEdit={(ownerCfg.isOwner || perms.canEditEvent) ? handleEditFromHoverCard : null}
                anchor={null}
                resolveResourceLabel={resolveResourceLabel}
              />
            )
        )}

        {/* ── Event form ── */}
        {formEvent !== null && perms.canAddEvent && (
          <EventForm
            // Pass formEvent through (not null) for pool-seeded drafts so
            // resourcePoolId survives the form round-trip and the engine
            // resolves it at submit. New drafts without pool context keep
            // the legacy behavior: start from a blank form.
            event={formEvent.id || formEvent.resourcePoolId ? formEvent : null}
            config={ownerCfg.config}
            categories={[...eventFormCats, ...eventOptions.categories]}
            onSave={handleEventSave}
            onDelete={(onEventDelete && perms.canDeleteEvent) ? handleEventDelete : null}
            onClose={() => setFormEvent(null)}
            permissions={perms}
            onAddCategory={perms.canManageOptions ? eventOptions.addCategory : undefined}
            maintenanceRules={maintenanceRules}
          />
        )}

        {/* ── Asset request form ── */}
        {assetRequestOpen && canRequestAsset && perms.canAddEvent && (
          <AssetRequestForm
            assets={effectiveAssets}
            categories={resolvedAssetRequestCategories}
            initialStart={cal.currentDate}
            initialAssetId={undefined}
            requirementTemplates={ownerCfg.config?.['requirementTemplates'] as Record<string, { roles: { id: string; label: string }[]; requiresApproval: boolean }> | undefined}
            onSubmit={(payload: LooseValue) => {
              handleEventSave(payload);
              setAssetRequestOpen(false);
            }}
            onClose={() => setAssetRequestOpen(false)}
          />
        )}

        {/* ── Availability / PTO form ── */}
        {availabilityState && (
          <AvailabilityForm
            emp={availabilityState.emp}
            kind={availabilityState.kind}
            initialStart={availabilityState.start}
            initialEvent={availabilityState.initialEvent}
            onSave={handleAvailabilitySave}
            onClose={() => setAvailabilityState(null)}
          />
        )}

        {/* ── Schedule editor form ── */}
        {scheduleEditorState && (
          <ScheduleEditorForm
            emp={scheduleEditorState.emp}
            initialStart={scheduleEditorState.start}
            initialEnd={scheduleEditorState.end}
            onCallCategory={ownerCfg.config?.['onCallCategory'] ?? 'on-call'}
            onSave={handleScheduleEditorSave}
            onClose={() => setScheduleEditorState(null)}
          />
        )}

        {/* ── Import zone ── */}
        {importOpen && (
          <ImportZone onImport={handleImport} onClose={() => setImportOpen(false)} />
        )}

        {/* ── Schedule templates ── */}
        {scheduleOpen && (
          <ScheduleTemplateDialog
            templates={visibleScheduleTemplates}
            onPreview={buildSchedulePreview}
            onInstantiate={handleScheduleInstantiate}
            onClose={() => setScheduleOpen(false)}
          />
        )}

        {/* ── Recurring scope picker ── */}
        {recurringPrompt && (
          <RecurringScopeDialog
            actionLabel={recurringPrompt.actionLabel}
            onConfirm={recurringPrompt.onConfirm}
            onCancel={recurringPrompt.onCancel}
          />
        )}

        {/* ── Validation alert ── */}
        {pendingAlert && (
          <ValidationAlert
            violations={pendingAlert.violations}
            isHard={pendingAlert.isHard}
            onConfirm={pendingAlert.onConfirm ? () => {
              const commit = pendingAlert.onConfirm;
              setPendingAlert(null);
              commit();
            } : null}
            onCancel={() => setPendingAlert(null)}
          />
        )}

        {/* ── Owner config panel ── */}
        {ownerCfg.configOpen && (
          <ConfigPanel
            config={ownerCfg.config}
            calendarId={calendarId}
            categories={categories}
            resources={resources}
            schema={schema}
            items={expandedEvents}
            initialTab={ownerCfg.configInitialTab ?? undefined}
            initialSmartViewEditId={ownerCfg.smartViewEditId}
            onUpdate={ownerCfg.updateConfig}
            onClose={ownerCfg.closeConfig}
            onReopenSetup={showSetupLanding ? handleReopenSetup : undefined}
            onSaveView={(name, filters, opts) => savedViews.saveView(name, filters, opts)}
            savedViews={savedViews.views}
            onUpdateView={savedViews.updateView}
            onDeleteView={handleDeleteView}
            onEmployeeAdd={perms.canManagePeople ? handleEmployeeAddInternal : undefined}
            onEmployeeDelete={perms.canManagePeople ? handleEmployeeDeleteInternal : undefined}
            sources={sourceStore.sources}
            feedErrors={feedErrors}
            onAddSource={sourceStore.addSource}
            onRemoveSource={sourceStore.removeSource}
            onToggleSource={sourceStore.toggleSource}
            onUpdateSource={sourceStore.updateSource}
            scheduleTemplates={mergedScheduleTemplates}
            onCreateScheduleTemplate={ownerCfg.isOwner && !!scheduleTemplateAdapter?.createScheduleTemplate ? handleCreateScheduleTemplate : undefined}
            onDeleteScheduleTemplate={ownerCfg.isOwner && !!scheduleTemplateAdapter?.deleteScheduleTemplate ? handleDeleteScheduleTemplate : undefined}
            scheduleTemplateError={templateError}
          />
        )}

        {/* ── Keyboard shortcuts cheat sheet ── */}
        {helpOpen && <KeyboardHelpOverlay onClose={() => setHelpOpen(false)} assetsLabel={assetsLabel} />}

        {/* ── Screen reader live region ── */}
        <ScreenReaderAnnouncer ref={announcerRef} />
        </div>

        {/* ── Inline event editor (edit mode) ── */}
        {inlineEditTarget && (
          <InlineEventEditor
            key={`${inlineEditTarget.event?._eventId ?? inlineEditTarget.event?.id ?? 'inline'}-${inlineEditTarget.event?.id ?? 'event'}`}
            event={inlineEditTarget.event}
            x={inlineEditTarget.x}
            y={inlineEditTarget.y}
            onSave={handleInlineSave}
            onClose={() => setInlineEditTarget(null)}
          />
        )}
      </CalendarContext.Provider>
    </CalendarErrorBoundary>
  );
});
