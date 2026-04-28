/**
 * CalendarEngine — master type re-export.
 *
 * Import engine types from here rather than individual schema files.
 * This is the public surface for consumers of the engine layer.
 */

// ── Schema ────────────────────────────────────────────────────────────────────
export type {
  EngineEvent,
  EventStatus,
} from './schema/eventSchema';

export {
  isRecurringSeries,
  isDetachedOccurrence,
  isPartOfSeries,
  makeEvent,
} from './schema/eventSchema';

export type { EngineOccurrence } from './schema/occurrenceSchema';

export type {
  EngineOperation,
  RecurringEditScope,
  OperationSource,
} from './schema/operationSchema';

export { operationChangesTime } from './schema/operationSchema';

export type { EngineResource, ResourceBusinessHours } from './schema/resourceSchema';

export type {
  BlockedWindow,
  BusinessHours,
  WorkingCalendar,
} from './schema/calendarSchema';

export { parseHours, defaultWorkingCalendar } from './schema/calendarSchema';

// ── Config ────────────────────────────────────────────────────────────────────
export type {
  EngineFeatureFlags,
  EngineRuntimeConfig,
} from './engineConfig';

export {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_RUNTIME_CONFIG,
  mergeRuntimeConfig,
} from './engineConfig';

// ── Error contracts ───────────────────────────────────────────────────────────
export type {
  CalendarErrorDomain,
  CalendarErrorSeverity,
  StructuredCalendarError,
  OnErrorMeta,
  OnError,
} from './errors/onError';

export { toStructuredError } from './errors/onError';

// ── Validation types ──────────────────────────────────────────────────────────
export type {
  Violation,
  ViolationSeverity,
  ValidationResult,
  OperationContext,
  ValidationRule,
  ChangeShape,
} from './validation/validationTypes';

export { VALID_RESULT } from './validation/validationTypes';

export type {
  ValidationMode,
  EventValidationCode,
  EventValidationIssue,
  EventValidationResult,
  EventIssueAction,
  EventIssueSeverity,
  ValidateEventOptions,
} from './validation/validateEvent';

export { validateEvent } from './validation/validateEvent';

// ── Operation result ──────────────────────────────────────────────────────────
export type {
  OperationResult,
  OperationStatus,
  EventChange,
} from './operations/operationResult';

export {
  isAccepted,
  makeRejectedResult,
  makePendingResult,
} from './operations/operationResult';

export type {
  SafeMutateOptions,
  SafeMutateResult,
} from './operations/safeMutate';

export { safeMutate } from './operations/safeMutate';

// ── Recurrence guards ────────────────────────────────────────────────────────
export type {
  ExpandRecurrenceSafeOptions,
  ExpandRecurrenceSafeResult,
  SeriesDiagnostic,
} from './recurrence/expandRecurrenceSafe';
export { expandRecurrenceSafe } from './recurrence/expandRecurrenceSafe';

// ── Time utilities ─────────────────────────────────────────────────────────────
export type { DateRange } from './time/rangeMath';

export {
  rangesOverlap,
  rangeContains,
  pointInRange,
  rangeIntersection,
  rangeUnion,
  expandRangeByDays,
  filterOverlapping,
} from './time/rangeMath';

export {
  clampDate,
  snapToMinutes,
  durationMs,
  durationMinutes,
  isSameDayLocal,
  hoursDecimal,
  parseHoursString,
  startOfDayLocal,
  endOfDayLocal,
} from './time/dateMath';

// ── Legacy types (from types.ts shell) ───────────────────────────────────────
// Keep exporting these so existing imports still work.
export type {
  CalendarView,
  FilterState,
  CalendarState,
  Operation,
  StateListener,
  Unsubscribe,
  CalendarEngineInit,
} from './types';
