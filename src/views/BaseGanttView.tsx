/**
 * BaseGanttView — Gantt-style view for bases.
 *
 * Layout (top to bottom, per selected base):
 *   - Base header row (base name + accountable managers + counts)
 *   - One row per asset assigned to the base
 *   - One row per employee assigned to the base
 *
 * Timeline spans 14 days starting from `currentDate` by default, with a
 * toolbar toggle to expand to 90 days when the owner needs the longer view.
 * Events are lane-packed per row using the same first-fit algorithm as
 * TimelineView / AssetsView so overlapping items stack cleanly.
 *
 * The left ("name") column is sticky so owners can scroll the timeline
 * horizontally without losing row identity. Accountable managers appear
 * in the base header as clickable `tel:` links so phone numbers stay one
 * tap away.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import {
  addDays, startOfDay, format, isToday, isWeekend,
  differenceInCalendarDays, min, max,
} from 'date-fns';
import { Phone } from 'lucide-react';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import styles from './BaseGanttView.module.css';
import type { CalendarViewEvent } from '../types/ui';

const NAME_W   = 240;
const LANE_H   = 24;
const LANE_GAP = 3;
const ROW_PAD  = 6;
const DAY_PX   = 64;

const SPAN_OPTIONS = [
  { id: 14 as const, label: '14 days' },
  { id: 90 as const, label: '90 days' },
];

type BaseDef = { id: string; name: string; regionId?: string | null };
type RegionDef = { id: string; name: string };
type ManagerAssignment = { title?: string; phone?: string };
type EmployeeDef = {
  id: string;
  name?: string;
  role?: string;
  color?: string;
  phone?: string;
  base?: string | null;
  accountableManagers?: ManagerAssignment[];
};
type AssetDef = {
  id: string;
  label?: string;
  meta?: { base?: string | null; sublabel?: string; [k: string]: unknown } | null;
};

interface BaseGanttEvent extends Omit<CalendarViewEvent, 'id' | 'title' | 'meta'> {
  id: string;
  title: string;
  color?: string;
  meta?: Record<string, unknown>;
}

interface LanedEvent extends BaseGanttEvent {
  _lane: number;
  _dayStart: number;
  _dayEnd: number;
}

function assignLanes(events: BaseGanttEvent[], rangeStart: Date, rangeEnd: Date): { events: LanedEvent[]; laneCount: number } {
  const clipped = events
    .filter(e => {
      const s = startOfDay(e.start);
      const en = startOfDay(e.end);
      return s <= rangeEnd && en >= rangeStart;
    })
    .map(e => ({
      ...e,
      _dayStart: differenceInCalendarDays(
        max([startOfDay(e.start), rangeStart]),
        rangeStart,
      ),
      _dayEnd: differenceInCalendarDays(
        min([startOfDay(e.end), rangeEnd]),
        rangeStart,
      ),
    } as LanedEvent))
    .sort((a, b) => a._dayStart - b._dayStart || a._dayEnd - b._dayEnd);

  const laneEnd: number[] = [];
  for (const ev of clipped) {
    let placed = false;
    for (let i = 0; i < laneEnd.length; i++) {
      if (laneEnd[i]! < ev._dayStart) {
        ev._lane = i;
        laneEnd[i] = ev._dayEnd;
        placed = true;
        break;
      }
    }
    if (!placed) {
      ev._lane = laneEnd.length;
      laneEnd.push(ev._dayEnd);
    }
  }

  return { events: clipped, laneCount: Math.max(1, laneEnd.length) };
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

export default function BaseGanttView({
  currentDate,
  events,
  onEventClick,
  employees = [],
  assets = [],
  bases = [],
  regions = [],
  locationLabel = 'Base',
  assetsLabel = 'Asset',
  selectedBaseIds = [],
  onBaseSelectionChange,
  dayWindow,
}: {
  currentDate: Date
  events: BaseGanttEvent[]
  onEventClick?: (ev: BaseGanttEvent) => void
  employees?: EmployeeDef[]
  assets?: AssetDef[]
  bases?: BaseDef[]
  regions?: RegionDef[]
  locationLabel?: string
  assetsLabel?: string
  selectedBaseIds?: string[]
  onBaseSelectionChange?: (ids: string[]) => void
  /**
   * External day-window override (in days) bound to the AppShell sub-toolbar
   * pills. When set to a positive number, takes precedence over the
   * internal 14/90 span toggle (which is hidden in that case to avoid
   * presenting two competing controls). null / undefined / 0 fall back to
   * the internal toggle.
   */
  dayWindow?: number | null | undefined
}) {
  const ctx = useCalendarContext();
  const [internalSpan, setInternalSpan] = useState<14 | 90>(14);
  const externalDayWindow = typeof dayWindow === 'number' && dayWindow > 0 ? dayWindow : null;
  const spanDays = externalDayWindow ?? internalSpan;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(() => new Set());
  const [hideEmpty, setHideEmpty] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Close picker on outside click / escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const rangeStart = useMemo(() => startOfDay(currentDate), [currentDate]);
  const rangeEnd   = useMemo(() => addDays(rangeStart, spanDays - 1), [rangeStart, spanDays]);
  const days       = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < spanDays; i++) out.push(addDays(rangeStart, i));
    return out;
  }, [rangeStart, spanDays]);

  // Keep today roughly in view when the range or span changes.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const todayIdx = differenceInCalendarDays(startOfDay(new Date()), rangeStart);
    if (todayIdx < 0 || todayIdx >= spanDays) {
      wrap.scrollLeft = 0;
      return;
    }
    const visibleW = Math.max(wrap.clientWidth - NAME_W, 0);
    const targetLeft = Math.max((todayIdx + 0.5) * DAY_PX - visibleW / 2, 0);
    wrap.scrollLeft = targetLeft;
  }, [rangeStart, spanDays]);

  // Bases passing the user's selection filter (no search, no hide-empty).
  // Also used to drive the picker's "selected" state.
  const selectedBases = useMemo(() => {
    if (!selectedBaseIds || selectedBaseIds.length === 0) return bases;
    const set = new Set(selectedBaseIds);
    return bases.filter(b => set.has(b.id));
  }, [bases, selectedBaseIds]);

  const empsByBase = useMemo(() => {
    const m = new Map<string, EmployeeDef[]>();
    employees.forEach(e => {
      if (!e.base) return;
      if (!m.has(e.base)) m.set(e.base, []);
      m.get(e.base)!.push(e);
    });
    return m;
  }, [employees]);

  const assetsByBase = useMemo(() => {
    const m = new Map<string, AssetDef[]>();
    assets.forEach(a => {
      const b = a?.meta?.base;
      if (!b) return;
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(a);
    });
    return m;
  }, [assets]);

  // Resource lookups for routing events to the right row.
  const empIndex = useMemo(() => {
    const m = new Map<string, string>(); // empId -> baseId
    employees.forEach(e => { if (e.base) m.set(String(e.id), e.base); });
    return m;
  }, [employees]);
  const assetIndex = useMemo(() => {
    const m = new Map<string, string>(); // assetId -> baseId
    assets.forEach(a => { if (a?.meta?.base) m.set(String(a.id), a.meta.base!); });
    return m;
  }, [assets]);

  const eventsByResource = useMemo(() => {
    const m = new Map<string, BaseGanttEvent[]>();
    for (const ev of events) {
      const r = ev?.resource != null ? String(ev.resource) : null;
      if (!r) continue;
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(ev as BaseGanttEvent);
    }
    return m;
  }, [events]);

  // Events tagged directly to a base via meta.base and not routed to an
  // asset / employee row — surfaced under a base-level "Base-wide" lane.
  const baseWideEvents = useMemo(() => {
    const m = new Map<string, BaseGanttEvent[]>();
    for (const ev of events) {
      const metaBase = ev?.meta?.['base'];
      if (!metaBase) continue;
      const resource = ev?.resource != null ? String(ev.resource) : null;
      if (resource && (empIndex.has(resource) || assetIndex.has(resource))) continue;
      const key = String(metaBase);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(ev as BaseGanttEvent);
    }
    return m;
  }, [events, empIndex, assetIndex]);

  // Per-base "has any event in current span" — drives the hide-empty toggle
  // and the count badge in the picker. Events are clipped to [rangeStart,
  // rangeEnd]; a base whose only events fall outside the visible window is
  // treated as empty so the toggle actually hides it.
  const isBaseEmpty = useMemo(() => {
    const overlapsRange = (e: BaseGanttEvent) => {
      const s = startOfDay(e.start);
      const en = startOfDay(e.end);
      return s <= rangeEnd && en >= rangeStart;
    };
    const m = new Map<string, boolean>();
    for (const b of bases) {
      const baseWide = baseWideEvents.get(b.id);
      if (baseWide && baseWide.some(overlapsRange)) { m.set(b.id, false); continue; }
      let any = false;
      for (const a of assetsByBase.get(b.id) ?? []) {
        if ((eventsByResource.get(String(a.id)) ?? []).some(overlapsRange)) { any = true; break; }
      }
      if (!any) {
        for (const e of empsByBase.get(b.id) ?? []) {
          if ((eventsByResource.get(String(e.id)) ?? []).some(overlapsRange)) { any = true; break; }
        }
      }
      m.set(b.id, !any);
    }
    return m;
  }, [bases, baseWideEvents, assetsByBase, empsByBase, eventsByResource, rangeStart, rangeEnd]);

  // Final list of bases to render: selection filter → hide-empty filter.
  const visibleBases = useMemo(() => {
    if (!hideEmpty) return selectedBases;
    return selectedBases.filter(b => !isBaseEmpty.get(b.id));
  }, [selectedBases, hideEmpty, isBaseEmpty]);

  // Group rendered bases by region. Bases with no regionId (or whose region
  // is not configured) fall into a synthetic 'Unassigned' bucket. When no
  // regions are configured at all, we still render a single flat group with
  // no region header (the consumer hasn't opted in to the hierarchy).
  const regionsById = useMemo(() => {
    const m = new Map<string, RegionDef>();
    regions.forEach(r => m.set(r.id, r));
    return m;
  }, [regions]);

  const groupedBases = useMemo(() => {
    if (regions.length === 0) {
      return [{ region: null as RegionDef | null, bases: visibleBases }];
    }
    const buckets = new Map<string, BaseDef[]>();
    const unassigned: BaseDef[] = [];
    for (const b of visibleBases) {
      const rid = b.regionId && regionsById.has(b.regionId) ? b.regionId : null;
      if (rid == null) { unassigned.push(b); continue; }
      if (!buckets.has(rid)) buckets.set(rid, []);
      buckets.get(rid)!.push(b);
    }
    const out: { region: RegionDef | null; bases: BaseDef[] }[] = [];
    for (const r of regions) {
      const list = buckets.get(r.id);
      if (list && list.length > 0) out.push({ region: r, bases: list });
    }
    if (unassigned.length > 0) {
      out.push({ region: { id: '__unassigned__', name: 'Unassigned' }, bases: unassigned });
    }
    return out;
  }, [regions, regionsById, visibleBases]);

  const toggleRegion = (id: string) => {
    setCollapsedRegions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const focusBase = (id: string) => {
    if (!onBaseSelectionChange) return;
    onBaseSelectionChange([id]);
  };

  const toggleBase = (id: string) => {
    if (!onBaseSelectionChange) return;
    const next = selectedBaseIds.includes(id)
      ? selectedBaseIds.filter(b => b !== id)
      : [...selectedBaseIds, id];
    onBaseSelectionChange(next);
  };

  if (bases.length === 0) {
    return (
      <div className={styles['empty']}>
        <p>No {locationLabel.toLowerCase()}s configured yet.</p>
        <p>Add one in Settings → Employees → {locationLabel}s.</p>
      </div>
    );
  }

  const timelineW = spanDays * DAY_PX;

  const renderBars = (evs: BaseGanttEvent[], rowH: number) => {
    const { events: laned } = assignLanes(evs, rangeStart, rangeEnd);
    return laned.map((ev, idx) => {
      const left   = ev._dayStart * DAY_PX;
      const width  = Math.max((ev._dayEnd - ev._dayStart + 1) * DAY_PX - 4, 8);
      const top    = ROW_PAD + ev._lane * (LANE_H + LANE_GAP);
      const bg     = resolveColor(ev as never, ctx['colorRules']) || ev.color || 'var(--wc-accent)';
      return (
        <button
          key={ev.id ?? `${ev.title}-${idx}`}
          type="button"
          className={styles['bar']}
          style={{ left, width, top, height: LANE_H, background: bg }}
          onClick={() => onEventClick?.(ev)}
          title={`${ev.title ?? ''}  ·  ${format(ev.start, 'PPp')} – ${format(ev.end, 'PPp')}`}
        >
          <span className={styles['barLabel']}>{ev.title ?? 'Event'}</span>
        </button>
      );
    });
  };

  const measureRowH = (evs: BaseGanttEvent[]): number => {
    const { laneCount } = assignLanes(evs, rangeStart, rangeEnd);
    return Math.max(laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2, ROW_PAD * 2 + LANE_H);
  };

  return (
    <div className={styles['root']}>
      <div className={styles['toolbar']}>
        {/* Hide the internal 14/90 span toggle when an external dayWindow
         * is driving the grid — otherwise users see two competing controls
         * (the SubToolbar pills + this toggle) for the same setting. */}
        {!externalDayWindow && (
          <div className={styles['toolbarGroup']}>
            <span className={styles['toolbarLabel']}>Span</span>
            <div className={styles['spanToggle']} role="group" aria-label="Timeline span">
              {SPAN_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={[styles['spanBtn'], spanDays === opt.id && styles['spanBtnActive']].filter(Boolean).join(' ')}
                  onClick={() => setInternalSpan(opt.id)}
                  aria-pressed={spanDays === opt.id}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles['toolbarGroup']}>
          <span className={styles['toolbarLabel']}>{locationLabel}s</span>
          <div ref={pickerRef} className={styles['pickerWrap']}>
            {(() => {
              const total = bases.length;
              const sel = selectedBaseIds.length;
              const summary = sel === 0
                ? `All ${locationLabel.toLowerCase()}s (${total})`
                : sel === 1
                  ? (bases.find(b => b.id === selectedBaseIds[0])?.name ?? `1 ${locationLabel.toLowerCase()}`)
                  : `${sel} of ${total} ${locationLabel.toLowerCase()}s`;
              return (
                <button
                  type="button"
                  className={styles['pickerTrigger']}
                  aria-haspopup="listbox"
                  aria-expanded={pickerOpen}
                  onClick={() => setPickerOpen(o => !o)}
                >
                  <span className={styles['pickerTriggerLabel']}>{summary}</span>
                  <span className={styles['pickerCaret']} aria-hidden>▾</span>
                </button>
              );
            })()}
            {pickerOpen && (() => {
              const q = pickerQuery.trim().toLowerCase();
              const matches = (b: BaseDef) => !q || b.name.toLowerCase().includes(q);
              const filtered = bases.filter(matches);
              // Group by region for the picker (independent of hide-empty / selection).
              const buckets = new Map<string, BaseDef[]>();
              const unassigned: BaseDef[] = [];
              for (const b of filtered) {
                const rid = b.regionId && regionsById.has(b.regionId) ? b.regionId : null;
                if (rid == null) { unassigned.push(b); continue; }
                if (!buckets.has(rid)) buckets.set(rid, []);
                buckets.get(rid)!.push(b);
              }
              const pickerGroups: { region: RegionDef | null; bases: BaseDef[] }[] = [];
              if (regions.length === 0) {
                pickerGroups.push({ region: null, bases: filtered });
              } else {
                for (const r of regions) {
                  const list = buckets.get(r.id);
                  if (list && list.length > 0) pickerGroups.push({ region: r, bases: list });
                }
                if (unassigned.length > 0) {
                  pickerGroups.push({ region: { id: '__unassigned__', name: 'Unassigned' }, bases: unassigned });
                }
              }
              return (
                <div className={styles['pickerPopover']} role="listbox" aria-label={`${locationLabel}s`}>
                  <div className={styles['pickerHeader']}>
                    <input
                      autoFocus
                      type="search"
                      className={styles['pickerSearch']}
                      placeholder={`Search ${locationLabel.toLowerCase()}s…`}
                      value={pickerQuery}
                      onChange={e => setPickerQuery(e.target.value)}
                    />
                    <div className={styles['pickerActions']}>
                      <button
                        type="button"
                        className={styles['pickerActionBtn']}
                        onClick={() => onBaseSelectionChange?.([])}
                        disabled={selectedBaseIds.length === 0}
                      >
                        Show all
                      </button>
                      <button
                        type="button"
                        className={styles['pickerActionBtn']}
                        onClick={() => {
                          if (filtered.length === 0) return;
                          onBaseSelectionChange?.(filtered.map(b => b.id));
                        }}
                        disabled={filtered.length === 0}
                        title={filtered.length === 0 ? 'No matches to apply' : `Show only the ${filtered.length} matching ${locationLabel.toLowerCase()}s`}
                      >
                        Only these
                      </button>
                    </div>
                  </div>
                  <div className={styles['pickerList']}>
                    {filtered.length === 0 && (
                      <div className={styles['pickerEmpty']}>No matches</div>
                    )}
                    {pickerGroups.map(g => (
                      <div key={g.region?.id ?? '__none__'} className={styles['pickerGroup']}>
                        {g.region && (
                          <div className={styles['pickerGroupLabel']}>{g.region.name}</div>
                        )}
                        {g.bases.map(b => {
                          const checked = selectedBaseIds.length === 0 || selectedBaseIds.includes(b.id);
                          const empty = isBaseEmpty.get(b.id) === true;
                          return (
                            <label key={b.id} className={styles['pickerOption']}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleBase(b.id)}
                              />
                              <span className={styles['pickerOptionName']}>{b.name}</span>
                              {empty && <span className={styles['pickerOptionEmpty']}>empty</span>}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <label className={styles['toolbarToggle']}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={e => setHideEmpty(e.target.checked)}
          />
          <span>Hide empty</span>
        </label>

        <div className={styles['toolbarSpacer']} />
        <div className={styles['rangeLabel']}>
          {format(rangeStart, 'MMM d, yyyy')} – {format(rangeEnd, 'MMM d, yyyy')}
        </div>
      </div>

      <div ref={wrapRef} className={styles['wrap']}>
        <div className={styles['inner']} style={{ minWidth: NAME_W + timelineW }}>
          {/* Header row with day columns */}
          <div className={styles['headerRow']}>
            <div className={styles['corner']} style={{ width: NAME_W }}>
              {locationLabel} · People · {assetsLabel}s
            </div>
            <div className={styles['days']} style={{ width: timelineW }}>
              {days.map((d, i) => {
                const cls = [
                  styles['dayCell'],
                  isToday(d) && styles['dayToday'],
                  isWeekend(d) && styles['dayWeekend'],
                ].filter(Boolean).join(' ');
                return (
                  <div key={i} className={cls} style={{ left: i * DAY_PX, width: DAY_PX }}>
                    <span className={styles['dayDow']}>{format(d, 'EEE')}</span>
                    <span className={styles['dayNum']}>{format(d, 'd')}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Base groups, grouped by region when configured. */}
          {groupedBases.map(group => {
            const region = group.region;
            const collapsed = region ? collapsedRegions.has(region.id) : false;
            return (
              <div key={region?.id ?? '__flat__'} className={styles['regionBlock']}>
                {region && (
                  <button
                    type="button"
                    className={styles['regionHeader']}
                    onClick={() => toggleRegion(region.id)}
                    aria-expanded={!collapsed}
                  >
                    <span className={styles['regionCaret']} aria-hidden>{collapsed ? '▸' : '▾'}</span>
                    <span className={styles['regionName']}>{region.name}</span>
                    <span className={styles['regionCount']}>{group.bases.length} {locationLabel.toLowerCase()}{group.bases.length === 1 ? '' : 's'}</span>
                  </button>
                )}
                {!collapsed && group.bases.map(b => {
            const baseEmps   = empsByBase.get(b.id) ?? [];
            const baseAssets = assetsByBase.get(b.id) ?? [];
            const baseWide   = baseWideEvents.get(b.id) ?? [];
            const managers: Array<{ emp: EmployeeDef; assignment: ManagerAssignment }> = [];
            for (const e of baseEmps) {
              for (const m of e.accountableManagers ?? []) {
                if (m?.title) managers.push({ emp: e, assignment: m });
              }
            }

            const baseRowH = measureRowH(baseWide);

            return (
              <div key={b.id} className={styles['baseGroup']}>
                {/* Base header row */}
                <div className={styles['baseHeaderRow']} style={{ minHeight: Math.max(baseRowH, 72) }}>
                  <div className={styles['baseHeaderName']} style={{ width: NAME_W }}>
                    <button
                      type="button"
                      className={styles['baseTitle']}
                      title={`Focus ${b.name}  ·  Shift-click to toggle in selection`}
                      onClick={(e) => { if (e.shiftKey) toggleBase(b.id); else focusBase(b.id); }}
                    >
                      {b.name}
                    </button>
                    <div className={styles['baseCounts']}>
                      {baseAssets.length} {assetsLabel.toLowerCase()}s · {baseEmps.length} people
                    </div>
                    {managers.length > 0 && (
                      <ul className={styles['managerList']}>
                        {managers.map((mg, i) => {
                          const phone = mg.assignment.phone || mg.emp.phone;
                          return (
                            <li key={`${mg.emp.id}-${i}`} className={styles['managerRow']}>
                              <span className={styles['managerTitle']}>{mg.assignment.title}</span>
                              <span className={styles['managerName']}>{mg.emp.name ?? mg.emp.id}</span>
                              {phone && (
                                <a
                                  className={styles['managerPhone']}
                                  href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
                                  title={`Call ${mg.emp.name ?? mg.emp.id}`}
                                >
                                  <Phone size={11} aria-hidden />
                                  {formatPhone(phone)}
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className={styles['timelineCell']} style={{ width: timelineW, minHeight: Math.max(baseRowH, 72) }}>
                    {days.map((d, i) => (
                      <div
                        key={i}
                        className={[
                          styles['gridCol'],
                          isToday(d) && styles['gridColToday'],
                          isWeekend(d) && styles['gridColWeekend'],
                        ].filter(Boolean).join(' ')}
                        style={{ left: i * DAY_PX, width: DAY_PX }}
                      />
                    ))}
                    {renderBars(baseWide, baseRowH)}
                  </div>
                </div>

                {/* Asset rows */}
                {baseAssets.map(a => {
                  const rowEvs = eventsByResource.get(String(a.id)) ?? [];
                  const rowH = measureRowH(rowEvs);
                  return (
                    <div key={`asset-${a.id}`} className={styles['assetRow']} style={{ minHeight: rowH }}>
                      <div className={styles['rowName']} style={{ width: NAME_W }}>
                        <span className={styles['rowKind']}>{assetsLabel}</span>
                        <span className={styles['rowTitle']}>{a.label ?? a.id}</span>
                        {a.meta?.sublabel && <span className={styles['rowSub']}>{a.meta.sublabel}</span>}
                      </div>
                      <div className={styles['timelineCell']} style={{ width: timelineW, minHeight: rowH }}>
                        {days.map((d, i) => (
                          <div
                            key={i}
                            className={[
                              styles['gridCol'],
                              isToday(d) && styles['gridColToday'],
                              isWeekend(d) && styles['gridColWeekend'],
                            ].filter(Boolean).join(' ')}
                            style={{ left: i * DAY_PX, width: DAY_PX }}
                          />
                        ))}
                        {renderBars(rowEvs, rowH)}
                      </div>
                    </div>
                  );
                })}

                {/* Person rows */}
                {baseEmps.map(e => {
                  const rowEvs = eventsByResource.get(String(e.id)) ?? [];
                  const rowH = measureRowH(rowEvs);
                  const mgrTitles = (e.accountableManagers ?? [])
                    .map(m => m?.title)
                    .filter(Boolean) as string[];
                  return (
                    <div key={`emp-${e.id}`} className={styles['personRow']} style={{ minHeight: rowH }}>
                      <div className={styles['rowName']} style={{ width: NAME_W }}>
                        <span className={styles['rowKind']}>Person</span>
                        <span className={styles['rowTitle']}>{e.name ?? e.id}</span>
                        <span className={styles['rowMeta']}>
                          {e.role && <span className={styles['rowSub']}>{e.role}</span>}
                          {mgrTitles.length > 0 && (
                            <span className={styles['mgrBadgeWrap']}>
                              {mgrTitles.map(t => (
                                <span key={t} className={styles['mgrBadge']}>{t}</span>
                              ))}
                            </span>
                          )}
                          {e.phone && (
                            <a
                              className={styles['rowPhone']}
                              href={`tel:${e.phone.replace(/[^0-9+]/g, '')}`}
                              title={`Call ${e.name ?? e.id}`}
                            >
                              <Phone size={10} aria-hidden /> {formatPhone(e.phone)}
                            </a>
                          )}
                        </span>
                      </div>
                      <div className={styles['timelineCell']} style={{ width: timelineW, minHeight: rowH }}>
                        {days.map((d, i) => (
                          <div
                            key={i}
                            className={[
                              styles['gridCol'],
                              isToday(d) && styles['gridColToday'],
                              isWeekend(d) && styles['gridColWeekend'],
                            ].filter(Boolean).join(' ')}
                            style={{ left: i * DAY_PX, width: DAY_PX }}
                          />
                        ))}
                        {renderBars(rowEvs, rowH)}
                      </div>
                    </div>
                  );
                })}

                {baseAssets.length === 0 && baseEmps.length === 0 && (
                  <div className={styles['emptyRow']}>
                    <div className={styles['rowName']} style={{ width: NAME_W }}>
                      <span className={styles['rowKind']}>—</span>
                      <span className={styles['rowSub']}>No {assetsLabel.toLowerCase()}s or people assigned.</span>
                    </div>
                    <div className={styles['timelineCell']} style={{ width: timelineW, height: 32 }} />
                  </div>
                )}
              </div>
            );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
