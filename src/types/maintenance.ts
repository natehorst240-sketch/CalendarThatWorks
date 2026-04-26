/**
 * Maintenance + asset-health types.
 *
 * These are pure data shapes. Logic for "is this overdue?" / "when is the next
 * service due?" lives elsewhere (a future helpers module). The library does
 * not enforce a maintenance workflow — it gives consumers typed metadata they
 * can attach to events and assets and surface in their own UI.
 *
 * AssetHealth attaches to an asset record (consumer-owned).
 * MaintenanceMeta attaches to `WorksCalendarEvent.meta.maintenance`.
 * MeterReading is a time-series entry; consumers store the log themselves.
 */

export type MeterType = 'miles' | 'hours' | 'cycles' | 'kilometers';

export type AssetHealthStatus =
  | 'available'
  | 'limited'
  | 'down'
  | 'maintenance';

export type MaintenanceLifecycle =
  | 'due'
  | 'scheduled'
  | 'in-progress'
  | 'complete'
  | 'skipped';

export interface MeterReading {
  assetId: string;
  type: MeterType;
  value: number;
  /** ISO-8601 timestamp string. */
  asOf: string;
  /** Optional: who reported it (driver, mechanic, system). */
  reportedBy?: string;
}

export interface AssetHealth {
  assetId: string;
  status: AssetHealthStatus;
  /** Most recent meter reading, denormalized for quick display. */
  meter?: MeterReading;
  /** Free-text warnings surfaced in the asset view. */
  warnings?: string[];
}

export interface MaintenanceInterval {
  miles?: number;
  hours?: number;
  days?: number;
  cycles?: number;
}

export interface MaintenanceRule {
  id: string;
  /** Apply to a specific asset, or to all assets of a type. One of these is required. */
  assetId?: string;
  assetType?: string;
  title: string;
  /** How often the work repeats. */
  interval?: MaintenanceInterval;
  /** How far ahead to start surfacing "due soon" warnings. */
  warningWindow?: MaintenanceInterval;
}

/**
 * Metadata attached to a calendar event when that event represents
 * maintenance work (oil change, inspection, etc.).
 */
export interface MaintenanceMeta {
  ruleId?: string;
  lifecycle?: MaintenanceLifecycle;
  /** Meter reading at the moment of service. */
  meterAtService?: number;
  /** Computed next-due meter value after this service completes. */
  nextDueMiles?: number;
  nextDueHours?: number;
  nextDueCycles?: number;
  nextDueDate?: string;
  /** Free-text technician notes. */
  notes?: string;
}
