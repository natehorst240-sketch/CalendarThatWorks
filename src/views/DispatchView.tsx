/**
 * DispatchView — fleet-readiness table answering "what can I launch right now?"
 *
 * The mission/asset-request modal already validates per-mission fit (pilots
 * with the right certifications, aircraft hours, maintenance status, etc.)
 * but the inverse question — "which assets are available this minute?" —
 * required clicking through every mission first. This view inverts that:
 * a flat readiness table per asset, evaluated against an `asOf` time the
 * dispatcher chooses (defaults to now, retargetable for shift-change
 * pre-staging).
 *
 * Status taxonomy is intentionally generic so the same view works for any
 * deployment, not just air EMS:
 *   - Maintenance — an event with category 'maintenance' overlaps asOf
 *   - Busy        — any other event overlaps asOf for this resource
 *   - Available   — neither
 *
 * Crew Ready is a heuristic: at least one employee at the asset's base is
 * not booked at asOf. Equipment Ready is true unless the asset's own
 * `meta.status === 'maintenance'`. The table surfaces what's missing in
 * a final column so the dispatcher's next move is visible at a glance.
 */
import { Fragment, useMemo, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Users, Plane, AlertTriangle, Clock, MapPin, Check, ChevronDown, ChevronRight } from 'lucide-react';
import EventStatusBadge from '../ui/EventStatusBadge';
import { isLifecycleState, type EventLifecycleState } from '../types/events';
import styles from './DispatchView.module.css';

type LooseEvent = {
  id?: string | number;
  start?: string | Date;
  end?: string | Date;
  resource?: string | number | null;
  category?: string;
  title?: string;
  lifecycle?: EventLifecycleState | string | null;
  meta?: Record<string, unknown> | null | undefined;
};

/**
 * Pull a lifecycle value off either the top-level field or `meta.lifecycle`,
 * matching `normalizeEvent`'s opt-in fallback so dispatch surfaces the same
 * state hosts see in the calendar even when their loose event payloads
 * haven't been re-normalized.
 */
function readLifecycle(ev: LooseEvent): EventLifecycleState | null {
  if (isLifecycleState(ev.lifecycle)) return ev.lifecycle;
  const metaLifecycle = (ev.meta as { lifecycle?: unknown } | null | undefined)?.lifecycle;
  return isLifecycleState(metaLifecycle) ? metaLifecycle : null;
}

type Employee = {
  id: string | number;
  name?: string;
  base?: string | null | undefined;
};

type Asset = {
  id: string | number;
  label?: string;
  name?: string;
  meta?: {
    base?: string | null;
    status?: string | null;
    sublabel?: string | null;
    [key: string]: unknown;
  } | null | undefined;
};

type Base = { id: string; name: string };

/**
 * A pending mission/request the dispatcher might launch. Hosts compute
 * this list from their own event semantics (typically open requests with
 * no assignment yet) and pass it in. Empty/undefined hides the picker.
 */
export type DispatchMissionCandidate = {
  id: string;
  label: string;
  /** Optional sublabel — e.g. priority, ETA, route. */
  sublabel?: string;
};

/**
 * Structured per-requirement verdict (#424 wk4). Lets hosts surface
 * exactly which role/pool a row is short of — instead of a free-text
 * `missing` line — so the readiness UI can render "Needs paramedic"
 * style labels and an inline breakdown panel. Optional: the existing
 * `missing: string[]` channel still works for hosts that haven't
 * adopted the structured shape yet.
 */
export type DispatchRequirementBreakdown = {
  /** Stable key used for React lists; defaults to `role`/`pool` value. */
  id?: string;
  /** Discriminator — drives icon + label phrasing. */
  kind: 'role' | 'pool' | 'conflict' | 'note';
  /** Human-readable name for the requirement (e.g. "Paramedic"). */
  label: string;
  /** True when the requirement is satisfied. Drives icon + colour. */
  satisfied: boolean;
  /** Headcount target — surfaced as "(2/3)" suffix when both present. */
  required?: number;
  /** Headcount actually assigned. */
  assigned?: number;
  /** `'soft'` shortfalls render as warnings only; default `'hard'`. */
  severity?: 'hard' | 'soft';
  /** Optional sub-text shown in the breakdown panel only. */
  detail?: string;
};

