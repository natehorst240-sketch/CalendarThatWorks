/**
 * WorksCalendar — main component.
 */
import {
  useState, useCallback, useEffect, useRef,
  useImperativeHandle, forwardRef, useMemo,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfDay,
  startOfWeek, endOfWeek, addDays, addWeeks, addMonths,
} from 'date-fns';
import { Bookmark, ChevronLeft, ChevronRight, Download, Filter, Plus, Settings, Sparkles, Upload } from 'lucide-react';

import { useOwnerConfig }     from './hooks/useOwnerConfig';
import { useFetchEvents }     from './hooks/useFetchEvents';
import { useSourceStore }      from './hooks/useSourceStore';
import { useSourceAggregator } from './hooks/useSourceAggregator';
import { useSavedViews } from './hooks/useSavedViews';
import type { GroupByInput } from './hooks/useNormalizedConfig.ts';
import type { SortConfig } from './types/grouping.ts';
import { sortEvents } from './core/sortEngine.ts';
import { useRealtimeEvents }  from './hooks/useRealtimeEvents';
import { usePermissions }     from './hooks/usePermissions';
import { useSavedFlash }      from './hooks/useSavedFlash';
import { useEventOptions }    from './hooks/useEventOptions';
import { useTouchSwipe }     from './hooks/useTouchSwipe';
import { CalendarContext }    from './core/CalendarContext';
import type { CalendarContextValue } from './types/ui';
import { normalizeEvents }    from './core/eventModel';
import type { ResourcePool } from './core/pools/resourcePoolSchema.ts';
import { fromLegacyEvents }   from './core/engine/adapters/fromLegacyEvents.ts';
import type { LegacyEvent }  from './core/engine/adapters/fromLegacyEvents.ts';
import type { OperationContext } from './core/engine/validation/validationTypes';
import { validateOperation } from './core/engine/validation/validateOperation.ts';
import type { AnnouncerRef } from './ui/ScreenReaderAnnouncer';
import { useCalendarEngine } from './hooks/useCalendarEngine';
import { useEventMutations } from './hooks/useEventMutations';
import { useScheduleMutations } from './hooks/useScheduleMutations';
import { useGroupingSort } from './hooks/useGroupingSort';
import { useCascadeFilters } from './hooks/useCascadeFilters';
import { useSetupLanding } from './hooks/useSetupLanding';
import { useSavedViewsManager } from './hooks/useSavedViewsManager';
import RecurringScopeDialog   from './ui/RecurringScopeDialog';
import SetupLanding, { type SetupLandingResult } from './ui/SetupLanding';
import { applyFilters, getCategories, getResources } from './filters/filterEngine';
import { resolveCssTheme, normalizeTheme, THEME_META } from './styles/themes';
import { DEFAULT_FILTER_SCHEMA, buildDefaultFilterSchema, makeResourceResolver, viewScopedSchema, type FilterField } from './filters/filterSchema';
import { SCHEDULE_WORKFLOW_CATEGORIES, isScheduleWorkflowEvent } from './core/scheduleModel';
import { useTabScopedEvents } from './hooks/useTabScopedEvents';
import { captureSavedViewFields, type ViewId } from './core/viewScope';
import { resolveLabels } from './core/config/resolveLabels';
import { buildActiveFilterPills, buildFilterSummary, hasActiveFilters, createInitialFilters, clearFilterValue } from './filters/filterState';
import { AppShell }           from './ui/AppShell';
import { AppHeader }          from './ui/AppHeader';
import { LeftRail }           from './ui/LeftRail';
import type { LeftRailAction } from './ui/LeftRail';
import { SubToolbar }         from './ui/SubToolbar';
import { DayWindowPills }     from './ui/DayWindowPills';
import { RightPanel, RightPanelSection, CrewOnShiftList } from './ui/RightPanel';
import { shiftEmployeeIdsAt } from './hooks/useShiftOverlap';
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
import SavedFlash             from './ui/SavedFlash';
import ActiveFilterStrip      from './ui/ActiveFilterStrip';
import EventForm              from './ui/EventForm';
import AssetRequestForm       from './ui/AssetRequestForm';
import ImportZone             from './ui/ImportZone';
import ScheduleTemplateDialog from './ui/ScheduleTemplateDialog';
import AvailabilityForm        from './ui/AvailabilityForm';
import ScheduleEditorForm      from './ui/ScheduleEditorForm';
import { createId } from './core/createId';
import ValidationAlert          from './ui/ValidationAlert';
import InlineEventEditor        from './ui/InlineEventEditor';
import ScreenReaderAnnouncer   from './ui/ScreenReaderAnnouncer';
import CalendarErrorBoundary   from './ui/CalendarErrorBoundary';
import MonthView              from './views/MonthView';
import WeekView               from './views/WeekView';
import DayView                from './views/DayView';
import AgendaView             from './views/AgendaView';
import ScheduleView           from './views/ScheduleView';
import AssetsView             from './views/AssetsView';
import BaseGanttView          from './views/BaseGanttView';
import DispatchView           from './views/DispatchView';
import type { DispatchMissionCandidate, DispatchMissionReadiness } from './views/DispatchView';
import RequestQueueView       from './views/RequestQueueView';
import { MapPeekWidget }      from './ui/MapPeekWidget';

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
  onViewChange?: (view: CalendarView) => void;
  onMapWidgetOpenChange?: (open: boolean) => void;
  showMapWidget?: boolean;
  enableApprovalFlowsTab?: boolean;
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
   * MapLibre style URL forwarded to the chrome-level MapPeekWidget when
   * the user opens it (panel or fullscreen). Ignored when the
   * `react-map-gl` / `maplibre-gl` peers aren't installed in the host.
   */
  mapStyle?: string;
  businessHours?: UnknownRecord;
  renderEvent?: (event: WorksCalendarEvent, context?: UnknownRecord) => ReactNode;
  renderHoverCard?: (event: WorksCalendarEvent, onClose: () => void) => ReactNode;
  renderToolbar?: (api: CalendarApi) => ReactNode;
  /** Extra icon-button actions appended to the LeftRail after the built-in
   *  Saved-views / Focus-filters / Settings buttons. Each entry has the
   *  same shape as the rail's internal actions (see `LeftRailAction` in
   *  the package's public exports): `{ id, label, icon, hint?, active?,
   *  onClick }`. Use this to surface embedder-specific shortcuts (export,
   *  notifications, custom drawers, etc.) without forking the chrome. */
  leftRailExtras?: LeftRailAction[];
  /** ReactNode appended to the RightPanel after the built-in Region map
   *  + Crew on shift sections. For visual consistency wrap your content
   *  in `<RightPanelSection title="…">…</RightPanelSection>` (also
   *  exported). Pass any number of sections; they stack vertically and
   *  inherit theme tokens. */
  rightPanelExtras?: ReactNode;
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
  /**
   * Called when the dispatcher clicks "Assign" on an available asset row.
   * Receives the asset id, the selected mission id (or null), and the
   * active as-of time. Hosts should create a booking event and call onEventSave.
   */
  onDispatchAssign?: (assetId: string, missionId: string | null, asOf: Date) => void;
  emptyState?: ReactNode;
  filterSchema?: FilterField[];
  /**
   * Optional cascade scope picker for the Focus tab of the View Controls
   * sidebar. When set, replaces the legacy condition builder with a
   * tiered multi-select picker (Region → Base → Type → …). Each tier's
   * selection becomes a filter keyed by `tier.filterField`. The library
   * stays generic — the host supplies tier definitions and option
   * resolvers from its own data.
   */
  cascadeConfig?: import('./ui/CascadePanel').CascadeConfig;
  showAddButton?: boolean;
  /**
   * Hide the event-template dropdown in the Add/Edit Event form. Hosts
   * whose domain doesn't map to the built-in templates ("Daily standup",
   * "Sprint planning", etc.) can suppress the picker entirely instead
   * of showing irrelevant options.
   */
  hideEventTemplates?: boolean;
  /**
   * Category-aware resource suggester for the Add/Edit Event form.
   * When provided, the form's resource input gets a `<datalist>`
   * scoped to the suggester's output for the currently picked
   * category. Lets hosts wire their domain knowledge (e.g.
   * "maintenance category → mechanics + aircraft only") into the
   * picker without surfacing every employee/asset for every
   * category.
   */
  eventResourceSuggestions?: (category: string) => Array<{ value: string; label: string }>;
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
  /**
   * Optional renderer for the location banner of a pool row. Pools
   * aggregate multiple resources, so the per-resource locations map
   * has no entry — the banner stays empty by default. Provide a
   * renderer if your domain has a natural aggregation (centroid,
   * dominant region, "N/A · mixed", etc.). Issue #386 item #9.
   */
  renderPoolLocation?: (pool: { id: string; memberIds: readonly string[] }) => ReactNode;
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
   *
   * `meta.sequence` is a monotonic counter scoped to this WorksCalendar
   * instance — it increments by one on every emission. Hosts that
   * persist asynchronously can compare the sequence on each callback
   * to discard out-of-order writes (e.g. a slow `fetch` PUT that
   * lands after a faster one) and avoid clobbering the latest cursor.
   */
  onPoolsChange?: (pools: ResourcePool[], meta: { sequence: number }) => void;

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

