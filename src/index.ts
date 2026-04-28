/**
 * WorksCalendar — public npm exports
 */

// ── Versioned public schema (engine types + serialization helpers) ───────────
export * from './api/v1/index';

export type { WorksCalendarEvent, NormalizedEvent, EventStatus, EventVisualPriority } from './types/events';
export { isVisualPriority } from './types/events';
export type { BillableMeta, InvoiceLineItem, InvoiceStatus } from './types/billing';
export type {
  AssetHealth,
  AssetHealthStatus,
  MaintenanceMeta,
  MaintenanceRule,
  MaintenanceInterval,
  MaintenanceLifecycle,
  MeterReading,
  MeterType,
} from './types/maintenance';
export {
  computeDueStatus,
  projectNextDue,
  completeMaintenance,
} from './core/maintenance';
export type {
  DueStatus,
  DueResult,
  CurrentState,
  LastService,
  NextDueProjection,
} from './core/maintenance';
export { MaintenanceBadge }       from './ui/MaintenanceBadge';
export type { MaintenanceBadgeProps } from './ui/MaintenanceBadge';
export { AssetMaintenanceBadges } from './ui/AssetMaintenanceBadges';
export type { AssetMaintenanceBadgesProps } from './ui/AssetMaintenanceBadges';
export { MaintenanceSection }     from './ui/EventFormSections/MaintenanceSection';
export type { MaintenanceSectionProps } from './ui/EventFormSections/MaintenanceSection';
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

export { WorksCalendar }                  from './WorksCalendar.tsx';
export { default as TimelineView }        from './views/TimelineView';
export { default as MapView }             from './views/MapView';
export type { MapViewProps }              from './views/MapView';
export { normalizeEvent, normalizeEvents } from './core/eventModel';
export { loadConfig, saveConfig, DEFAULT_CONFIG, FIELD_TYPES } from './core/configSchema';
export { applyFilters, getCategories, getResources } from './filters/filterEngine';
export { exportToExcel }                  from './export/exportToExcelLazy';
export {
  toInvoiceLineItems,
  invoiceLineItemsToCSV,
  downloadInvoicesCSV,
} from './export/invoiceExport';
export type {
  InvoiceLineItemsOptions,
  InvoiceQuantitySource,
} from './export/invoiceExport';
export {
  toMaintenanceLog,
  maintenanceLogToCSV,
  downloadMaintenanceLogCSV,
} from './export/maintenanceExport';
export type {
  MaintenanceLogEntry,
  MaintenanceLogOptions,
} from './export/maintenanceExport';
export { useCalendar }                    from './hooks/useCalendar';
export { useOwnerConfig }                 from './hooks/useOwnerConfig';
export { useRealtimeEvents }              from './hooks/useRealtimeEvents';
export { useSavedViews, serializeFilters, deserializeFilters } from './hooks/useSavedViews';
export {
  DEFAULT_FILTER_SCHEMA,
  statusField, priorityField, ownerField, tagsField, metaSelectField,
} from './filters/filterSchema';
export { createInitialFilters, buildActiveFilterPills, isEmptyFilterValue } from './filters/filterState';
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
export {
  default as CalendarExternalForm,
  SUPPORTED_EXTERNAL_FORM_FIELD_TYPES,
} from './ui/CalendarExternalForm';
export { default as FocusChips, DEFAULT_FOCUS_CHIPS } from './ui/FocusChips';
export type { FocusChipDef, FocusChipsProps } from './ui/FocusChips';
export { default as CalendarErrorBoundary } from './ui/CalendarErrorBoundary';
export { createLocalStorageDataAdapter } from './external/localStorageDataAdapter';
export { parseICS, fetchAndParseICS }     from './core/icalParser';
export { useOccurrences }                 from './hooks/useOccurrences';
export { useDrag }                        from './hooks/useDrag';
export { useFeedEvents }                  from './hooks/useFeedEvents';
export { layoutOverlaps, layoutSpans, displayEndDay } from './core/layout';
export { validateChange }                 from './core/validator';
export { groupRows }                      from './grouping/groupRows';
export { buildFieldAccessor }             from './grouping/buildFieldAccessor';
export { useGrouping }                    from './hooks/useGroupingRows.ts';
export { createManualLocationProvider }   from './providers/ManualLocationProvider.ts';
export { DEFAULT_CATEGORIES }             from './types/assets.ts';

