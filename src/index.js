/**
 * WorksCalendar — public npm exports
 */

// ── Versioned public schema (engine types + serialization helpers) ───────────
export * from './api/v1/index.js';

export { WorksCalendar }                  from './WorksCalendar.jsx';
export { default as TimelineView }        from './views/TimelineView.jsx';
export { normalizeEvent, normalizeEvents } from './core/eventModel.js';
export { loadConfig, saveConfig, DEFAULT_CONFIG, FIELD_TYPES } from './core/configSchema.js';
export { applyFilters, getCategories, getResources } from './filters/filterEngine.js';
export { exportToExcel }                  from './export/excelExport.js';
export { useCalendar }                    from './hooks/useCalendar.js';
export { useOwnerConfig }                 from './hooks/useOwnerConfig.js';
export { useRealtimeEvents }              from './hooks/useRealtimeEvents.js';
export { useSavedViews, serializeFilters, deserializeFilters } from './hooks/useSavedViews.js';
export {
  DEFAULT_FILTER_SCHEMA,
  statusField, priorityField, ownerField, tagsField, metaSelectField,
} from './filters/filterSchema.js';
export { createInitialFilters, buildActiveFilterPills, isEmptyFilterValue } from './filters/filterState.js';
export { THEMES, THEMES_BY_ID, THEME_IDS } from './styles/themes.js';
export { default as CalendarExternalForm } from './ui/CalendarExternalForm.jsx';
export { createLocalStorageDataAdapter } from './external/localStorageDataAdapter.js';
export { parseICS, fetchAndParseICS }     from './core/icalParser.js';
export { useOccurrences }                 from './hooks/useOccurrences.js';
export { useDrag }                        from './hooks/useDrag.js';
export { useFeedEvents }                  from './hooks/useFeedEvents.js';
export { layoutOverlaps, layoutSpans, displayEndDay } from './core/layout.js';
export { validateChange }                 from './core/validator.js';
