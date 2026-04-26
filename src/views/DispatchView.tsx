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
import { useMemo, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Wrench, Users, Plane, AlertTriangle, Clock, MapPin } from 'lucide-react';
import styles from './DispatchView.module.css';

type LooseEvent = {
  id?: string | number;
  start?: string | Date;
  end?: string | Date;
  resource?: string | number | null;
  category?: string;
  title?: string;
  meta?: Record<string, unknown> | null | undefined;
};

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
 * Per-asset readiness for a specific mission. Hosts return whatever their
 * own validation primitives report (cert matches, aircraft capability
 * checks, hours remaining, etc.) translated into the same shape the
 * generic readiness pipeline produces.
 */
export type DispatchMissionReadiness = {
  crewReady: boolean;
  equipmentReady: boolean;
  missing: string[];
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
    if (status === 'maintenance') missing.push('In maintenance');
    if (status === 'busy') {
      const t = otherEvent?.title ?? otherEvent?.category ?? 'booking';
      missing.push(`Busy: ${t}`);
    }
    if (status !== 'maintenance' && !crewReady && row.baseId) {
      missing.push('No crew available at this base');
    }
    if (!row.baseId) missing.push(`No ${row.baseName.toLowerCase()} assigned`);

    return { ...row, status, blockingEvent, crewReady, equipmentReady, missing };
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
    return {
      ...row,
      crewReady: verdict.crewReady,
      equipmentReady: verdict.equipmentReady,
      missing: [...blockingNotes, ...verdict.missing],
    };
  });
}

