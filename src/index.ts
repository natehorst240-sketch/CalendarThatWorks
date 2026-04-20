/**
 * WorksCalendar — public npm exports
 */

// ── Versioned public schema (engine types + serialization helpers) ───────────
export * from './api/v1/index';

export type { WorksCalendarEvent, NormalizedEvent, EventStatus } from './types/events';

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
export { THEMES, THEMES_BY_ID, THEME_IDS } from './styles/themes';
export {
  default as CalendarExternalForm,
  SUPPORTED_EXTERNAL_FORM_FIELD_TYPES,
} from './ui/CalendarExternalForm';
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
export { advance as advanceWorkflow } from './core/workflow/advance';
export type {
  WorkflowAction, WorkflowEmitEvent, AdvanceInput, AdvanceResult,
} from './core/workflow/advance';
export { evaluate as evaluateExpression, evaluateBool as evaluateExpressionBool, ExpressionError } from './core/workflow/expression';
export type {
  Workflow, WorkflowNode, WorkflowEdge, WorkflowInstance, WorkflowInstanceStatus,
  WorkflowHistoryEntry, WorkflowOutcome, WorkflowTrigger, EdgeGuard,
  WorkflowConditionNode, WorkflowApprovalNode, WorkflowNotifyNode, WorkflowTerminalNode,
} from './core/workflow/workflowSchema';
export { findNode as findWorkflowNode, resolveNextEdge as resolveWorkflowEdge } from './core/workflow/workflowSchema';
export {
  WORKFLOW_TEMPLATES,
  singleApproverWorkflow, twoTierApproverWorkflow, conditionalByCostWorkflow,
} from './core/workflow/templates';

// ── Lifecycle event bus (#216) ──────────────────────────────────────────────
export { EventBus, channelForApprovalTransition } from './core/engine/eventBus';
export type {
  EventBusChannel, BookingChannel, AssignmentChannel,
  BookingLifecyclePayload, AssignmentLifecyclePayload,
  EventBusPayload, EventBusHandler, EventBusUnsubscribe, EventBusOptions,
} from './core/engine/eventBus';
