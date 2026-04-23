/**
 * WorksCalendar — public npm exports
 */

// ── Versioned public schema (engine types + serialization helpers) ───────────
export * from './api/v1/index';

export type { WorksCalendarEvent, NormalizedEvent, EventStatus, EventVisualPriority } from './types/events';
export { isVisualPriority } from './types/events';
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
export { normalizeEvent, normalizeEvents } from './core/eventModel';
export { loadConfig, saveConfig, DEFAULT_CONFIG, FIELD_TYPES } from './core/configSchema';
export { applyFilters, getCategories, getResources } from './filters/filterEngine';
export { exportToExcel }                  from './export/exportToExcelLazy';
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
export { loadPools, savePools, clearPools, poolStorageKey } from './core/pools/poolStore';
export type { ResourcePool } from './core/pools/resourcePoolSchema';

// ── Lifecycle event bus (#216) ──────────────────────────────────────────────
export { EventBus, channelForApprovalTransition } from './core/engine/eventBus';
export type {
  EventBusChannel, BookingChannel, AssignmentChannel,
  BookingLifecyclePayload, AssignmentLifecyclePayload,
  EventBusPayload, EventBusHandler, EventBusUnsubscribe, EventBusOptions,
} from './core/engine/eventBus';