// ── Approvals + Workflow DSL (#209, #215, #219) ─────────────────────────────
export { transitionApproval, legalActionsFrom, LEGAL_TRANSITIONS } from './core/approvals/transitions';
export type { TransitionInput, TransitionResult, TransitionError, TransitionErrorCode } from './core/approvals/transitions';
export { verifyAuditChain, appendAuditEntry } from './core/approvals/auditChain';
export { advance as advanceWorkflow, tick as tickWorkflow } from './core/workflow/advance';
export type {
  WorkflowAction, WorkflowEmitEvent, AdvanceInput, AdvanceResult,
} from './core/workflow/advance';
export { useWorkflowTicker } from './hooks/useWorkflowTicker';
export type { UseWorkflowTickerOptions } from './hooks/useWorkflowTicker';
export { evaluate as evaluateExpression, evaluateBool as evaluateExpressionBool, ExpressionError } from './core/workflow/expression';
export { interpolateTemplate, tryInterpolateTemplate, TemplateError } from './core/workflow/templateInterpolate';
export {
  createChannelRegistry, dispatchWorkflowEvents,
  createSlackChannel, createEmailChannel, createWebhookChannel,
} from './core/workflow/channels';
export type {
  WorkflowChannelAdapter, WorkflowChannelRegistry,
  ChannelDispatchPayload, ChannelDispatchOutcome, WorkflowDispatchReport,
  SlackChannelOptions, EmailChannelOptions, WebhookChannelOptions,
} from './core/workflow/channels';
export { validateWorkflow, validateExpressionSyntax, validateTemplateSyntax, hasBlockingErrors } from './core/workflow/validate';
export type {
  ValidationCode, ValidationIssue, ValidationSeverity, ValidateWorkflowOptions,
} from './core/workflow/validate';
export type {
  Workflow, WorkflowNode, WorkflowEdge, WorkflowInstance, WorkflowInstanceStatus,
  WorkflowHistoryEntry, WorkflowOutcome, WorkflowTrigger, EdgeGuard,
  WorkflowConditionNode, WorkflowApprovalNode, WorkflowNotifyNode, WorkflowTerminalNode,
  WorkflowParallelNode, WorkflowJoinNode, ParallelMode,
  ParallelBranchState, WorkflowParallelFrame,
  TimeoutBehavior,
} from './core/workflow/workflowSchema';
export { findNode as findWorkflowNode, resolveNextEdge as resolveWorkflowEdge } from './core/workflow/workflowSchema';
export {
  WORKFLOW_TEMPLATES,
  singleApproverWorkflow, twoTierApproverWorkflow, conditionalByCostWorkflow,
  slaEscalationWorkflow, parallelSecurityAndFinanceApproval,
} from './core/workflow/templates';

// ── Booking holds (#211) ────────────────────────────────────────────────────
export { createHoldRegistry, findBlockingHold } from './core/holds/holdRegistry';
export type {
  Hold, HoldWindow, HoldRegistry,
  AcquireHoldInput, AcquireHoldResult, AcquireHoldError, AcquireHoldErrorCode,
  CreateHoldRegistryOptions,
} from './core/holds/holdRegistry';
export { useBookingHold } from './hooks/useBookingHold';
export type { UseBookingHoldOptions, UseBookingHoldState } from './hooks/useBookingHold';