/**
 * Per-asset readiness for a specific mission. Hosts return whatever their
 * own validation primitives report (cert matches, aircraft capability
 * checks, hours remaining, etc.) translated into the same shape the
 * generic readiness pipeline produces.
 */
export type DispatchMissionReadiness = {
  crewReady: boolean;
  equipmentReady: boolean;
  missing: string[];
  /** Structured per-requirement verdict (sprint #424 wk4). */
  breakdown?: readonly DispatchRequirementBreakdown[];
};

export type DispatchViewProps = {
  events: LooseEvent[];
  employees: Employee[];
  assets: Asset[];
  bases: Base[];
  locationLabel?: string;
  /** UI label for assets — owners can rename to 'Aircraft', 'Vehicle', etc.
   *  Plural is generated as `${label}s`. Defaults to 'Asset'. */
  label?: string;
  /**
   * Click handler for blocker events surfaced via "View booking" / "View
   * work" actions. Receives the full event object (matching the contract
   * the rest of the view-prop pipeline expects), not just an id, so the
   * downstream HoverCard / detail panel can render `event.start` etc.
   */
  onEventClick?: (event: LooseEvent) => void;
  /** Default as-of time. Component manages its own state from this seed. */
  initialAsOf?: Date;
  /**
   * Optional list of pending missions/requests. When present, the toolbar
   * surfaces a "For mission" picker; selecting one routes each row's
   * readiness through `evaluateForMission` instead of the generic checks.
   */
  missions?: DispatchMissionCandidate[] | undefined;
  /**
   * Per-(asset, mission) readiness evaluator. Required for the picker to
   * do anything useful — without it the picker is hidden even when
   * `missions` is non-empty. The view passes the chosen as-of time so the
   * host can re-validate cert lapses, aircraft hours, etc. at that
   * moment.
   */
  evaluateForMission?: ((
    assetId: string,
    missionId: string,
    asOf: Date,
  ) => DispatchMissionReadiness) | undefined;
  /**
   * Notified when the user changes `asOf` via the picker or "Now" button.
   * Hosts wire this to their calendar's date setter so the underlying
   * recurring-event expansion follows — without it, an `asOf` outside
   * the loaded range produces wrong "available" verdicts because the
   * blocking events for that moment never made it into `events`.
   *
   * Not invoked on initial mount — only on user-driven changes.
   */
  onAsOfChange?: ((asOf: Date) => void) | undefined;
  /**
   * Called when the user clicks "Assign" on an available asset row. Receives
   * the asset id, the currently-selected mission id (or null when no mission
   * is chosen in the picker), and the active as-of time. Hosts should create
   * the corresponding booking event and call onEventSave.
   */
  onAssign?: ((assetId: string, missionId: string | null, asOf: Date) => void) | undefined;
};

type Status = 'available' | 'busy' | 'maintenance';

export type DispatchRow = {
  asset: Asset;
  baseId: string;
  baseName: string;
  status: Status;
  blockingEvent: LooseEvent | null;
  crewReady: boolean;
  equipmentReady: boolean;
  missing: string[];
  /**
   * Structured per-requirement breakdown surfaced in the row's
   * disclosure panel and used to derive the "Needs X" headline label
   * (sprint #424 wk4). Empty when the host hasn't supplied one or the
   * row is fully ready.
   */
  breakdown: readonly DispatchRequirementBreakdown[];
};

// Internal alias kept short to avoid churn in the existing call sites.
type Row = DispatchRow;

function toDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

