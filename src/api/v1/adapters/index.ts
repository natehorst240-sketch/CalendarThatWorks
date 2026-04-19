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
} from './CalendarAdapter';

export { RestAdapter }     from './RestAdapter';
export type { RestAdapterOptions } from './RestAdapter';

export { SupabaseAdapter } from './SupabaseAdapter';
export type { SupabaseAdapterOptions } from './SupabaseAdapter';

export { ICSAdapter, serializeToICS } from './ICSAdapter';
export type { ICSAdapterOptions } from './ICSAdapter';

export { WebSocketAdapter } from './WebSocketAdapter';
export type { WebSocketAdapterOptions } from './WebSocketAdapter';
