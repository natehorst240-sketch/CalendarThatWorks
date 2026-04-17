/**
 * WorksCalendar — main component.
 */
import {
  useState, useCallback, useEffect, useRef, useReducer,
  useImperativeHandle, forwardRef, useMemo,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import {
  format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Plus, Sparkles, Upload } from 'lucide-react';

import { useCalendar }        from './hooks/useCalendar.js';
import { useOwnerConfig }     from './hooks/useOwnerConfig.js';
import { useFetchEvents }     from './hooks/useFetchEvents.js';
import { useSourceStore }      from './hooks/useSourceStore.js';
import { useSourceAggregator } from './hooks/useSourceAggregator.js';
import { useSavedViews, deserializeFilters } from './hooks/useSavedViews.js';
import type { GroupByInput } from './hooks/useNormalizedConfig.ts';
import type { SortConfig } from './types/grouping.ts';
import { sortEvents } from './core/sortEngine.ts';
import { useRealtimeEvents }  from './hooks/useRealtimeEvents.js';
import { usePermissions }     from './hooks/usePermissions.js';
import { useEventOptions }    from './hooks/useEventOptions.js';
import { useTouchSwipe }     from './hooks/useTouchSwipe.js';
import { CalendarContext }    from './core/CalendarContext.js';
import { normalizeEvents }    from './core/eventModel.js';
import { CalendarEngine }     from './core/engine/CalendarEngine.ts';
import { UndoRedoManager }   from './core/engine/UndoRedoManager.ts';
import { fromLegacyEvents }   from './core/engine/adapters/fromLegacyEvents.ts';
import { occurrenceToLegacy, toLegacyEvent } from './core/engine/adapters/toLegacyEvents.ts';
import { validateOperation } from './core/engine/validation/validateOperation.ts';
import RecurringScopeDialog   from './ui/RecurringScopeDialog.jsx';
import { applyFilters, getCategories, getResources } from './filters/filterEngine.js';
import { DEFAULT_FILTER_SCHEMA } from './filters/filterSchema.js';
import { buildActiveFilterPills, buildFilterSummary } from './filters/filterState.js';
import FilterBar              from './ui/FilterBar.jsx';
import ProfileBar             from './ui/ProfileBar.jsx';
import HoverCard              from './ui/HoverCard.jsx';
import OwnerLock              from './ui/OwnerLock.jsx';
import ConfigPanel            from './ui/ConfigPanel.jsx';
import EventForm              from './ui/EventForm.jsx';
import ImportZone             from './ui/ImportZone.jsx';
import ScheduleTemplateDialog from './ui/ScheduleTemplateDialog.jsx';
import AvailabilityForm        from './ui/AvailabilityForm.jsx';
import ScheduleEditorForm      from './ui/ScheduleEditorForm.jsx';
import { detectShiftConflicts, buildOpenShiftEvent } from './core/scheduleOverlap.js';
import {
  buildCoverageMeta,
  buildOpenShiftPatch,
  buildShiftStatusMeta,
  findLinkedMirroredCoverage,
  findLinkedOpenShifts,
  resolveEventId,
} from './core/scheduleMutations.js';
import {
  normalizeScheduleKind,
  SCHEDULE_KINDS,
} from './core/scheduleModel.js';
import { createId } from './core/createId.js';
import ValidationAlert          from './ui/ValidationAlert.jsx';
import InlineEventEditor        from './ui/InlineEventEditor.jsx';
import ScreenReaderAnnouncer   from './ui/ScreenReaderAnnouncer.jsx';
import CalendarErrorBoundary   from './ui/CalendarErrorBoundary.jsx';
import MonthView              from './views/MonthView.jsx';
import WeekView               from './views/WeekView.jsx';
import DayView                from './views/DayView.jsx';
import AgendaView             from './views/AgendaView.jsx';
import TimelineView           from './views/TimelineView.jsx';
import { canViewScheduleTemplate, instantiateScheduleTemplate } from './api/v1/templates.ts';

import styles from './WorksCalendar.module.css';
import { customThemeToCssVars } from './core/themeSchema.js';

export type WorksCalendarEvent = Record<string, unknown>;
export type CalendarView = 'month' | 'week' | 'day' | 'agenda' | 'schedule';
export type CalendarRole = 'admin' | 'user' | 'readonly';

export type ScheduleInstantiationLimits = {
  previewMax?: number;
  createMax?: number;
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
  icalFeeds?: Array<Record<string, unknown>>;
  onImport?: (events: WorksCalendarEvent[]) => void;
  scheduleTemplates?: Array<Record<string, unknown>>;
  scheduleTemplateAdapter?: Record<string, unknown>;
  scheduleInstantiationLimits?: ScheduleInstantiationLimits;
  onScheduleTemplateAnalytics?: (payload: Record<string, unknown>) => void;
  calendarId?: string;
  ownerPassword?: string;
  onConfigSave?: (config: Record<string, unknown>) => void;
  devMode?: boolean;
  notes?: Record<string, unknown>;
  onNoteSave?: (note: Record<string, unknown>) => void;
  onNoteDelete?: (noteId: string) => void;
  onEventClick?: (event: WorksCalendarEvent) => void;
  onEventSave?: (event: WorksCalendarEvent) => void;
  onEventMove?: (event: WorksCalendarEvent, newStart: Date, newEnd: Date) => void;
  onEventResize?: (event: WorksCalendarEvent, newStart: Date, newEnd: Date) => void;
  onEventDelete?: (eventId: string) => void;
  onEventGroupChange?: (event: WorksCalendarEvent, patch: Record<string, unknown>) => void;
  onDateSelect?: (start: Date, end: Date) => void;
  supabaseUrl?: string;
  supabaseKey?: string;
  supabaseTable?: string;
  supabaseFilter?: string;
  role?: CalendarRole;
  employees?: Array<Record<string, unknown>>;
  onEmployeeAdd?: (...args: unknown[]) => void;
  onEmployeeDelete?: (...args: unknown[]) => void;
  blockedWindows?: Array<Record<string, unknown>>;
  theme?: string;
  colorRules?: Array<Record<string, unknown>>;
  businessHours?: Record<string, unknown>;
  renderEvent?: (...args: unknown[]) => ReactNode;
  renderHoverCard?: (...args: unknown[]) => ReactNode;
  renderToolbar?: (api: CalendarApi) => ReactNode;
  renderFilterBar?: (...args: unknown[]) => ReactNode;
  renderSavedViewsBar?: (...args: unknown[]) => ReactNode;
  emptyState?: ReactNode;
  filterSchema?: Array<Record<string, unknown>>;
  showAddButton?: boolean;
  initialView?: CalendarView;
  weekStartDay?: 0 | 1;
  groupBy?: GroupByInput;
  sort?: SortConfig | SortConfig[];
  showAllGroups?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Human-readable announcement text for a completed engine operation. */
function opAnnouncement(op) {
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

const VIEWS = [
  { id: 'month',    label: 'Month'    },
  { id: 'week',     label: 'Week'     },
  { id: 'day',      label: 'Day'      },
  { id: 'agenda',   label: 'Agenda'   },
  { id: 'schedule', label: 'Schedule' },
];

const DEFAULT_SCHEDULE_INSTANTIATION_LIMITS = {
  previewMax: 200,
  createMax: 200,
};
let exportToExcelFn = null;

async function exportVisibleEvents(events) {
  if (!exportToExcelFn) {
    ({ exportToExcel: exportToExcelFn } = await import('./export/excelExport.js'));
  }
  return exportToExcelFn(events);
}

/** Compute the visible [start, end] range for a given view + date. */
function viewRange(view, date, weekStartDay = 0) {
  switch (view) {
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: weekStartDay }), end: endOfWeek(date, { weekStartsOn: weekStartDay }) };
    case 'day':
      return { start: date, end: addDays(date, 1) };
    default: // month, agenda, schedule (timeline)
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
    emptyState,

    // ── Filter schema (pass a custom FilterField[] to extend or replace defaults) ──
    filterSchema,

    // ── UI toggles ──
    showAddButton           = false,

    // ── Initial view (overrides saved config on first render) ──
    initialView,

    // ── Week start day (prop takes priority over owner config) ──
    weekStartDay: weekStartDayProp,

    // ── Grouping ──
    groupBy,
    sort,
    showAllGroups,
  }: WorksCalendarProps,
  ref: ForwardedRef<CalendarApi>,
) {
  // SSR guard: avoid touching browser-only APIs during server rendering.
  if (typeof window === 'undefined') return null;

  // ── View / date / filter state ───────────────────────────────────────────
  const schema   = filterSchema ?? DEFAULT_FILTER_SCHEMA;
  const cal      = useCalendar([], initialView ?? 'month', schema);
  const ownerCfg = useOwnerConfig({ calendarId, ownerPassword, onConfigSave, devMode });
  const weekStartDay = weekStartDayProp ?? ownerCfg.config?.display?.weekStartDay ?? 0;
  const customThemeVars = useMemo(() => customThemeToCssVars(ownerCfg.config?.customTheme), [ownerCfg.config?.customTheme]);
  const effectiveTheme = theme || ownerCfg.config?.setup?.preferredTheme || 'light';
  const calendarTitle = ownerCfg.config?.title || 'My WorksCalendar';
  // Merge parent's employees prop with owner-config team.members so edits
  // made from the Settings → Employees tab (e.g. renaming a member) are
  // reflected live in the schedule, even when the parent's prop is stale.
  // Config entries take precedence for matching ids; parent-only entries
  // (not yet mirrored into config) are preserved.
  const configuredEmployees = useMemo(() => {
    const configMembers = ownerCfg.config?.team?.members ?? [];
    const parentMembers = Array.isArray(employees) ? employees : [];
    if (configMembers.length === 0) return parentMembers;
    if (parentMembers.length === 0) return configMembers;
    const configById = new Map(configMembers.map((m) => [String(m.id), m]));
    const parentOnly = parentMembers.filter((m) => !configById.has(String(m.id)));
    return [...configMembers, ...parentOnly];
  }, [employees, ownerCfg.config?.team?.members]);

  // Wrap parent employee handlers so edits from ANY surface (timeline add-form
  // or TeamTab settings) flow both to the consumer's state AND to the owner
  // config. Keeps TeamTab and the live schedule in sync. See issue #101.
  const handleEmployeeAddInternal = useCallback((member) => {
    ownerCfg.updateConfig(c => {
      const existing = c.team?.members ?? [];
      if (existing.some(m => String(m.id) === String(member.id))) return c;
      return {
        ...c,
        team: { ...(c.team ?? {}), members: [...existing, member] },
        setup: { ...(c.setup ?? {}), completed: true },
      };
    });
    onEmployeeAdd?.(member);
  }, [ownerCfg.updateConfig, onEmployeeAdd]);

  const handleEmployeeDeleteInternal = useCallback((id) => {
    ownerCfg.updateConfig(c => ({
      ...c,
      team: { ...(c.team ?? {}), members: (c.team?.members ?? []).filter(m => String(m.id) !== String(id)) },
    }));
    onEmployeeDelete?.(id);
  }, [ownerCfg.updateConfig, onEmployeeDelete]);

  // Honor defaultView from owner config (applied once after config loads)
  const defaultViewApplied = useRef(false);
  useEffect(() => {
    const defaultView = ownerCfg.config?.display?.defaultView;
    if (defaultView && !defaultViewApplied.current) {
      defaultViewApplied.current = true;
      cal.setView(defaultView);
    }
  }, [ownerCfg.config?.display?.defaultView]);

  // ── Permissions ──────────────────────────────────────────────────────────
  const perms = usePermissions(role);

  // ── Admin-managed event options (categories) ─────────────────────────────
  const eventOptions = useEventOptions(calendarId);

  // ── Saved view active state ──────────────────────────────────────────────
  const [savedViewActiveId, setSavedViewActiveId] = useState(null);
  const [savedViewDirty,    setSavedViewDirty]    = useState(false);
  const skipDirtyRef = useRef(false);
  const savedViews = useSavedViews(calendarId);

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

  // Mark dirty when filters/view/groupBy/sort/showAllGroups change after a saved view was applied
  // Use a ref to skip the first effect run immediately after applying
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    if (savedViewActiveId)    setSavedViewDirty(true);
  }, [cal.filters, cal.view, activeGroupBy, activeSort, activeShowAllGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyView = useCallback((savedView) => {
    skipDirtyRef.current = true;
    cal.replaceFilters(deserializeFilters(savedView.filters, schema));
    if (savedView.view) cal.setView(savedView.view);
    setActiveGroupBy(savedView.groupBy ?? null);
    setActiveSort(Array.isArray(savedView.sort) ? savedView.sort : null);
    setActiveShowAllGroups(!!savedView.showAllGroups);
    setSavedViewActiveId(savedView.id);
    setSavedViewDirty(false);
  }, [cal, schema]);

  const handleDeleteView = useCallback((id) => {
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
  const [supabaseClient, setSupabaseClient] = useState(null);
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
    const noId = [];
    [...rawEvents, ...fetchedEvents, ...sourceEvents, ...realtimeEvents].forEach(ev => {
      if (ev.id != null) map.set(String(ev.id), ev);
      else noId.push(ev);
    });
    return normalizeEvents([...map.values(), ...noId]);
  }, [rawEvents, fetchedEvents, sourceEvents, realtimeEvents]);

  // ── CalendarEngine — single source of truth for mutations & expansions ───
  const engineRef      = useRef(null);
  const undoManagerRef = useRef(null);
  const announcerRef   = useRef(null);
  if (engineRef.current === null) {
    engineRef.current = new CalendarEngine();
    undoManagerRef.current = new UndoRedoManager(engineRef.current, { maxSize: 50 });
  }

  // Version counter: increments whenever the engine emits a state change.
  const [engineVer, tickEngine] = useReducer(n => n + 1, 0);
  useEffect(() => engineRef.current.subscribe(() => tickEngine()), []);

  // Keep engine in sync with the merged+normalized event list from all sources.
  // Clear undo history on a full reload so stale entries can't reference
  // events that no longer exist.
  useEffect(() => {
    engineRef.current.setEvents(fromLegacyEvents(allNormalized));
    undoManagerRef.current.clear();
  }, [allNormalized]);

  // ── Expand recurring events within the visible range (via engine) ────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expandedEvents = useMemo(
    () => engineRef.current.getOccurrencesInRange(range.start, range.end).map(occurrenceToLegacy),
    [engineVer, range],
  );

  // ── Derive categories / resources / filtered events ──────────────────────
  // Categories that belong exclusively to the schedule/employee workflow —
  // they are managed through the EmployeeActionCard, not the generic EventForm.
  const SCHEDULE_ONLY_CATS = new Set(['pto', 'PTO', 'unavailable', 'Unavailable', 'open-shift', 'availability', 'Availability']);

  const categories    = useMemo(() => getCategories(expandedEvents), [expandedEvents]);
  const eventFormCats = useMemo(
    () => categories.filter(c => !SCHEDULE_ONLY_CATS.has(c)),
    [categories],
  );
  const resources     = useMemo(() => getResources(expandedEvents),  [expandedEvents]);
  const filteredEvents = useMemo(
    () => applyFilters(expandedEvents, cal.filters, schema),
    [expandedEvents, cal.filters, schema],
  );
  const visibleEvents = useMemo(
    () => (activeSort && activeSort.length > 0
      ? sortEvents(filteredEvents, activeSort)
      : filteredEvents),
    [filteredEvents, activeSort],
  );

  // ── Mutation pipeline (engine-authoritative) ─────────────────────────────
  // Stable ref so applyEngineOp closure never goes stale.
  const opCtxRef = useRef(null);
  opCtxRef.current = {
    businessHours:  ownerCfg.config?.businessHours ?? businessHours ?? null,
    blockedWindows: blockedWindows ?? [],
  };

  const [pendingAlert,      setPendingAlert]      = useState(null); // { violations, isHard, onConfirm }
  // { op, occurrenceDate, onAccepted, actionLabel } — set when a recurring event edit needs a scope choice
  const [recurringPrompt, setRecurringPrompt] = useState(null);

  const applyEngineOp = useCallback((op, onAccepted) => {
    const engine  = engineRef.current;
    const undoMgr = undoManagerRef.current;
    const ctx     = opCtxRef.current;

    // Pre-capture the state BEFORE mutation. We only record this to the undo
    // stack on acceptance to keep the history free of rejected operations.
    const preSnap = undoMgr.captureSnapshot();

    const result = engine.applyMutation(op, ctx);

    if (result.status === 'accepted' || result.status === 'accepted-with-warnings') {
      // State has changed — record the pre-mutation snapshot.
      undoMgr.record(preSnap, op.type);
      announcerRef.current?.announce(opAnnouncement(op));
      onAccepted();

    } else if (result.status === 'pending-confirmation') {
      // Engine state is UNCHANGED at this point (pending means no commit yet).
      // preSnap is still accurate as the pre-mutation snapshot.
      setPendingAlert({
        violations: result.validation.violations,
        isHard: false,
        onConfirm: () => {
          const confirmed = engine.applyMutation(op, ctx, { overrideSoftViolations: true });
          if (confirmed.status === 'accepted' || confirmed.status === 'accepted-with-warnings') {
            undoMgr.record(preSnap, op.type);
            announcerRef.current?.announce(opAnnouncement(op));
            onAccepted();
          }
        },
      });

    } else {
      // Rejected — state unchanged, nothing to record.
      setPendingAlert({ violations: result.validation.violations, isHard: true, onConfirm: null });
    }
  }, []); // stable — reads from refs

  // ── Local UI state ───────────────────────────────────────────────────────
  const [selectedEvent,  setSelectedEvent]  = useState(null);
  const [formEvent,        setFormEvent]        = useState(null);
  const [importOpen,       setImportOpen]       = useState(false);
  const [scheduleOpen,     setScheduleOpen]     = useState(false);
  // { emp: { id, name, role? }, kind: 'pto' | 'unavailable' | 'availability', start?: Date, initialEvent?: object | null }
  const [availabilityState, setAvailabilityState] = useState(null);
  // { emp: { id, name, role? }, start?: Date, end?: Date }
  const [scheduleEditorState, setScheduleEditorState] = useState(null);
  const [pillHoverTitle, setPillHoverTitle] = useState(false);
  const [editMode,         setEditMode]         = useState(false);
  // { event, x, y } — set when an event is clicked in edit mode
  const [inlineEditTarget, setInlineEditTarget] = useState(null);
  // Capture last click coords so InlineEventEditor can position near the pill
  const lastClickCoordsRef = useRef({ x: 0, y: 0 });
  const editModeRef = useRef(false);
  editModeRef.current = editMode;
  const [remoteTemplates, setRemoteTemplates] = useState([]);
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

  const trackScheduleTemplateAnalytics = useCallback((event, payload = {}) => {
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
    const onKeyDown = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      // Undo: Ctrl+Z / Cmd+Z
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const did = undoManagerRef.current.undo();
        if (did) announcerRef.current?.announce('Undo.');
        return;
      }
      // Redo: Ctrl+Y / Cmd+Y  or  Ctrl+Shift+Z / Cmd+Shift+Z
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        const did = undoManagerRef.current.redo();
        if (did) announcerRef.current?.announce('Redo.');
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── CalendarApi / imperative handle ─────────────────────────────────────
  const api = useMemo(() => ({
    navigateTo:       (date) => cal.setCurrentDate(date),
    setView:          (view) => cal.setView(view),
    goToToday:        ()     => cal.goToToday(),
    openEvent:        (id)   => {
      const ev = expandedEvents.find(e => e.id === id);
      if (ev) setSelectedEvent(ev);
    },
    getVisibleEvents: ()     => visibleEvents,
    clearFilters:     ()     => cal.clearFilters(),
    addEvent:         (d={}) => setFormEvent(d),
    undo:             ()     => undoManagerRef.current.undo(),
    redo:             ()     => undoManagerRef.current.redo(),
    get canUndo()            { return undoManagerRef.current?.canUndo ?? false; },
    get canRedo()            { return undoManagerRef.current?.canRedo ?? false; },
  }), [cal, expandedEvents, visibleEvents]);

  useImperativeHandle(ref, () => api, [api]);

  // ── Callbacks ────────────────────────────────────────────────────────────
  const handleEventClick = useCallback((ev) => {
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

  const getSavedEventPayload = useCallback((eventId, fallbackEvent = null, fallbackPatch = null) => {
    const normalizedId = eventId == null ? '' : String(eventId);
    if (normalizedId) {
      const saved = engineRef.current.state.events.get(normalizedId);
      if (saved) return toLegacyEvent(saved);
    }
    if (!fallbackEvent) return null;
    return fallbackPatch ? { ...fallbackEvent, ...fallbackPatch } : fallbackEvent;
  }, []);

  const emitEventSave = useCallback((eventId, fallbackEvent = null, fallbackPatch = null) => {
    const savedPayload = getSavedEventPayload(eventId, fallbackEvent, fallbackPatch);
    if (savedPayload) onEventSave?.(savedPayload);
  }, [getSavedEventPayload, onEventSave]);

  const handleShiftStatusChange = useCallback((ev, status) => {
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

  const handleCoverageAssign = useCallback((ev, coveringEmployeeId) => {
    const eventId = resolveEventId(ev);
    if (!eventId) return;
    const normalizedCoveringEmployeeId = String(coveringEmployeeId ?? '');
    if (!normalizedCoveringEmployeeId) return;

    const openShiftCandidates = findLinkedOpenShifts(expandedEvents, ev);
    const primaryOpenShift = openShiftCandidates[0] ?? null;

    // 1. Mark the shift as covered
    const newMeta = buildCoverageMeta(ev, normalizedCoveringEmployeeId, resolveEventId(primaryOpenShift));
    applyEngineOp(
      { type: 'update', id: eventId, patch: { meta: newMeta }, source: 'api' },
      () => emitEventSave(eventId, ev, { meta: newMeta }),
    );

    // 2. If there is a linked open-shift record, mark it as covered too
    if (primaryOpenShift) {
      const [openShiftEv, ...duplicateOpenShifts] = openShiftCandidates;
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

    const mirroredCoverage = findLinkedMirroredCoverage(expandedEvents, ev);
    mirroredCoverage.slice(1).forEach((duplicateEv) => {
      const duplicateId = resolveEventId(duplicateEv);
      if (!duplicateId) return;
      applyEngineOp({ type: 'delete', id: duplicateId, source: 'api' }, () => onEventDelete?.(duplicateId));
    });

    // 3. Create or update the mirrored on-call event on the covering employee's row
    const onCallCat = ownerCfg.config?.onCallCategory ?? 'on-call';
    const mirroredPatch = {
      title:    `Covering: ${ev.title ?? 'Shift'}`,
      start:    ev.start instanceof Date ? ev.start : new Date(ev.start),
      end:      ev.end   instanceof Date ? ev.end   : new Date(ev.end),
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
  }, [applyEngineOp, emitEventSave, expandedEvents, onEventDelete, ownerCfg.config?.onCallCategory]);

  /**
   * Handle employee action card clicks.
   * - 'pto' | 'unavailable' | 'availability' → opens AvailabilityForm
   * - 'schedule' → opens ScheduleEditorForm
   * All actions also bubble to the external onEmployeeAction prop.
   */
  const handleEmployeeAction = useCallback((empId, actionInput) => {
    const emp = configuredEmployees.find(e => String(e.id) === String(empId)) ?? { id: empId, name: empId };
    const actionPayload = typeof actionInput === 'string'
      ? { type: actionInput }
      : (actionInput ?? {});
    const action = actionPayload.type;
    if (!action) return;
    const AVAILABILITY_ACTIONS = new Set(['pto', 'unavailable', 'availability']);
    if (AVAILABILITY_ACTIONS.has(action)) {
      const initialEvent = action === 'availability'
        ? expandedEvents
          .filter((ev) => {
            const evKind = normalizeScheduleKind(ev?.kind ?? ev?.meta?.kind);
            const evCat  = String(ev?.category ?? '').toLowerCase();
            const resourceId = String(ev?.resource ?? ev?.resourceId ?? ev?.employeeId ?? '');
            return resourceId === String(empId) && (evKind === 'availability' || evCat === 'availability');
          })
          .sort((a, b) => {
            const aStart = a?.start ? new Date(a.start).getTime() : 0;
            const bStart = b?.start ? new Date(b.start).getTime() : 0;
            return bStart - aStart;
          })
          .map((ev) => ({ ...ev, id: ev?._eventId ?? ev?.id }))[0] ?? null
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
  const handleAvailabilitySave = useCallback((availEv) => {
    const existingAvailability = expandedEvents.find(
      (ev) => String(ev._eventId ?? ev.id) === String(availEv.id),
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
      const onCallCat = ownerCfg.config?.onCallCategory ?? 'on-call';
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
            () => emitEventSave(openShift.id, openShift),
          );
        }

        // Mark the original shift as needing coverage
        const updatedMeta = {
          ...(shiftEv.meta ?? {}),
          shiftStatus: availEv.kind,   // 'pto' | 'unavailable'
          openShiftId: openShift.id,
          coveredBy:   null,
        };
        applyEngineOp(
          { type: 'update', id: shiftId, patch: { meta: updatedMeta }, source: 'api' },
          () => emitEventSave(shiftId, shiftEv, { meta: updatedMeta }),
        );
      });
    }

    setAvailabilityState(null);
  }, [applyEngineOp, emitEventSave, getSavedEventPayload, onAvailabilitySave, onEventDelete, expandedEvents, ownerCfg.config?.onCallCategory]);

  /** Save one or more shift events (from ScheduleEditorForm) through the engine. */
  const handleScheduleEditorSave = useCallback((shiftEvOrArr) => {
    const events = Array.isArray(shiftEvOrArr) ? shiftEvOrArr : [shiftEvOrArr];
    events.forEach((ev, index) => {
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
  const applyWithRecurringCheck = useCallback((ev, makeOp, onAccepted, actionLabel) => {
    if (!ev._recurring) {
      applyEngineOp(makeOp('series'), onAccepted);
      return;
    }
    setRecurringPrompt({
      actionLabel,
      onConfirm: (scope) => {
        setRecurringPrompt(null);
        applyEngineOp(
          { ...makeOp(scope), scope, occurrenceDate: ev.start instanceof Date ? ev.start : new Date(ev.start) },
          onAccepted,
        );
      },
      onCancel: () => setRecurringPrompt(null),
    });
  }, [applyEngineOp]);

  const handleEventSave = useCallback((rawEv) => {
    const newStart = rawEv.start instanceof Date ? rawEv.start : new Date(rawEv.start);
    const newEnd   = rawEv.end   instanceof Date ? rawEv.end   : new Date(rawEv.end);
    // _eventId is present on occurrences from the engine; fall back to id for
    // legacy shapes passed directly (e.g. from the EventForm).
    const eventId  = rawEv._eventId ?? (rawEv.id ? String(rawEv.id) : null);

    if (!eventId) {
      // New event — no scope picker needed.
      const createdId = String(rawEv.id ?? createId('event'));
      const op = {
        type:  'create',
        event: {
          id:         createdId,
          title:      rawEv.title      ?? '(untitled)',
          start:      newStart,
          end:        newEnd,
          allDay:     rawEv.allDay     ?? false,
          resourceId: rawEv.resource   ?? null,
          category:   rawEv.category   ?? null,
          color:      rawEv.color      ?? null,
          status:     rawEv.status     ?? 'confirmed',
          rrule:      rawEv.rrule      ?? null,
          exdates:    rawEv.exdates    ?? [],
        },
        source: 'form',
      };
      applyEngineOp(op, () => {
        const savedPayload = getSavedEventPayload(createdId, rawEv, { id: createdId });
        if (savedPayload) onEventSave?.(savedPayload);
        setFormEvent(null);
      });
      return;
    }

    // Existing event — may be a recurring occurrence.
    applyWithRecurringCheck(
      rawEv,
      (scope) => ({
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
          rrule:      rawEv.rrule      ?? null,
        },
        source: 'form',
      }),
      () => {
        const savedPayload = getSavedEventPayload(eventId, rawEv);
        if (savedPayload) onEventSave?.(savedPayload);
        setFormEvent(null);
      },
      'Edit',
    );
  }, [applyEngineOp, applyWithRecurringCheck, getSavedEventPayload, onEventSave]);

  const handleEventMove = useCallback((ev, newStart, newEnd) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (scope) => ({ type: 'move', id, newStart, newEnd, source: 'drag' }),
      () => {
        if (onEventMove) onEventMove(ev, newStart, newEnd);
        else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Move',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventMove, onEventSave]);

  const handleEventResize = useCallback((ev, newStart, newEnd) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (scope) => ({ type: 'resize', id, newStart, newEnd, source: 'resize' }),
      () => {
        if (onEventResize) onEventResize(ev, newStart, newEnd);
        else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Resize',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventResize, onEventSave]);

  const handleEventGroupChange = useCallback((ev, patch) => {
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

  const handleEventDelete = useCallback((id) => {
    // Find the event so we can check if it's recurring.
    const ev      = expandedEvents.find(e => String(e.id) === String(id)) ?? { id };
    const eventId = ev._eventId ?? String(id);
    applyWithRecurringCheck(
      ev,
      (scope) => ({ type: 'delete', id: eventId, source: 'form' }),
      () => { onEventDelete?.(id); setFormEvent(null); },
      'Delete',
    );
  }, [applyWithRecurringCheck, expandedEvents, onEventDelete]);

  const handleImport = useCallback((imported, meta) => {
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

  const handleScheduleInstantiate = useCallback((request) => {
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

  const buildSchedulePreview = useCallback((request) => {
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

    let generated;
    try {
      generated = instantiateScheduleTemplate(template, { ...request, anchor }).generated;
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
    const seededEvents = [...engineRef.current.state.events.values()];
    const conflicts = [];

    generated.forEach((ev, index) => {
      const legacy = [{
        id: `preview:${template.id}:${index}`,
        title: ev.title ?? '(untitled)',
        start: ev.start,
        end: ev.end,
        allDay: ev.allDay ?? false,
        resource: ev.resource ?? null,
        category: ev.category ?? null,
        color: ev.color ?? null,
        status: ev.status ?? 'confirmed',
        rrule: ev.rrule ?? null,
        exdates: ev.exdates ?? [],
        meta: ev.meta ?? {},
      }];
      const previewEvent = fromLegacyEvents(legacy)[0];
      const op = { type: 'create', event: previewEvent };
      const validation = validateOperation(op, { ...ctx, events: seededEvents }, seededEvents);
      if (validation.violations.length > 0) {
        conflicts.push({
          index,
          title: ev.title ?? '(untitled)',
          severity: validation.severity,
          violations: validation.violations,
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
    return { generated, conflicts, error: '' };
  }, [resolvedScheduleLimits.previewMax, trackScheduleTemplateAnalytics, visibleScheduleTemplates]);

  const handleCreateScheduleTemplate = useCallback(async (template) => {
    if (!scheduleTemplateAdapter?.createScheduleTemplate) return;
    try {
      await scheduleTemplateAdapter.createScheduleTemplate(template);
      await reloadRemoteTemplates();
      setTemplateError('');
    } catch {
      setTemplateError('Unable to create schedule template.');
    }
  }, [reloadRemoteTemplates, scheduleTemplateAdapter]);

  const handleDeleteScheduleTemplate = useCallback(async (templateId) => {
    if (!scheduleTemplateAdapter?.deleteScheduleTemplate) return;
    try {
      await scheduleTemplateAdapter.deleteScheduleTemplate(templateId);
      await reloadRemoteTemplates();
      setTemplateError('');
    } catch {
      setTemplateError('Unable to delete schedule template.');
    }
  }, [reloadRemoteTemplates, scheduleTemplateAdapter]);

  const handleEditFromHoverCard = useCallback((ev) => {
    setSelectedEvent(null);
    setFormEvent(ev._raw ?? ev);
  }, []);

  /** Save quick display customizations from InlineEventEditor. */
  const handleInlineSave = useCallback((patch) => {
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

  const swipeAreaRef = useRef(null);
  const swipeNavigationEnabled = cal.view === 'month' || cal.view === 'schedule';
  useTouchSwipe({
    targetRef: swipeAreaRef,
    enabled: swipeNavigationEnabled,
    onSwipeLeft: () => cal.navigate(1),
    onSwipeRight: () => cal.navigate(-1),
  });

  const hasAddButton = (showAddButton || ownerCfg.isOwner || devMode) && perms.canAddEvent;
  const hasScheduleTemplates = Array.isArray(visibleScheduleTemplates) && visibleScheduleTemplates.length > 0;
  const hasImport    = !!(onImport || ownerCfg.isOwner);
  const isEmpty      = visibleEvents.length === 0;

  // Date-select (drag-to-create or day click) → open form seeded with the range
  const handleDateSelect = useCallback((start, end) => {
    if (!hasAddButton) return;
    onDateSelect?.(start, end);
    setFormEvent({ start, end });
  }, [hasAddButton, onDateSelect]);

  // Schedule cell select → route to schedule-specific editor, not generic EventForm.
  const handleScheduleDateSelect = useCallback((start, end, resourceId) => {
    if (!hasAddButton) return;
    onDateSelect?.(start, end, resourceId);

    const emp = configuredEmployees.find(e => String(e.id) === String(resourceId));
    if (!emp) return;

    setScheduleEditorState({
      emp,
      start: start instanceof Date ? start : new Date(start),
      end: end instanceof Date ? end : new Date(end),
    });
  }, [configuredEmployees, hasAddButton, onDateSelect]);

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

  return (
    <CalendarErrorBoundary>
      <CalendarContext.Provider value={ctxValue}>
        <div className={styles.root} data-wc-theme={effectiveTheme} data-testid="works-calendar" data-wc-edit-mode={editMode ? '' : undefined} style={customThemeVars}>

        {/* ── Toolbar ── */}
        {renderToolbar ? (
          <div className={styles.customToolbar}>{renderToolbar(api)}</div>
        ) : (
          <div className={styles.toolbar} role="toolbar" aria-label="Calendar navigation">
            <div className={styles.navGroup}>
              <button
                className={styles.navBtn}
                onClick={() => cal.navigate(-1)}
                aria-label="Previous"
                title={`Previous ${cal.view}`}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button className={styles.todayBtn} onClick={cal.goToToday}>Today</button>
              <button
                className={styles.navBtn}
                onClick={() => cal.navigate(1)}
                aria-label="Next"
                title={`Next ${cal.view}`}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <span className={styles.dateLabel} aria-live="polite" aria-atomic="true">{getDateLabel()}</span>
              <span className={styles.calendarTitle}>{calendarTitle}</span>
              {fetchLoading && <span className={styles.loadingDot} title="Loading…" aria-label="Loading events" role="status" />}
            </div>

            <div className={styles.viewGroup} role="group" aria-label="Calendar view">
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  className={[styles.viewBtn, cal.view === v.id && styles.activeView].filter(Boolean).join(' ')}
                  onClick={() => cal.setView(v.id)}
                  aria-pressed={cal.view === v.id}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className={styles.actions}>
              {devMode && <span className={styles.devBadge}>Dev</span>}
              {(ownerCfg.isOwner || devMode) && (
                <button
                  className={[styles.wandBtn, editMode && styles.wandBtnActive].filter(Boolean).join(' ')}
                  onClick={() => { setEditMode(v => !v); setInlineEditTarget(null); }}
                  aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode — click events to customize them'}
                  title={editMode ? 'Exit edit mode' : 'Customize events'}
                >
                  <Sparkles size={15} aria-hidden="true" />
                </button>
              )}
              {hasAddButton && cal.view !== 'schedule' && (
                <button className={styles.addBtn} onClick={() => setFormEvent({})} aria-label="Add new event">
                  <Plus size={14} aria-hidden="true" /><span className={styles.addBtnLabel}> Add Event</span>
                </button>
              )}
              {hasAddButton && hasScheduleTemplates && (
                <button
                  className={styles.addBtn}
                  onClick={() => {
                    setScheduleOpen(true);
                    trackScheduleTemplateAnalytics('schedule_dialog_opened', {
                      templateCount: visibleScheduleTemplates.length,
                    });
                  }}
                  aria-label="Add schedule from template"
                >
                  <Plus size={14} aria-hidden="true" /><span className={styles.addBtnLabel}> Add Schedule</span>
                </button>
              )}
              {hasImport && (
                <button className={styles.exportBtn} onClick={() => setImportOpen(true)} aria-label="Import .ics calendar">
                  <Upload size={15} aria-hidden="true" />
                </button>
              )}
              <button className={styles.exportBtn} onClick={() => exportVisibleEvents(visibleEvents)} aria-label="Export to Excel">
                <Download size={15} aria-hidden="true" />
              </button>
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
          </div>
        )}

        {/* ── Edit mode banner ── */}
        {editMode && (
          <div className={styles.editModeBanner} role="status" aria-live="polite">
            <Sparkles size={13} aria-hidden="true" />
            <span>Edit mode — click any event to customize it</span>
            <button
              className={styles.editModeExit}
              onClick={() => { setEditMode(false); setInlineEditTarget(null); }}
              aria-label="Exit edit mode"
            >
              Done
            </button>
          </div>
        )}

        {/* ── Profile / Saved-views Bar ── */}
        {renderSavedViewsBar
          ? renderSavedViewsBar({
              views:       savedViews.views,
              activeId:    savedViewActiveId,
              isDirty:     savedViewDirty,
              applyView:   handleApplyView,
              saveView:    (name, opts) => savedViews.saveView(name, cal.filters, { groupBy: activeGroupBy, sort: activeSort, showAllGroups: activeShowAllGroups, ...opts }),
              updateView:  savedViews.updateView,
              resaveView:  (id) => savedViews.resaveView(id, cal.filters, cal.view, activeGroupBy, activeSort, activeShowAllGroups),
              deleteView:  handleDeleteView,
              currentFilters: cal.filters,
              currentView:    cal.view,
              schema,
              buildFilterSummary: (filters) => buildFilterSummary(filters, schema),
            })
          : (
            <ProfileBar
              views={savedViews.views}
              activeId={savedViewActiveId}
              isDirty={savedViewDirty}
              schema={schema}
              onApply={handleApplyView}
              onAdd={({ name, color, pinView }) =>
                savedViews.saveView(name, cal.filters, { color, view: pinView ? cal.view : null, groupBy: activeGroupBy, sort: activeSort, showAllGroups: activeShowAllGroups })
              }
              onResave={(id) => savedViews.resaveView(id, cal.filters, cal.view, activeGroupBy, activeSort, activeShowAllGroups)}
              onUpdate={savedViews.updateView}
              onDelete={handleDeleteView}
            />
          )
        }

        {/* ── Filter Bar ── */}
        {renderFilterBar
          ? renderFilterBar({
              schema,
              filters:       cal.filters,
              setFilter:     cal.setFilter,
              toggleFilter:  cal.toggleFilter,
              clearFilter:   cal.clearFilter,
              clearAllFilters: cal.clearFilters,
              activePills:   buildActiveFilterPills(cal.filters, schema),
              items:         expandedEvents,
            })
          : (
            <FilterBar
              schema={schema}
              filters={cal.filters}
              items={expandedEvents}
              onChange={cal.setFilter}
              onClear={cal.clearFilter}
              onClearAll={cal.clearFilters}
              sources={sourceStore.sources}
              groupLabels={ownerCfg.config?.filterUi?.groupLabels}
              pillHoverTitle={pillHoverTitle}
              onPillHoverTitleToggle={() => setPillHoverTitle(v => !v)}
            />
          )
        }

        {/* ── View area ── */}
        <div
          ref={swipeAreaRef}
          className={styles.viewArea}
          onClickCapture={editMode ? (e) => {
            lastClickCoordsRef.current = { x: e.clientX, y: e.clientY };
          } : undefined}
        >
          {isEmpty && emptyState ? (
            <div className={styles.emptyStateWrap}>{emptyState}</div>
          ) : (
            <>
              {cal.view === 'month'    && <MonthView    {...sharedViewProps} />}
              {cal.view === 'week'     && <WeekView     {...sharedViewProps} />}
              {cal.view === 'day'      && <DayView      {...sharedViewProps} />}
              {cal.view === 'agenda'   && <AgendaView   currentDate={cal.currentDate} events={visibleEvents} onEventClick={handleEventClick} onEventGroupChange={handleEventGroupChange} groupBy={activeGroupBy} sort={activeSort} showAllGroups={activeShowAllGroups} />}
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
                />
              )}
            </>
          )}
        </div>

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
              />
            )
        )}

        {/* ── Event form ── */}
        {formEvent !== null && perms.canAddEvent && (
          <EventForm
            event={formEvent.id ? formEvent : null}
            config={ownerCfg.config}
            categories={[...eventFormCats, ...eventOptions.categories]}
            onSave={handleEventSave}
            onDelete={(onEventDelete && perms.canDeleteEvent) ? handleEventDelete : null}
            onClose={() => setFormEvent(null)}
            permissions={perms}
            onAddCategory={perms.canManageOptions ? eventOptions.addCategory : undefined}
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
            onCallCategory={ownerCfg.config?.onCallCategory ?? 'on-call'}
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
            categories={categories}
            resources={resources}
            schema={schema}
            items={expandedEvents}
            onUpdate={ownerCfg.updateConfig}
            onClose={ownerCfg.closeConfig}
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
            onCreateScheduleTemplate={ownerCfg.isOwner ? handleCreateScheduleTemplate : undefined}
            onDeleteScheduleTemplate={ownerCfg.isOwner ? handleDeleteScheduleTemplate : undefined}
            scheduleTemplateError={templateError}
          />
        )}

        {/* ── Screen reader live region ── */}
        <ScreenReaderAnnouncer ref={announcerRef} />
        </div>

        {/* ── Inline event editor (edit mode) ── */}
        {inlineEditTarget && (
          <InlineEventEditor
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