type ViewGroup = 'calendar' | 'operations';
type ViewDef = { id: ViewId; label: string; alwaysOn: boolean; hint?: string; group: ViewGroup };
const ALL_VIEWS: readonly ViewDef[] = [
  { id: 'month',    label: 'Month',    alwaysOn: true,  hint: 'Scheduled events — appointments, missions, PTO',                   group: 'calendar' },
  { id: 'week',     label: 'Week',     alwaysOn: true,  hint: 'Scheduled events by day — not staffing or on-call',                group: 'calendar' },
  { id: 'day',      label: 'Day',      alwaysOn: false,                                                                            group: 'calendar' },
  { id: 'agenda',   label: 'Agenda',   alwaysOn: false,                                                                            group: 'calendar' },
  { id: 'schedule', label: 'Schedule', alwaysOn: false, hint: 'Staffing — day/night shifts, on-call rotation, duty status',       group: 'calendar' },
  { id: 'base',     label: 'Base',     alwaysOn: false, hint: 'Gantt-style — employees, aircraft, and base events side by side', group: 'calendar' },
  { id: 'assets',   label: 'Assets',   alwaysOn: false,                                                                            group: 'operations' },
  { id: 'dispatch', label: 'Dispatch', alwaysOn: false, hint: 'Fleet readiness at a moment in time — what can launch now?',      group: 'operations' },
  { id: 'requests', label: 'Requests', alwaysOn: false, hint: 'Pending approval queue — approve, deny, or escalate requests',    group: 'operations' },
  // Map is intentionally NOT a view tab — it's an in-shell floating
  // widget mounted at the chrome level (see MapPeekWidget below). Putting
  // it on a tab forces a full workspace switch just to peek at where
  // assets are, which is the wrong tradeoff for a situational-awareness
  // surface.
];