function eventCoversAsOf(ev: LooseEvent, asOf: Date): boolean {
  const s = toDate(ev.start);
  const e = toDate(ev.end);
  if (!s || !e) return false;
  return s.getTime() <= asOf.getTime() && e.getTime() >= asOf.getTime();
}

/**
 * Resolve the resource(s) an event applies to. The library's event model
 * uses `resource` (single) and an optional `meta.base` for base-wide events.
 * For dispatch readiness we only care about events bound to a specific
 * resource — base-wide events don't make a specific asset busy.
 */
function eventResourceId(ev: LooseEvent): string | null {
  if (ev.resource == null) return null;
  return String(ev.resource);
}

function isMaintenanceEvent(ev: LooseEvent): boolean {
  const cat = (ev.category ?? '').toLowerCase();
  return cat === 'maintenance' || cat.includes('maintenance');
}

export function computeDispatchRows(
  asOf: Date,
  assets: Asset[],
  employees: Employee[],
  bases: Base[],
  locationLabel: string,
): Row[] {
  // Bucket events by the resource they bind to so each asset/employee
  // lookup is O(1) rather than O(events) per row.
  const baseNameById = new Map<string, string>();
  for (const b of bases) baseNameById.set(String(b.id), b.name);

  const rows: Row[] = [];
  const missingFallback = `${locationLabel} unassigned`;

  for (const asset of assets) {
    const baseId = asset.meta?.base != null ? String(asset.meta.base) : '';
    const baseName = baseId ? (baseNameById.get(baseId) ?? baseId) : missingFallback;
    rows.push({
      asset,
      baseId,
      baseName,
      status: 'available',
      blockingEvent: null,
      crewReady: false,
      equipmentReady: false,
      missing: [],
      breakdown: [],
    });
  }
  return rows;
}

/**
 * Decorate the rows produced by computeDispatchRows with status, crew, and
 * equipment readiness derived from the full event pool. Split out so the
 * skeleton (rows for every asset, ordered) can be unit-tested independently
 * of the readiness pipeline.
 */
