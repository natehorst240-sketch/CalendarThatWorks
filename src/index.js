/**
 * WorksCalendar — public npm exports
 */
export { WorksCalendar }                  from './WorksCalendar.jsx';
export { default as TimelineView }        from './views/TimelineView.jsx';
export { normalizeEvent, normalizeEvents } from './core/eventModel.js';
export { loadConfig, saveConfig, DEFAULT_CONFIG, FIELD_TYPES } from './core/configSchema.js';
export { applyFilters, getCategories, getResources } from './filters/filterEngine.js';
export { exportToExcel }                  from './export/excelExport.js';
export { useCalendar }                    from './hooks/useCalendar.js';
export { useOwnerConfig }                 from './hooks/useOwnerConfig.js';
export { useProfiles }                    from './hooks/useProfiles.js';
export { useRealtimeEvents }              from './hooks/useRealtimeEvents.js';
export { loadProfiles, saveProfiles, createProfile, serializeFilters, deserializeFilters, PROFILE_COLORS } from './core/profileStore.js';
export { THEMES, THEMES_BY_ID, THEME_IDS } from './styles/themes.js';
export { parseICS, fetchAndParseICS }     from './core/icalParser.js';
export { useOccurrences }                 from './hooks/useOccurrences.js';
export { useDrag }                        from './hooks/useDrag.js';
export { useFeedEvents }                  from './hooks/useFeedEvents.js';
export { layoutOverlaps, layoutSpans, displayEndDay } from './core/layout.js';
export { validateChange }                 from './core/validator.js';
