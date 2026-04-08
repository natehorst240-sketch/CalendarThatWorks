/**
 * WorksCalendar — public npm exports
 */
export { WorksCalendar } from './WorksCalendar.jsx';
export { default as TimelineView } from './views/TimelineView.jsx';
export { normalizeEvent, normalizeEvents } from './core/eventModel.js';
export { loadConfig, saveConfig, DEFAULT_CONFIG, FIELD_TYPES } from './core/configSchema.js';
export { applyFilters, getCategories, getResources } from './filters/filterEngine.js';
export { exportToExcel } from './export/excelExport.js';
export { useCalendar } from './hooks/useCalendar.js';
export { useOwnerConfig } from './hooks/useOwnerConfig.js';
export { useProfiles } from './hooks/useProfiles.js';
export { loadProfiles, saveProfiles, createProfile, serializeFilters, deserializeFilters, PROFILE_COLORS } from './core/profileStore.js';
export { THEMES, THEMES_BY_ID, THEME_IDS } from './styles/themes.js';