export function decorateDispatchRows(
  rows: Row[],
  asOf: Date,
  events: LooseEvent[],
  employees: Employee[],
): Row[] {
  // Index events touching `asOf` by resource for O(1) lookup per row.
  const eventsByResource = new Map<string, LooseEvent[]>();
  for (const ev of events) {
    if (!eventCoversAsOf(ev, asOf)) continue;
    const r = eventResourceId(ev);
    if (!r) continue;
    if (!eventsByResource.has(r)) eventsByResource.set(r, []);
    eventsByResource.get(r)!.push(ev);
  }

  return rows.map(row => {
    const assetId = String(row.asset.id);
    const live = eventsByResource.get(assetId) ?? [];
    const maintEvent = live.find(isMaintenanceEvent) ?? null;
    const otherEvent = live.find(e => !isMaintenanceEvent(e)) ?? null;

    const declaredStatus = row.asset.meta?.status;
    const declaredMaint = typeof declaredStatus === 'string' && declaredStatus.toLowerCase() === 'maintenance';

    let status: Status;
    let blockingEvent: LooseEvent | null = null;
    if (maintEvent || declaredMaint) {
      status = 'maintenance';
      blockingEvent = maintEvent;
    } else if (otherEvent) {
      status = 'busy';
      blockingEvent = otherEvent;
    } else {
      status = 'available';
    }

    // Crew readiness: at least one employee at the asset's base is free at asOf.
    let crewReady = false;
    if (row.baseId) {
      for (const emp of employees) {
        if (String(emp.base ?? '') !== row.baseId) continue;
        const empBookings = eventsByResource.get(String(emp.id));
        if (!empBookings || empBookings.length === 0) {
          crewReady = true;
          break;
        }
      }
    }

    const equipmentReady = status !== 'maintenance';

    const missing: string[] = [];
    const breakdown: DispatchRequirementBreakdown[] = [];

    // Status row — always present; severity hard when busy/maintenance,
    // satisfied when the asset is otherwise free at the chosen as-of.
    breakdown.push({
      id: 'status',
      kind: 'note',
      label:
        status === 'maintenance' ? 'In maintenance'
        : status === 'busy' ? `Busy with ${otherEvent?.title ?? otherEvent?.category ?? 'booking'}`
        : 'Free at the selected time',
      satisfied: status === 'available',
      severity: status === 'available' ? 'soft' : 'hard',
      ...(blockingEvent ? { detail: `Blocked by event: ${blockingEvent.title ?? blockingEvent.id ?? 'event'}` } : {}),
    });

    // Crew row — only meaningful when the asset has a base and isn't
    // already in maintenance (maintenance rows show a `na` chip
    // anyway). Skipping when status is maintenance keeps the panel
    // honest: a wrenched aircraft isn't "missing crew", it's down.
    if (status !== 'maintenance' && row.baseId) {
      breakdown.push({
        id: 'crew',
        kind: 'role',
        label: 'Crew at base',
        satisfied: crewReady,
        severity: crewReady ? 'soft' : 'hard',
        detail: crewReady
          ? `At least one employee at ${row.baseName} is free`
          : `No employee at ${row.baseName} is free at the selected time`,
      });
    }

    // Equipment row — flips to a structured note for maintenance
    // assets so the disclosure explains the equipment gap before
    // the host's per-mission breakdown layers on.
    breakdown.push({
      id: 'equipment',
      kind: 'role',
      label: 'Equipment',
      satisfied: equipmentReady,
      severity: equipmentReady ? 'soft' : 'hard',
      detail: equipmentReady ? 'Asset is operational' : 'Asset is in maintenance',
    });

    // Base assignment — surface as its own row when missing so the
    // dispatcher sees the structural fix needed (assign a base)
    // separately from the per-as-of state.
    if (!row.baseId) {
      breakdown.push({
        id: 'base',
        kind: 'note',
        label: `${row.baseName}`,
        satisfied: false,
        severity: 'hard',
        detail: 'Assign this asset to a base in Settings → Assets.',
      });
    }

    if (status === 'maintenance') missing.push('In maintenance');
    if (status === 'busy') {
      const t = otherEvent?.title ?? otherEvent?.category ?? 'booking';
      missing.push(`Busy: ${t}`);
    }
    if (status !== 'maintenance' && !crewReady && row.baseId) {
      missing.push('No crew available at this base');
    }
    if (!row.baseId) missing.push(`No ${row.baseName.toLowerCase()} assigned`);

    return { ...row, status, blockingEvent, crewReady, equipmentReady, missing, breakdown };
  });
}

/**
 * Replace generic crew/equipment readiness on each row with the host
 * evaluator's verdict for a specific mission.
 *
 * Status (busy / maintenance / available) is preserved verbatim — a
 * mission-eligible aircraft that is currently in maintenance still
 * needs to read as Maintenance, not Available. We also keep any base
 * `missing` notes that explain a non-available status (e.g. "Busy:
 * Trauma transport") so the dispatcher sees both the blocking
 * calendar event AND the mission-fit gaps in one cell.
 */
export function applyMissionOverride(
  rows: DispatchRow[],
  evaluate: (assetId: string, missionId: string, asOf: Date) => DispatchMissionReadiness,
  missionId: string,
  asOf: Date,
): DispatchRow[] {
  return rows.map(row => {
    const verdict = evaluate(String(row.asset.id), missionId, asOf);
    const blockingNotes = row.status === 'available' ? [] : row.missing;
    // Keep the structural rows from the base breakdown (status / base
    // assignment) so a mission-eligible aircraft that's also currently
    // in maintenance still surfaces both gaps. The host's mission
    // breakdown layers on top — typically per-role/pool slot verdicts.
    const baseStructural = row.breakdown.filter(b => b.id === 'status' || b.id === 'base');
    return {
      ...row,
      crewReady: verdict.crewReady,
      equipmentReady: verdict.equipmentReady,
      missing: [...blockingNotes, ...verdict.missing],
      breakdown: [...baseStructural, ...(verdict.breakdown ?? [])],
    };
  });
}

