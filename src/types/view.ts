/**
 * UI-facing state types for the View / Focus / Saved control system and the
 * importance-based event visual model.
 *
 * These types are consumed by:
 *   - Sprint 3: Sidebar & Control UX (ViewState, FocusFilterId, ViewId)
 *   - Sprint 6: Event Visual System (EventVisualPriority, EventCategory)
 *   - demo/types.ts (EventCategory, EventVisualPriority)
 */

// ── Event visual model ────────────────────────────────────────────────────────

/**
 * Drives .wcEvent.muted vs .wcEvent.high CSS classes across all views.
 *
 * muted  — normal recurring ops (shifts, on-call): should recede visually
 * high   — exceptions that affect planning (PTO, mission assignment, unavailable)
 */
export type EventVisualPriority = 'muted' | 'high';

/** Type guard — narrows `unknown` to `EventVisualPriority`. */
export function isVisualPriority(v: unknown): v is EventVisualPriority {
  return v === 'muted' || v === 'high';
}

/** Exhaustive set of operational event categories for the Air EMS demo. */
export type EventCategory =
  | 'dispatch-shift'
  | 'pilot-shift'
  | 'medical-shift'
  | 'mechanic-shift'
  | 'on-call'
  | 'pto'
  | 'mission-assignment'
  | 'maintenance'
  | 'training'
  | 'aircraft-request'
  | 'asset-request'
  | 'base-event';

export interface CalendarEventMeta {
  visualPriority: EventVisualPriority;
  category: EventCategory;
}

// ── View / filter state ───────────────────────────────────────────────────────

/** Predefined operational views — each maps to a fixed grouping structure. */
export type ViewId =
  | 'by-base'
  | 'dispatch'
  | 'maintenance'
  | 'crew'
  | 'aircraft'
  | 'mission-timeline';

/** Everyday quick-filter chips (Region / Aircraft Type / Asset Requests). */
export type FocusFilterId =
  | 'region'
  | 'aircraft-type'
  | 'asset-requests';

export interface ViewState {
  activeView: ViewId;
  focusFilters: FocusFilterId[];
  savedViewId: string | null;
}
