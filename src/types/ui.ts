import type { ReactNode } from 'react';
import type { NormalizedEvent } from './events';
import type { EventStatus, EventLifecycleState } from './events';
import type { EventVisualPriority } from './view';
import type { FilterField } from '../filters/filterSchema';
import type { WorksCalendarConfig } from '../WorksCalendar.types';
import type { EmployeeId, EmployeeRecord } from '../WorksCalendar.types';

export type { WorksCalendarConfig };

// ─── Permissions ──────────────────────────────────────────────────────────────

export type PermissionCaps = {
  canAddEvent: boolean;
  canEditEvent: boolean;
  canDeleteEvent: boolean;
  canDrag: boolean;
  canManagePeople: boolean;
  canManageOptions: boolean;
  canManageSavedViews: boolean;
};

// ─── CalendarContext ──────────────────────────────────────────────────────────

export type ColorRule =
  | { readonly when: (event: NormalizedEvent) => boolean; readonly color: string }
  | { readonly field: string; readonly value: unknown; readonly color: string };

export type RenderEventOptions = {
  readonly view: string;
  readonly isCompact: boolean;
  readonly onClick: () => void;
  readonly color: string | undefined;
};

export type CalendarContextValue = {
  renderEvent?: ((event: NormalizedEvent, opts: RenderEventOptions) => ReactNode) | undefined;
  renderHoverCard?: ((event: NormalizedEvent) => ReactNode) | undefined;
  colorRules?: ReadonlyArray<ColorRule | Record<string, unknown>> | undefined;
  businessHours?: Record<string, unknown> | undefined;
  emptyState?: ReactNode;
  permissions?: PermissionCaps | undefined;
  editMode?: boolean | undefined;
  conflictingEventIds?: ReadonlySet<string> | undefined;
  displayTimezone?: string | undefined;
};

export type UpdateConfig = (
  updater: (current: WorksCalendarConfig) => WorksCalendarConfig,
) => void;

export type SavedViewFilters = Record<string, unknown>;

export type SavedViewDraft = {
  id: string;
  name: string;
  filters?: SavedViewFilters | undefined;
  color?: string | null | undefined;
  view?: string | null | undefined;
  conditions?: unknown[] | null | undefined;
  groupBy?: unknown;
  sort?: unknown;
  sortBy?: unknown;
  zoomLevel?: unknown;
  collapsedGroups?: unknown;
  showAllGroups?: unknown;
  selectedBaseIds?: unknown;
  hiddenFromStrip?: boolean | undefined;
};

export type SaveViewOptions = Omit<SavedViewDraft, 'id' | 'name' | 'filters' | 'hiddenFromStrip'>;

export type SaveViewHandler = (
  name: string,
  filters: SavedViewFilters,
  options?: SaveViewOptions,
) => void;

export type SavedViewUpdateHandler = (
  id: string,
  patch: Record<string, unknown>,
) => void;

export type SourceDraft = {
  id?: string;
  label?: string | undefined;
  enabled?: boolean | undefined;
  type?: string;
  url?: string | undefined;
};

export type ScheduleTemplateDraft = {
  id?: string;
  name?: string;
  [k: string]: unknown;
};

export type ConfigPanelTabId =
  | 'setup'
  | 'hoverCard'
  | 'eventFields'
  | 'categories'
  | 'assets'
  | 'display'
  | 'theme'
  | 'feeds'
  | 'templates'
  | 'smartViews'
  | 'team'
  | 'approvals'
  | 'approvalFlows'
  | 'conflicts'
  | 'requestForm';

export interface ConfigPanelProps {
  config: WorksCalendarConfig;
  categories: string[];
  resources: string[];
  schema: readonly FilterField[];
  items: NormalizedEvent[];
  onUpdate: UpdateConfig;
  onClose: () => void;
  onSaveView?: SaveViewHandler | undefined;
  savedViews?: SavedViewDraft[] | undefined;
  onUpdateView?: SavedViewUpdateHandler | undefined;
  onDeleteView?: ((id: string) => void) | undefined;
  sources?: SourceDraft[] | undefined;
  feedErrors?: unknown[] | undefined;
  /** True while iCal feeds are fetching; surfaced in SourcePanel as a
   *  small "Syncing…" affordance next to the iCal Feeds heading. */
  isFetchingFeeds?: boolean | undefined;
  onAddSource?: ((source: SourceDraft) => void) | undefined;
  onRemoveSource?: ((id: string) => void) | undefined;
  onToggleSource?: ((id: string) => void) | undefined;
  onUpdateSource?: ((id: string, patch: SourceDraft) => void) | undefined;
  scheduleTemplates?: ScheduleTemplateDraft[] | undefined;
  onCreateScheduleTemplate?: ((template: ScheduleTemplateDraft) => void | Promise<void>) | undefined;
  onDeleteScheduleTemplate?: ((templateId: string) => void | Promise<void>) | undefined;
  scheduleTemplateError?: string | null | undefined;
  onEmployeeAdd?: ((member: EmployeeRecord) => void) | undefined;
  onEmployeeDelete?: ((employeeId: EmployeeId) => void) | undefined;
  initialTab?: string | undefined;
  initialSmartViewEditId?: string | null | undefined;
  calendarId?: string | undefined;
  /** Re-trigger the SetupLanding guide. Only wired when the host enables
   *  showSetupLanding; undefined elsewhere so the button can self-hide. */
  onReopenSetup?: (() => void) | undefined;
  /** Hide the experimental Approval Flows tab/workflow builder when false. */
  enableApprovalFlowsTab?: boolean | undefined;
}

export type InputChangeHandler = (value: string) => void;
export type ToggleHandler = (next: boolean) => void;
export type RenderOptional = ReactNode | null;

export interface CalendarViewEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean | undefined;
  category?: string | null | undefined;
  resource?: string | null | undefined;
  status?: EventStatus | undefined;
  lifecycle?: EventLifecycleState | null | undefined;
  visualPriority?: EventVisualPriority | null | undefined;
  meta?: Record<string, unknown> | undefined;
  _col?: number | undefined;
  _numCols?: number | undefined;
}
