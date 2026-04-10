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
export * from './types.js';

// ── Serialization helpers ─────────────────────────────────────────────────────
export * from './serialization.js';

// ── Adapter functions ─────────────────────────────────────────────────────────
export * from './adapters.js';

// ── Engine class + initialiser ────────────────────────────────────────────────
export { CalendarEngine, createInitialState } from '../../core/engine/CalendarEngine.js';

// ── Engine input normalizer ───────────────────────────────────────────────────
export {
  normalizeInputEvent,
  normalizeInputEvents,
  nextEngineId,
} from '../../core/engine/adapters/normalizeInputEvent.js';

// ── Legacy adapter functions ──────────────────────────────────────────────────
export {
  fromLegacyEvent,
  fromLegacyEvents,
} from '../../core/engine/adapters/fromLegacyEvents.js';

export {
  toLegacyEvent,
  toLegacyEvents,
  occurrenceToLegacy,
} from '../../core/engine/adapters/toLegacyEvents.js';

// ── Engine feature flags + config ─────────────────────────────────────────────
export {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_RUNTIME_CONFIG,
  mergeRuntimeConfig,
} from '../../core/engine/engineConfig.js';
export type {
  EngineFeatureFlags,
  EngineRuntimeConfig,
} from '../../core/engine/engineConfig.js';

// ── Engine state types ────────────────────────────────────────────────────────
export type {
  CalendarView,
  FilterState,
  CalendarState,
  Operation,
  CalendarEngineInit,
  StateListener,
  Unsubscribe,
} from '../../core/engine/types.js';
