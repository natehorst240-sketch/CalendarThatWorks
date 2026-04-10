/**
 * CalendarEngine v1 — integration adapters barrel.
 *
 * Import adapters from here:
 *   import { RestAdapter, SupabaseAdapter, ICSAdapter, WebSocketAdapter } from 'works-calendar/api/v1/adapters';
 *   import type { CalendarAdapter, AdapterChange } from 'works-calendar/api/v1/adapters';
 */
export type {
  CalendarAdapter,
  AdapterChange,
  AdapterChangeCallback,
  AdapterUnsubscribe,
  AdapterStatus,
} from './CalendarAdapter.js';

export { RestAdapter }     from './RestAdapter.js';
export type { RestAdapterOptions } from './RestAdapter.js';

export { SupabaseAdapter } from './SupabaseAdapter.js';
export type { SupabaseAdapterOptions } from './SupabaseAdapter.js';

export { ICSAdapter, serializeToICS } from './ICSAdapter.js';
export type { ICSAdapterOptions } from './ICSAdapter.js';

export { WebSocketAdapter } from './WebSocketAdapter.js';
export type { WebSocketAdapterOptions } from './WebSocketAdapter.js';