const DEFAULT_SCHEDULE_INSTANTIATION_LIMITS = {
  previewMax: 200,
  createMax: 200,
};

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
    case 'month': {
      // MonthView renders a calendar grid that spills into the previous
      // month's tail and the next month's head (startOfWeek(monthStart)
      // → endOfWeek(monthEnd)). The fetched range needs to match the grid,
      // not just the calendar month — otherwise events that fall on
      // visible spillover days (e.g. May 1-2 in an April grid) are
      // dropped before reaching the view and silently disappear.
      const monthStart = startOfMonth(date);
      const monthEnd   = endOfMonth(date);
      return {
        start: startOfWeek(monthStart, { weekStartsOn: weekStartDay }),
        end:   endOfWeek(monthEnd,     { weekStartsOn: weekStartDay }),
      };
    }
    default: // agenda, schedule (timeline), assets
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
  const [selectedEvent,  setSelectedEvent]  = useState<LooseValue | null>(null);
  const [formEvent,        setFormEvent]        = useState<LooseValue | null>(null);
  // Conflict highlights (#424 week 2). Populated by EventForm's live
  // conflict check via `onLiveConflictsChange`; passed through
  // CalendarContext so each view can paint a red outline on the
  // events the proposed draft overlaps. Empty set = no highlights.
  const [conflictingEventIds, setConflictingEventIds] = useState<ReadonlySet<string>>(() => new Set());
  // Stable callback so EventForm's `useEffect([onLiveConflictsChange])`
  // doesn't refire every parent render (which would feed an infinite
  // setState loop through the EVENT_FORM ⇄ WORKS_CALENDAR boundary).
  // The functional setter also short-circuits identical id sets so the
  // calendar stays still when only unrelated state changes.
  const handleLiveConflicts = useCallback((ids: readonly string[] | null) => {
    setConflictingEventIds(prev => {
      if (!ids || ids.length === 0) {
        return prev.size === 0 ? prev : new Set();
      }
      if (prev.size === ids.length) {
        let same = true;
        for (const id of ids) if (!prev.has(id)) { same = false; break; }
        if (same) return prev;
      }
      return new Set(ids);
    });
  }, []);
  const [assetRequestOpen, setAssetRequestOpen] = useState(false);
  const [importOpen,       setImportOpen]       = useState(false);
  // Transient confirmation that the host's import landed; the dialog
  // itself closes immediately so without this users can't tell whether
  // anything happened beyond "the modal disappeared".
  const [importMsg,        setImportMsg]        = useState('');
  const importFlash                              = useSavedFlash(2500);
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

    const ctx = {
      businessHours:  ownerCfg.config?.['businessHours'] ?? businessHours ?? null,
      blockedWindows: blockedWindows ?? [],
    } as unknown as OperationContext;
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

        {/* ── Hover card ── */}
        {selectedEvent && (
          (renderHoverCard && renderHoverCard(selectedEvent, () => setSelectedEvent(null))) ?? (
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
            onClose={() => { setFormEvent(null); handleLiveConflicts(null); }}
            permissions={perms}
            onAddCategory={perms.canManageOptions ? eventOptions.addCategory : undefined}
            maintenanceRules={maintenanceRules}
            onCheckConflicts={checkEventConflicts}
            onLiveConflictsChange={handleLiveConflicts}
            approvalCategories={Array.isArray(assetRequestCategories) ? assetRequestCategories : []}
            pools={rawPools ?? []}
            hideTemplates={hideEventTemplates}
            resourceSuggestions={eventResourceSuggestions}
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
              if (commit) commit();
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
            isFetchingFeeds={isFetchingFeeds}
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
            onDelete={onEventDelete ? handleInlineDelete : undefined}
            onClose={() => setInlineEditTarget(null)}
          />
        )}
      </CalendarContext.Provider>
    </CalendarErrorBoundary>
  );
});