function formatDateTimeLocal(d: Date): string {
  // <input type="datetime-local"> wants 'YYYY-MM-DDTHH:mm' in local time.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Compose the row's headline label from its breakdown — "Ready" when
 * every hard requirement is satisfied; "Needs paramedic" / "Needs 2
 * crew" when not. Falls back to the legacy `missing[0]` line when no
 * breakdown is present so hosts that haven't adopted the structured
 * channel still see a readable summary. (Sprint #424 wk4.)
 */
export function summarizeReadiness(row: DispatchRow): {
  label: string;
  ready: boolean;
  reason?: string | undefined;
} {
  const hardShortfalls = row.breakdown.filter(b => !b.satisfied && (b.severity ?? 'hard') === 'hard');

  if (hardShortfalls.length === 0) {
    if (row.missing.length === 0) return { label: 'Ready', ready: true };
    // No structured shortfall but a legacy missing line exists — surface
    // it so legacy hosts still see "why" instead of a misleading "Ready".
    return { label: `Needs ${row.missing[0]!.toLowerCase()}`, ready: false, reason: row.missing[0]! };
  }

  if (hardShortfalls.length === 1) {
    const s = hardShortfalls[0]!;
    if (s.kind === 'role' && typeof s.required === 'number' && typeof s.assigned === 'number') {
      const short = s.required - s.assigned;
      const noun = s.label.toLowerCase();
      const phrase = short === 1 ? `Needs ${noun}` : `Needs ${short} more ${noun}`;
      return { label: phrase, ready: false, reason: s.detail ?? s.label };
    }
    if (s.kind === 'pool' && typeof s.required === 'number' && typeof s.assigned === 'number') {
      return { label: `Needs ${s.required - s.assigned} from ${s.label}`, ready: false, reason: s.detail ?? s.label };
    }
    return { label: `Needs ${s.label.toLowerCase()}`, ready: false, reason: s.detail ?? s.label };
  }

  return {
    label: `Needs ${hardShortfalls.length} requirements`,
    ready: false,
    reason: hardShortfalls.map(s => s.label).join(', '),
  };
}


// ─── New tactical dispatch board (commit 3 — replaces the readiness-queue UI)
// Everything above (computeDispatchRows / decorateDispatchRows / mission
// helpers / type definitions) stays intact for now — they're internal
// utilities and the public Mission* types are still re-exported from
// WorksCalendar.types. A follow-up commit can prune the dead code.

import type { NormalizedEvent } from 'works-calendar-engine';
import { DispatchBoard, type DispatchAssetEntry } from './dispatch/DispatchBoard';

interface DispatchViewLooseProps {
  readonly events?: readonly NormalizedEvent[];
  readonly assets?: readonly DispatchAssetEntry[];
  readonly initialAsOf?: Date;
  // Other legacy props (employees, bases, missions, evaluateForMission, …) are
  // accepted to keep the existing CalendarViewGrid wiring stable but ignored
  // by the new board. Treat this default export as a thin adapter that pulls
  // events + assets from the calendar context and hands them to DispatchBoard.
  readonly [k: string]: unknown;
}

export default function DispatchView(props: DispatchViewLooseProps) {
  const events = (props.events ?? []) as readonly NormalizedEvent[];
  const assets = (props.assets ?? []) as readonly DispatchAssetEntry[];
  return (
    <DispatchBoard
      events={events}
      assets={assets}
      {...(props.initialAsOf ? { initialDate: props.initialAsOf } : {})}
    />
  );
}