// ── Resource pools (#212) ───────────────────────────────────────────────────
export { loadPools, loadPoolsDetailed, savePools, clearPools, poolStorageKey } from './core/pools/poolStore';
export type { LoadPoolsResult } from './core/pools/poolStore';
export { validatePools } from './core/pools/validatePools';
export type { PoolIntegrityIssue, PoolIntegrityReport } from './core/pools/validatePools';
export type { ResourcePool, PoolStrategy, PoolType } from './core/pools/resourcePoolSchema';
// ── Resource pools v2 — query DSL (#386) ───────────────────────────────────
export { evaluateQuery } from './core/pools/evaluateQuery';
export type { QueryContext, QueryEvaluation, QueryExclusion } from './core/pools/evaluateQuery';
export type { ResourceQuery, ResourceQueryValue, DistanceFrom, WithinDistance } from './core/pools/poolQuerySchema';
// ── Resource pools v2 — geo + location adapters (#386) ─────────────────────
export { haversineKm, haversineMiles, isLatLon } from './core/pools/geo';
export type { LatLon } from './core/pools/geo';
export {
  attachLocations,
  createStaticLocationAdapter,
  createMetaPathLocationAdapter,
} from './core/pools/locationAdapters';
export type { ResourceLocation, ResourceLocationAdapter } from './core/pools/locationAdapters';
// ── Resource pools v2 — UI components (#386) ──────────────────────────────
export { default as PoolCard }    from './ui/pools/PoolCard';
export type { PoolCardProps }      from './ui/pools/PoolCard';
export { default as PoolBuilder } from './ui/pools/PoolBuilder';
export type { PoolBuilderProps, CapabilityOption } from './ui/pools/PoolBuilder';
export { default as ClauseEditor } from './ui/pools/ClauseEditor';
export type { ClauseEditorProps } from './ui/pools/ClauseEditor';
export { default as AdvancedRulesEditor } from './ui/pools/AdvancedRulesEditor';
export type { AdvancedRulesEditorProps } from './ui/pools/AdvancedRulesEditor';
export { summarizePool, summarizeQuery } from './ui/pools/poolSummary';
export type { PoolSummary } from './ui/pools/poolSummary';
export { derivePathSuggestions } from './ui/pools/pathSuggestions';
export { validateClausePaths } from './ui/pools/validateClausePaths';
export type { ValidateClausePathsResult, ClausePathIssue } from './ui/pools/validateClausePaths';
export type { CapabilityRange } from './ui/pools/PoolBuilder';
// ── CalendarConfig — standard config.json shape (#386 wizard) ─────────────
export { parseConfig } from './core/config/parseConfig';
export type { ParseConfigResult } from './core/config/parseConfig';
export { serializeConfig } from './core/config/serializeConfig';
export type {
  CalendarConfig, ConfigLabels, ConfigResourceType, ConfigRole,
  ConfigResource, ConfigRequirement, ConfigRequirementSlot,
  ConfigRequirementSeverity,
  ConfigSeedEvent, ConfigSettings,
} from './core/config/calendarConfig';
export { validateConfig } from './core/config/validateConfig';
export type {
  ValidateConfigResult, ConfigIssue, ConfigIssueSeverity,
} from './core/config/validateConfig';
export {
  PROFILE_PRESETS, listProfilePresets, applyProfilePreset,
} from './core/config/profilePresets';
export type { ProfileId, ProfilePreset } from './core/config/profilePresets';
export { getProfileSampleData, applyProfileSampleData } from './core/config/profilePresets';
export { default as ConfigWizard } from './ui/wizard/ConfigWizard';
export type { ConfigWizardProps, ConfigWizardStepId } from './ui/wizard/ConfigWizard';
// ── Requirements engine — runtime consumer for the templates (#386) ──────
export { evaluateRequirements } from './core/requirements/evaluateRequirements';
export type {
  EvaluateRequirementsInput, RequirementsEvaluation, RequirementShortfall,
} from './core/requirements/evaluateRequirements';
export { gateEventRequirements } from './core/requirements/gateEventRequirements';
export type { GateEventRequirementsInput } from './core/requirements/gateEventRequirements';

// ── Lifecycle event bus (#216) ──────────────────────────────────────────────
export { EventBus, channelForApprovalTransition } from './core/engine/eventBus';
export type {
  EventBusChannel, BookingChannel, AssignmentChannel,
  BookingLifecyclePayload, AssignmentLifecyclePayload,
  EventBusPayload, EventBusHandler, EventBusUnsubscribe, EventBusOptions,
} from './core/engine/eventBus';