function formatDateTimeLocal(d: Date): string {
  // <input type="datetime-local"> wants 'YYYY-MM-DDTHH:mm' in local time.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DispatchView({
  events,
  employees,
  assets,
  bases,
  locationLabel = 'Base',
  label = 'Asset',
  onEventClick,
  initialAsOf,
  missions,
  evaluateForMission,
  onAsOfChange,
}: DispatchViewProps) {
  const labelLower = label.toLowerCase();
  const labelPluralLower = `${labelLower}s`;
  const [asOf, setAsOf] = useState<Date>(() => initialAsOf ?? new Date());
  const [forMissionId, setForMissionId] = useState<string | null>(null);

  // Single setter so every user-driven asOf change bubbles up. Initial
  // mount uses `useState`'s lazy initializer above and intentionally
  // does NOT notify — the host already knows its own currentDate.
  const updateAsOf = (next: Date) => {
    setAsOf(next);
    onAsOfChange?.(next);
  };

  const missionPickerEnabled = !!(missions && missions.length > 0 && evaluateForMission);
  const activeMission = missionPickerEnabled && forMissionId
    ? missions!.find(m => m.id === forMissionId) ?? null
    : null;

  const rows = useMemo(() => {
    const skel = computeDispatchRows(asOf, assets, employees, bases, locationLabel);
    const base = decorateDispatchRows(skel, asOf, events, employees);
    if (!activeMission || !evaluateForMission) return base;
    return applyMissionOverride(base, evaluateForMission, activeMission.id, asOf);
  }, [asOf, assets, employees, bases, events, locationLabel, activeMission, evaluateForMission]);

  const summary = useMemo(() => {
    let available = 0, busy = 0, maintenance = 0;
    for (const r of rows) {
      if (r.status === 'available') available++;
      else if (r.status === 'busy') busy++;
      else maintenance++;
    }
    return { available, busy, maintenance };
  }, [rows]);

  const isNow = useMemo(() => Math.abs(Date.now() - asOf.getTime()) < 60_000, [asOf]);

  return (
    <div className={styles['root']} role="region" aria-label="Dispatch readiness">
      <div className={styles['toolbar']}>
        <div className={styles['title']}>
          <span className={styles['titleLabel']}>Dispatch</span>
          <span className={styles['titleHint']}>Who can launch right now?</span>
        </div>

        <div className={styles['asOfBlock']}>
          <label className={styles['asOfLabel']} htmlFor="dispatch-asof">
            <Clock size={13} aria-hidden="true" /> As of
          </label>
          <input
            id="dispatch-asof"
            type="datetime-local"
            className={styles['asOfInput']}
            value={formatDateTimeLocal(asOf)}
            onChange={e => {
              const d = new Date(e.target.value);
              if (isValid(d)) updateAsOf(d);
            }}
          />
          <button
            type="button"
            className={[styles['nowBtn'], isNow && styles['nowBtnActive']].filter(Boolean).join(' ')}
            onClick={() => updateAsOf(new Date())}
            disabled={isNow}
            title={isNow ? 'Already showing live status' : 'Reset to current time'}
          >
            Now
          </button>
        </div>

        {missionPickerEnabled && (
          <div className={styles['missionBlock']}>
            <label className={styles['asOfLabel']} htmlFor="dispatch-mission">
              For mission
            </label>
            <select
              id="dispatch-mission"
              className={styles['asOfInput']}
              value={forMissionId ?? ''}
              onChange={e => setForMissionId(e.target.value || null)}
              aria-label="Evaluate readiness against a specific mission"
            >
              <option value="">Generic readiness</option>
              {missions!.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}{m.sublabel ? ` — ${m.sublabel}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles['summary']}>
          <span className={[styles['summaryPill'], styles['summaryAvailable']].join(' ')}>
            {summary.available} Available
          </span>
          <span className={[styles['summaryPill'], styles['summaryBusy']].join(' ')}>
            {summary.busy} Busy
          </span>
          <span className={[styles['summaryPill'], styles['summaryMaintenance']].join(' ')}>
            {summary.maintenance} Maintenance
          </span>
        </div>
      </div>

      <div className={styles['scroll']}>
        {rows.length === 0 ? (
          <div className={styles['emptyState']}>
            <p>No {labelPluralLower} configured.</p>
            <p className={styles['emptyHint']}>Add {labelPluralLower} in Settings → Assets to populate this board.</p>
          </div>
        ) : (
          <table className={styles['table']} role="grid" aria-label={`${label} readiness`}>
            <thead>
              <tr>
                <th scope="col">{locationLabel}</th>
                <th scope="col">{label}</th>
                <th scope="col">Status</th>
                <th scope="col">Crew</th>
                <th scope="col">Equipment</th>
                <th scope="col">Missing / Note</th>
                <th scope="col" className={styles['actionCol']}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const assetLabel = row.asset.label ?? row.asset.name ?? String(row.asset.id);
                const sublabel = typeof row.asset.meta?.sublabel === 'string' ? row.asset.meta.sublabel : null;
                return (
                  <tr key={String(row.asset.id)} data-status={row.status}>
                    <td>{row.baseName}</td>
                    <td>
                      <div className={styles['assetCell']}>
                        <span className={styles['assetName']}>{assetLabel}</span>
                        {sublabel && <span className={styles['assetSub']}>{sublabel}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={[styles['statusPill'], styles[`status_${row.status}`]].join(' ')}>
                        <span className={styles['statusDot']} aria-hidden="true" />
                        {row.status === 'available' ? 'Available'
                          : row.status === 'busy' ? 'Busy'
                          : 'Maintenance'}
                      </span>
                    </td>
                    <td>
                      <ReadinessChip ok={row.crewReady} okIcon={<Users size={12} aria-hidden="true" />} okLabel="Ready" naLabel="—" na={row.status === 'maintenance'} />
                    </td>
                    <td>
                      <ReadinessChip ok={row.equipmentReady} okIcon={<Plane size={12} aria-hidden="true" />} okLabel="Ready" />
                    </td>
                    <td className={styles['missingCell']}>
                      {row.missing.length === 0 ? (
                        <span className={styles['missingNone']}>—</span>
                      ) : (
                        <ul className={styles['missingList']}>
                          {row.missing.map((m, i) => (
                            <li key={i}>
                              {m.startsWith('In maintenance')
                                ? <Wrench size={11} aria-hidden="true" />
                                : <AlertTriangle size={11} aria-hidden="true" />}
                              <span>{m}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={styles['actionCol']}>
                      <ActionButton
                        row={row}
                        onView={onEventClick}
                        missionLabel={activeMission?.label}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles['footer']}>
        <span>
          <MapPin size={11} aria-hidden="true" />
          {' '}{bases.length} {bases.length === 1 ? locationLabel.toLowerCase() : `${locationLabel.toLowerCase()}s`}
          {' · '}{assets.length} {assets.length === 1 ? labelLower : labelPluralLower}
        </span>
        <span>{format(asOf, 'EEE MMM d, h:mm a')}</span>
      </div>
    </div>
  );
}

function ReadinessChip({
  ok,
  okIcon,
  okLabel,
  naLabel,
  na = false,
}: {
  ok: boolean;
  okIcon?: React.ReactNode;
  okLabel: string;
  naLabel?: string;
  na?: boolean;
}) {
  if (na) return <span className={styles['naChip']}>{naLabel ?? '—'}</span>;
  return (
    <span className={[styles['readinessChip'], ok ? styles['readinessOk'] : styles['readinessNo']].join(' ')}>
      {ok ? okIcon : null}
      <span>{ok ? okLabel : 'Missing'}</span>
    </span>
  );
}

function ActionButton({
  row,
  onView,
  missionLabel,
}: {
  row: Row;
  onView?: ((event: LooseEvent) => void) | undefined;
  missionLabel?: string | undefined;
}) {
  const blockingEvent = row.blockingEvent;
  if (row.status === 'maintenance') {
    return blockingEvent
      ? <button type="button" className={styles['actionBtn']} onClick={() => onView?.(blockingEvent)}>View work</button>
      : <span className={styles['actionMuted']}>—</span>;
  }
  if (row.status === 'busy') {
    return blockingEvent
      ? <button type="button" className={styles['actionBtn']} onClick={() => onView?.(blockingEvent)}>View booking</button>
      : <span className={styles['actionMuted']}>—</span>;
  }
  if (!row.crewReady && row.baseId) {
    return <button type="button" className={[styles['actionBtn'], styles['actionWarn']].join(' ')}>Find crew</button>;
  }
  if (!row.equipmentReady) {
    return <span className={styles['actionMuted']}>Not eligible</span>;
  }
  const assignLabel = missionLabel ? `Assign to ${missionLabel}` : 'Assign';
  return <button type="button" className={[styles['actionBtn'], styles['actionPrimary']].join(' ')}>{assignLabel}</button>;
}
