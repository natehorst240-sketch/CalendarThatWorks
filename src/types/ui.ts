import type { ReactNode } from 'react';
import type { EventStatus } from './events';

export type AnyRecord = Record<string, any>;

export type UpdateConfig = (updater: (current: AnyRecord) => AnyRecord) => void;

export type SavedViewFilters = Record<string, unknown>;

export type SavedViewDraft = {
  id: string;
  name: string;
  filters?: SavedViewFilters;
  color?: string | null;
  view?: string | null;
  conditions?: unknown[] | null;
  groupBy?: unknown;
  sort?: unknown;
  sortBy?: unknown;
  zoomLevel?: unknown;
  collapsedGroups?: unknown;
  showAllGroups?: unknown;
  selectedBaseIds?: unknown;
  hiddenFromStrip?: boolean;
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
  id?: string;
  label?: string;
  enabled?: boolean;
  type?: string;
  url?: string;
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
  onSaveView?: SaveViewHandler;
  savedViews?: SavedViewDraft[];
  onUpdateView?: SavedViewUpdateHandler;
  onDeleteView?: (id: string) => void;
  sources?: SourceDraft[];
  feedErrors?: unknown[];
  onAddSource?: (...args: any[]) => void;
  onRemoveSource?: (...args: any[]) => void;
  onToggleSource?: (...args: any[]) => void;
  onUpdateSource?: (...args: any[]) => void;
  scheduleTemplates?: ScheduleTemplateDraft[];
  onCreateScheduleTemplate?: (...args: any[]) => void;
  onDeleteScheduleTemplate?: (...args: any[]) => void;
  scheduleTemplateError?: string | null;
  onEmployeeAdd?: (...args: any[]) => void;
  onEmployeeDelete?: (...args: any[]) => void;
  initialTab?: string;
  initialSmartViewEditId?: string | null;
  calendarId?: string;
}

export type InputChangeHandler = (value: string) => void;
export type ToggleHandler = (next: boolean) => void;
export type RenderOptional = ReactNode | null;

export interface CalendarViewEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  category?: string | null;
  resource?: string | null;
  status?: EventStatus;
  meta?: Record<string, unknown>;
  _col?: number;
  _numCols?: number;
}
