import type { ReactNode } from 'react';
import type { LeftRailAction } from './ui/LeftRail';
import type { FocusChipDef } from './ui/FocusChips';
import type { GroupByInput } from './hooks/useNormalizedConfig.ts';
import type { SortConfig } from './types/grouping.ts';
import type { FilterField } from './filters/filterSchema';
import type { LocationData, LocationProvider } from './types/assets';
import type { ViewId } from './core/viewScope';
import type { WorksCalendarEvent } from './types/events';
import type { DispatchMissionCandidate, DispatchMissionReadiness } from './views/DispatchView';
import type { ResourcePool } from './core/pools/resourcePoolSchema.ts';
import type { CascadeConfig } from './ui/CascadePanel';
import type { MaintenanceRule } from './types/maintenance';

export type { WorksCalendarEvent, DispatchMissionCandidate, DispatchMissionReadiness };

export type DispatchEvaluator = (
  assetId: string,
  missionId: string,
  asOf: Date,
) => DispatchMissionReadiness;

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
   *  Saved-views / Focus-filters / Settings buttons. */
  leftRailExtras?: LeftRailAction[];
  /** ReactNode appended to the RightPanel after the built-in Region map
   *  + Crew on shift sections. */
  rightPanelExtras?: ReactNode;
  renderFilterBar?: (args: UnknownRecord) => ReactNode;
  renderSavedViewsBar?: (args: UnknownRecord) => ReactNode;
  /**
   * Visible quick-filter chips rendered above the view area. Opt-in:
   *   - omitted (default) → no chip row renders
   *   - `true`            → renders the library's DEFAULT_FOCUS_CHIPS
   *   - `FocusChipDef[]`  → renders that custom chip list
   */
  focusChips?: FocusChipDef[] | boolean;
  /**
   * Pending missions/requests offered as the "For mission" picker on the
   * Dispatch view.
   */
  dispatchMissions?: DispatchMissionCandidate[];
  /**
   * Per-(asset, mission) readiness evaluator for the Dispatch view.
   */
  dispatchEvaluator?: DispatchEvaluator;
  /**
   * Called when the dispatcher clicks "Assign" on an available asset row.
   */
  onDispatchAssign?: (assetId: string, missionId: string | null, asOf: Date) => void;
  emptyState?: ReactNode;
  filterSchema?: FilterField[];
  /**
   * Optional cascade scope picker for the Focus tab of the View Controls sidebar.
   */
  cascadeConfig?: CascadeConfig;
  showAddButton?: boolean;
  /**
   * Hide the event-template dropdown in the Add/Edit Event form.
   */
  hideEventTemplates?: boolean;
  /**
   * Category-aware resource suggester for the Add/Edit Event form.
   */
  eventResourceSuggestions?: (category: string) => Array<{ value: string; label: string }>;
  /**
   * Opt-in interactive setup landing page.
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
   * Optional renderer for the location banner of a pool row.
   */
  renderPoolLocation?: (pool: { id: string; memberIds: readonly string[] }) => ReactNode;
  renderAssetBadges?: (asset: { id: string }) => ReactNode;
  /** Maintenance rules offered in the EventForm. */
  maintenanceRules?: readonly MaintenanceRule[];
  renderConflictBody?: (args: UnknownRecord) => ReactNode;

  /**
   * Resource pools (#212). Bookings can target a pool id via
   * `event.resourcePoolId`; the engine resolves a concrete member at
   * submit time and advances the round-robin cursor.
   */
  pools?: ResourcePool[];
  /**
   * Fires whenever the engine commits a pool state change.
   */
  onPoolsChange?: (pools: ResourcePool[], meta: { sequence: number }) => void;

  /** Optional logo image displayed at the left of the toolbar. */
  logoSrc?: string;
  /** Alt text for the logo image. Treated as decorative if omitted. */
  logoAlt?: string;
  /** Optional background image URL applied to the calendar root. */
  backgroundImage?: string;
};
