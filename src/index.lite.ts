/**
 * works-calendar/lite — lightweight entry point.
 *
 * Includes: WorksCalendar component, core event types, filter schema/engine,
 * themes, saved views, slot helpers, iCal parsing, and external-form support.
 *
 * Excludes: scheduling workflow engine, approvals, resource pools, requirements,
 * geo/conflict engine, maintenance, billing, config wizard, export utilities,
 * and the versioned API schema — all of which remain in the full "." entry.
 */

export { WorksCalendar }            from './WorksCalendar.tsx';
export { default as ScheduleView }  from './views/ScheduleView';

export type {
  WorksCalendarEvent,
  NormalizedEvent,
  EventStatus,
  EventLifecycleState,
  EventVisualPriority,
} from './types/events';
export { isVisualPriority, isLifecycleState, EVENT_LIFECYCLE_STATES } from './types/events';
export { default as EventStatusBadge } from './ui/EventStatusBadge';
export type { EventStatusBadgeProps }  from './ui/EventStatusBadge';

export type {
  ConfigPanelProps,
  ConfigPanelTabId,
  SaveViewHandler,
  SaveViewOptions,
  SavedViewDraft,
  SavedViewUpdateHandler,
  SourceDraft,
  ScheduleTemplateDraft,
  CalendarViewEvent,
  UpdateConfig,
} from './types/ui';

export { normalizeEvent, normalizeEvents } from './core/eventModel';

export {
  DEFAULT_FILTER_SCHEMA,
  statusField, priorityField, ownerField, tagsField, metaSelectField,
} from './filters/filterSchema';
export { createInitialFilters, buildActiveFilterPills, isEmptyFilterValue } from './filters/filterState';
export { applyFilters, getCategories, getResources } from './filters/filterEngine';

export {
  THEMES,
  THEMES_BY_ID,
  THEME_IDS,
  THEME_FAMILIES,
  THEME_META,
  DEFAULT_THEME,
  buildThemeId,
  normalizeTheme,
  resolveCssTheme,
} from './styles/themes';
export type { ThemeId, ThemeFamily, ThemeMode, ThemeMeta, ThemePreview } from './styles/themes';

export { default as CalendarErrorBoundary } from './ui/CalendarErrorBoundary';

export { RightPanel, RightPanelSection } from './ui/RightPanel';
export type { RightPanelSectionProps }   from './ui/RightPanel';
export type { LeftRailAction }           from './ui/LeftRail';

export { useSavedViews, serializeFilters, deserializeFilters } from './hooks/useSavedViews';
export { useOwnerConfig }                from './hooks/useOwnerConfig';
export { useFeedEvents }                 from './hooks/useFeedEvents';
export { useDrag }                       from './hooks/useDrag';

export { createLocalStorageDataAdapter } from './external/localStorageDataAdapter';
export { parseICS, fetchAndParseICS }    from './core/icalParser';

export {
  default as CalendarExternalForm,
  SUPPORTED_EXTERNAL_FORM_FIELD_TYPES,
} from './ui/CalendarExternalForm';
export { default as FocusChips, DEFAULT_FOCUS_CHIPS } from './ui/FocusChips';
export type { FocusChipDef, FocusChipsProps }         from './ui/FocusChips';

export { createManualLocationProvider } from './providers/ManualLocationProvider.ts';
export { DEFAULT_CATEGORIES }           from './types/assets.ts';
