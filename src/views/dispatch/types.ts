/**
 * Generic types for the dispatch view. The view is asset-agnostic —
 * trucks, planes, employees, equipment. Anything with a position
 * over time renders here.
 *
 * Data comes in via WorksCalendar's existing `events` + `assets`
 * machinery; the engine handles conflicts and requirements. These
 * types are purely the view's projection/UI shapes.
 */

import type { NormalizedEvent } from 'works-calendar-engine';

// ── Layer projection ────────────────────────────────────────────────────────

export type MapLayer = 'region' | 'state' | '5k' | '1k';

export interface LayerBounds {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

// ── Dispatch assets + stops ─────────────────────────────────────────────────
//
// Derived from the calendar's events at render time, not stored separately.
// `DispatchAsset` is the row in the sidebar; `DispatchStop` is one event in
// the asset's timeline (departure or arrival at a facility).

export interface DispatchAsset {
  /** Stable id — matches event.resource. */
  readonly id: string;
  /** Display label shown in the sidebar. */
  readonly name: string;
  /** Render color for dots / breadcrumbs. */
  readonly color: string;
}

export interface DispatchFacility {
  readonly code: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** Optional capacity hint (e.g. dock count). */
  readonly capacity?: number;
}

export interface DispatchStop {
  /** Event the stop came from (mostly for click-through to detail). */
  readonly event: NormalizedEvent;
  readonly assetId: string;
  readonly facilityCode: string;
  readonly time: Date;
  readonly lat: number;
  readonly lng: number;
  readonly kind: 'departure' | 'arrival';
}

/** One leg between two consecutive stops on the same asset. */
export interface DispatchSegment {
  readonly assetId: string;
  readonly from: DispatchStop;
  readonly to: DispatchStop;
}

/** A pairwise conflict at a facility — produced by the engine, rendered here. */
export interface DispatchConflict {
  readonly facilityCode: string;
  readonly assetA: string;
  readonly assetB: string;
  readonly timeA: Date;
  readonly timeB: Date;
}
