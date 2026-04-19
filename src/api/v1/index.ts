/**
 * CalendarEngine — public API v1 barrel.
 *
 * Import engine types, helpers, adapters, and the engine class from here
 * rather than from internal engine paths.  This is the versioned stability
 * boundary — internal paths may change across minor versions; this barrel
 * will not.
 *
 * @example
 *   import {
 *     CalendarEngine,
 *     eventV1ToEngine, engineToV1,
 *     SyncMetadata, CalendarEventV1,
 *     serializeEvent, deserializeEvent,
 *   } from 'works-calendar/api/v1';
 */

// ── Schema types + helpers ────────────────────────────────────────────────────
export * from './types';

// ── Serialization helpers ─────────────────────────────────────────────────────
export * from './serialization';

// ── Data-shape converters (CalendarEventV1 ↔ EngineEvent) ────────────────────
export * from './converters';

// ── Schedule template scaffolding ────────────────────────────────────────────
export * from './templates';

// ── Engine class + initialiser ────────────────────────────────────────────────
export { CalendarEngine, createInitialState } from '../../core/engine/CalendarEngine';

// ── Engine input normalizer ───────────────────────────────────────────────────
export {
  normalizeInputEvent,
  normalizeInputEvents,
  nextEngineId,
} from '../../core/engine/adapters/normalizeInputEvent';

// ── Legacy adapter functions ──────────────────────────────────────────────────
export {
  fromLegacyEvent,
  fromLegacyEvents,
} from '../../core/engine/adapters/fromLegacyEvents';

export {
  toLegacyEvent,
  toLegacyEvents,
  occurrenceToLegacy,
} from '../../core/engine/adapters/toLegacyEvents';

// ── Engine feature flags + config ─────────────────────────────────────────────
export {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_RUNTIME_CONFIG,
  mergeRuntimeConfig,
} from '../../core/engine/engineConfig';
export type {
  EngineFeatureFlags,
  EngineRuntimeConfig,
} from '../../core/engine/engineConfig';

// ── Validation + error contracts + guarded mutation/recurrence ──────────────
export type {
  ValidationMode,
  EventValidationCode,
  EventValidationIssue,
  EventValidationResult,
  ValidateEventOptions,
  CalendarErrorDomain,
  CalendarErrorSeverity,
  StructuredCalendarError,
  OnErrorMeta,
  OnError,
  SafeMutateOptions,
  SafeMutateResult,
  ExpandRecurrenceSafeOptions,
} from '../../core/engine/engineTypes';

export {
  validateEvent,
  toStructuredError,
  safeMutate,
  expandRecurrenceSafe,
} from '../../core/engine/engineTypes';

// ── Engine state types ────────────────────────────────────────────────────────
export type {
  CalendarView,
  FilterState,
  CalendarState,
  Operation,
  CalendarEngineInit,
  StateListener,
  Unsubscribe,
} from '../../core/engine/types';

// ── Integration adapters ──────────────────────────────────────────────────────
// Individual adapters can also be imported from 'works-calendar/api/v1/adapters'.
export type {
  CalendarAdapter,
  AdapterChange,
  AdapterChangeCallback,
  AdapterUnsubscribe,
  AdapterStatus,
} from './adapters/CalendarAdapter';

export { RestAdapter }      from './adapters/RestAdapter';
export type { RestAdapterOptions }      from './adapters/RestAdapter';

export { SupabaseAdapter }  from './adapters/SupabaseAdapter';
export type { SupabaseAdapterOptions }  from './adapters/SupabaseAdapter';

export { ICSAdapter, serializeToICS } from './adapters/ICSAdapter';
export type { ICSAdapterOptions }  from './adapters/ICSAdapter';

export { WebSocketAdapter } from './adapters/WebSocketAdapter';
export type { WebSocketAdapterOptions } from './adapters/WebSocketAdapter';

// ── Sync infrastructure ───────────────────────────────────────────────────────
// Full primitives are also available from 'works-calendar/api/v1/sync'.
export { SyncQueue, SyncManager, clientWins, serverWins, latestWins, manualResolve, resolverFor, ConflictError } from './sync/index';
export type {
  SyncStatus,
  QueuedOperation,
  ConflictStrategy,
  ConflictResolver,
  SyncManagerOptions,
  SyncState,
  SyncStateListener,
  SyncUnsubscribe,
} from './sync/index';
