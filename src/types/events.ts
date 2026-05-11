/**
 * Core event types — re-exported from the public API.
 *
 * `NormalizedEvent` is the internal shape produced by `useNormalizedEvents`;
 * all fields are guaranteed and all dates are `Date` instances.
 */

import type { EventVisualPriority } from './view';
import { isVisualPriority } from './view';

export type { EventVisualPriority };
export { isVisualPriority };
export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

/**
 * Lifecycle state — orthogonal to iCal `status`. Drives the
 * draft → pending → approved → scheduled → completed loop that the
 * roadmap (issue #424, week 1) makes visible everywhere an event is
 * rendered. `null` means the host hasn't opted into lifecycle tracking
 * for this event; views fall back to legacy rendering.
 */
export type EventLifecycleState =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'scheduled'
  | 'completed';

export const EVENT_LIFECYCLE_STATES: readonly EventLifecycleState[] = [
  'draft',
  'pending',
  'approved',
  'scheduled',
  'completed',
];

export function isLifecycleState(v: unknown): v is EventLifecycleState {
  return typeof v === 'string'
    && (EVENT_LIFECYCLE_STATES as readonly string[]).includes(v);
}

export interface WorksCalendarEvent {
  id?: string | undefined;
  title: string;
  start: Date | string;
  end?: Date | string | undefined;
  allDay?: boolean | undefined;
  category?: string | undefined;
  color?: string | undefined;
  resource?: string | undefined;
  status?: EventStatus | undefined;
  lifecycle?: EventLifecycleState | undefined;
  /** Importance signal: 'muted' = normal recurring ops; 'high' = planning exceptions. */
  visualPriority?: EventVisualPriority | undefined;
  meta?: Record<string, unknown> | undefined;
  rrule?: string | undefined;
  exdates?: Array<Date | string> | undefined;
}

export interface NormalizedEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  category: string | null;
  color: string;
  resource: string | null;
  status: EventStatus;
  /** Lifecycle state when the host supplies one; null when untracked. */
  lifecycle: EventLifecycleState | null;
  /** Present when the raw event supplies visualPriority; null otherwise. */
  visualPriority?: EventVisualPriority | null | undefined;
  meta: Record<string, unknown>;
  rrule: string | null;
  exdates: Array<Date | string>;
  _raw: WorksCalendarEvent;
  _recurring?: boolean | undefined;
  /** Series master id added by the engine occurrence adapter — use for mutations. */
  _eventId?: string | undefined;
  _seriesId?: string | undefined;
  _feedLabel?: string | undefined;
  _col?: number | undefined;
  _numCols?: number | undefined;
}
