import type { ReactNode } from 'react';
import type { EventStatus } from './events';
import type { EventVisualPriority } from './view';

export type AnyRecord = Record<string, any>;

export type UpdateConfig = (updater: (current: AnyRecord) => AnyRecord) => void;

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
  patch: Record<string, any>,
) => void;

export type SourceDraft = {
  id?: string | undefined;
  label?: string | undefined;
  enabled?: boolean | undefined;
  type?: string | undefined;
  url?: string | undefined;
  [k: string]: any;
};

export type ScheduleTemplateDraft = {
  id?: string;
  name?: string;
  [k: string]: any;
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
  | 'requestForm'
  | 'access';

export interface ConfigPanelProps {
  config: AnyRecord;
  categories: string[];
  resources: string[];
  schema: AnyRecord;
  items: AnyRecord[];
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
  onAddSource?: ((...args: any[]) => void) | undefined;
  onRemoveSource?: ((...args: any[]) => void) | undefined;
  onToggleSource?: ((...args: any[]) => void) | undefined;
  onUpdateSource?: ((...args: any[]) => void) | undefined;
  scheduleTemplates?: ScheduleTemplateDraft[] | undefined;
  onCreateScheduleTemplate?: ((...args: any[]) => void) | undefined;
  onDeleteScheduleTemplate?: ((...args: any[]) => void) | undefined;
  scheduleTemplateError?: string | null | undefined;
  onEmployeeAdd?: ((...args: any[]) => void) | undefined;
  onEmployeeDelete?: ((...args: any[]) => void) | undefined;
  initialTab?: string | undefined;
  initialSmartViewEditId?: string | null | undefined;
  calendarId?: string | undefined;
  /** Re-trigger the SetupLanding guide. Only wired when the host enables
   *  showSetupLanding; undefined elsewhere so the button can self-hide. */
  onReopenSetup?: (() => void) | undefined;
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
  visualPriority?: EventVisualPriority | null | undefined;
  meta?: Record<string, unknown> | undefined;
  _col?: number | undefined;
  _numCols?: number | undefined;
}
