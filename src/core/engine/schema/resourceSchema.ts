/**
 * CalendarEngine — resource schema.
 *
 * A resource is anything that can be booked/assigned to an event:
 * a room, a person, a piece of equipment, etc.
 */

import type { AvailabilityRule } from '../../availability/availabilityRule';

// ─── Resource ─────────────────────────────────────────────────────────────────

export interface EngineResource {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  /** Maximum number of simultaneous bookings (1 = exclusive, null = unlimited). */
  readonly capacity?: number | null;
  /** IANA timezone override for this resource. */
  readonly timezone?: string;
  /** Resource-specific working hours (overrides calendar-level businessHours). */
  readonly businessHours?: ResourceBusinessHours | null;
  /**
   * Fine-grained availability — layered on top of `businessHours`. Each
   * rule is either a weekly `open` window or an absolute `blackout`
   * range. Evaluated by the `availability-violation` conflict rule
   * (#214). Optional; when absent or empty, only `businessHours`
   * governs availability.
   */
  readonly availability?: readonly AvailabilityRule[];
  /**
   * Opaque tenant/workspace identifier (issue #218). Optional; unset =
   * global/shared resource visible to every tenant.
   */
  readonly tenantId?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface ResourceBusinessHours {
  /** Day indices that are working days (0=Sun … 6=Sat). */
  readonly days: readonly number[];
  /** "HH:MM" — start of working day, e.g. "09:00" */
  readonly start: string;
  /** "HH:MM" — end of working day, e.g. "17:00" */
  readonly end: string;
}
