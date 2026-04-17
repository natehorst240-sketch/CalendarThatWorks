/**
 * AssetsView.jsx — Horizontal resource (asset) timeline / Gantt view.
 *
 * Phase 1 Sprint 2 skeleton. Cloned from TimelineView but stripped of
 * employee-specific shift coverage / on-call / action-card machinery.
 *
 * Key responsibilities:
 *   - Rows derived from event.resource (one row per distinct asset).
 *   - Horizontal pill bars sized by duration and laid out with
 *     first-fit lane packing (shared algorithm with TimelineView).
 *   - Pxpday scales with zoomLevel (day=80, week=30, month=10, quarter=4).
 *   - Sticky left asset column: registration + sublabel + banner slot.
 *     Location banner is a placeholder in Sprint 2; Sprint 3 wires the
 *     real LocationProvider.
 *   - Category hue comes from categoriesConfig / DEFAULT_CATEGORIES,
 *     then falls back to the event's explicit color / colorRules.
 *   - Approval-stage visuals read from event.meta.approvalStage.stage
 *     (5 states per Phase 0 contract).
 */
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, isToday, isWeekend,
  differenceInCalendarDays, startOfDay, addDays, min, max,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext.js';
import styles from './AssetsView.module.css';
import { useGrouping } from '../hooks/useGrouping.js';
import { buildFieldAccessor } from '../grouping/buildFieldAccessor.js';
import { useResourceLocations } from '../hooks/useResourceLocations.ts';
import { DEFAULT_CATEGORIES } from '../types/assets.ts';
import AuditDrawer from './AuditDrawer.jsx';

const AUDIT_STAGES = new Set(['denied', 'pending_higher']);

// ─── Layout constants ─────────────────────────────────────────────────────────

const NAME_W   = 220;  // px — asset column (registration + sublabel + banner)
const LANE_H   = 26;   // px — each event lane
const LANE_GAP = 3;    // px — gap between lanes
const ROW_PAD  = 8;    // px — top/bottom padding per row
const OVERSCAN_ROWS = 3;

// Zoom level → pixels per day. Sprint 2 keeps the visible range = current
// month; later sprints may expand the range at coarser zooms.
const ZOOM_PX_PER_DAY = { day: 80, week: 30, month: 10, quarter: 4 };
const ZOOM_LABELS     = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter' };
const ZOOM_ORDER      = ['day', 'week', 'month', 'quarter'];

const APPROVAL_STAGES = new Set([
  'requested', 'approved', 'finalized', 'pending_higher', 'denied',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assignLanes(events, monthStart, monthEnd) {
  const clipped = events
    .filter(e => startOfDay(e.start) <= monthEnd && startOfDay(e.end) >= monthStart)
    .map(e => ({
      ...e,
      _dayStart: differenceInCalendarDays(
        max([startOfDay(e.start), monthStart]),
        monthStart,
      ),
      _dayEnd: differenceInCalendarDays(
        min([startOfDay(e.end), monthEnd]),
        monthStart,
      ),
    }))
    .sort((a, b) => a._dayStart - b._dayStart || a._dayEnd - b._dayEnd);

  const laneEnd = [];
  for (const ev of clipped) {
    let placed = false;
    for (let i = 0; i < laneEnd.length; i++) {
      if (laneEnd[i] < ev._dayStart) {
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

function buildCategoryColorMap(categoriesConfig) {
  const map = new Map();
  const defs = categoriesConfig?.categories?.length
    ? categoriesConfig.categories
    : DEFAULT_CATEGORIES;
  for (const def of defs) {
    if (def?.id && def?.color) map.set(def.id, def.color);
  }
  return map;
}

function resolveAssetColor(ev, categoryColorMap, colorRules) {
  // Priority: colorRules > categoriesConfig > event.color > undefined.
  const ruleColor = resolveColor(ev, colorRules);
  if (ruleColor) return ruleColor;
  if (ev.category && categoryColorMap.has(ev.category)) {
    return categoryColorMap.get(ev.category);
  }
  return ev.color;
}

function getApprovalStage(ev) {
  const stage = ev?.meta?.approvalStage?.stage;
  return APPROVAL_STAGES.has(stage) ? stage : null;
}

function approvalClass(stage) {
  switch (stage) {
    case 'requested':      return styles.stageRequested;
    case 'approved':       return styles.stageApproved;
    case 'finalized':      return styles.stageFinalized;
    case 'pending_higher': return styles.stagePendingHigher;
    case 'denied':         return styles.stageDenied;
    default:               return '';
  }
}

function approvalPrefix(stage) {
  if (stage === 'requested')      return 'REQUESTED';
  if (stage === 'finalized')      return 'FINALIZED';
  if (stage === 'pending_higher') return 'PENDING';
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AssetsView({
  currentDate,
  events,
  onEventClick,
  onDateSelect,
  groupBy,
  categoriesConfig,
  zoomLevel = 'month',
  onZoomChange,
  locationProvider,
  renderAssetLocation,
}) {
  const ctx = useCalendarContext();

  const [auditEvent, setAuditEvent] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const drawerOpenerRef = useRef(null);

  const announce = useCallback((msg) => {
    // Appending a zero-width space forces a diff so screen readers re-read
    // even when the same message fires twice in a row.
    setAnnouncement(prev => (prev === msg ? msg + '\u200b' : msg));
  }, []);

  const openAudit = useCallback((ev, opener) => {
    drawerOpenerRef.current = opener ?? null;
    setAuditEvent(ev);
    announce(`Audit history opened for ${ev.title}`);
  }, [announce]);

  const closeAudit = useCallback(() => {
    setAuditEvent(null);
    announce('Audit history closed');
    const opener = drawerOpenerRef.current;
    if (opener && typeof opener.focus === 'function') {
      requestAnimationFrame(() => opener.focus());
    }
    drawerOpenerRef.current = null;
  }, [announce]);

  const handleZoomChange = useCallback((next) => {
    if (!onZoomChange) return;
    onZoomChange(next);
    announce(`Zoom: ${ZOOM_LABELS[next] ?? next}`);
  }, [onZoomChange, announce]);

  const activeZoom = ZOOM_PX_PER_DAY[zoomLevel] ? zoomLevel : 'month';
  const pxPerDay   = ZOOM_PX_PER_DAY[activeZoom];

  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const days       = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart.toISOString()],
  );
  const totalDays = days.length;

  const categoryColorMap = useMemo(
    () => buildCategoryColorMap(categoriesConfig),
    [categoriesConfig],
  );

  const pillStyle = categoriesConfig?.pillStyle ?? 'hue';

  // ── Keyboard grid navigation ───────────────────────────────────────────────
  const [focusedCell, setFocusedCell] = useState({ rowIdx: 0, dayIdx: 0 });
  const lastKeyNavCell = useRef(false);
  const gridRef        = useRef(null);
  const wrapRef        = useRef(null);

  // ── Virtualization ─────────────────────────────────────────────────────────
  const [scrollState, setScrollState] = useState({ top: 0, height: 2000 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScrollState({ top: el.scrollTop, height: el.clientHeight || 2000 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);

  // ── Row source: derive asset rows from event.resource ──────────────────────
  const resourceList = useMemo(() => {
    const set = new Set();
    events.forEach(e => set.add(e.resource ?? '(Unassigned)'));
    return [...set].sort((a, b) => {
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      return a.localeCompare(b);
    });
  }, [events]);

  // ── Live locations (via LocationProvider) ──────────────────────────────────
  const locations = useResourceLocations(resourceList, locationProvider);

  const rows = useMemo(() => resourceList.map(resource => {
    const resEvents = events.filter(e => (e.resource ?? '(Unassigned)') === resource);
    const { events: laned, laneCount } = assignLanes(resEvents, monthStart, monthEnd);
    const rowH = Math.max(
      laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2,
      ROW_PAD * 2 + LANE_H + 16,
    );
    // Sublabel: first event with meta.assetSublabel / meta.sublabel wins.
    const firstWithMeta = resEvents.find(e => e.meta?.assetSublabel || e.meta?.sublabel);
    const sublabel = firstWithMeta?.meta?.assetSublabel ?? firstWithMeta?.meta?.sublabel ?? null;
    return {
      key: resource,
      resource,
      sublabel,
      events: laned,
      laneCount,
      rowH,
    };
  }), [resourceList, events, monthStart.toISOString(), monthEnd.toISOString()]);

  // ── Grouping ───────────────────────────────────────────────────────────────
  const GROUP_HEADER_H = 36;
  const fieldAccessor = useMemo(
    () => groupBy ? buildFieldAccessor(groupBy, 'resource') : null,
    [groupBy],
  );
  const { flatRows, toggleGroup } = useGrouping(rows, {
    groupBy, fieldAccessor, groupHeaderHeight: GROUP_HEADER_H,
  });

  // ── Cumulative row offsets ─────────────────────────────────────────────────
  const rowOffsets = useMemo(() => {
    const offsets = [0];
    for (const row of flatRows) offsets.push(offsets[offsets.length - 1] + row.rowH);
    return offsets;
  }, [flatRows]);

  const totalBodyH = rowOffsets[flatRows.length] ?? 0;

  const [visStart, visEnd] = useMemo(() => {
    const { top, height } = scrollState;
    const viewH = height || 2000;
    let s = 0;
    let e = flatRows.length - 1;
    for (let i = 0; i < flatRows.length; i++) {
      if (rowOffsets[i + 1] <= top) s = i + 1;
    }
    for (let i = flatRows.length - 1; i >= 0; i--) {
      if (rowOffsets[i] < top + viewH) { e = i; break; }
    }
    return [
      Math.max(0, s - OVERSCAN_ROWS),
      Math.min(flatRows.length - 1, e + OVERSCAN_ROWS),
    ];
  }, [scrollState, rowOffsets, flatRows.length]);

  // ── Keyboard handler ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastKeyNavCell.current) return;
    lastKeyNavCell.current = false;
    const { rowIdx, dayIdx } = focusedCell;

    const wrap = wrapRef.current;
    if (wrap && rowOffsets.length > rowIdx + 1) {
      const rowTop    = rowOffsets[rowIdx];
      const rowBottom = rowOffsets[rowIdx + 1];
      if (rowTop < wrap.scrollTop) {
        wrap.scrollTop = rowTop;
      } else if (rowBottom > wrap.scrollTop + wrap.clientHeight) {
        wrap.scrollTop = rowBottom - wrap.clientHeight;
      }
    }

    const tryFocus = () => {
      const el = gridRef.current?.querySelector(`[data-cell="${rowIdx}-${dayIdx}"]`);
      el?.focus({ preventScroll: false });
    };
    tryFocus();
    if (!gridRef.current?.querySelector(`[data-cell="${rowIdx}-${dayIdx}"]`)) {
      requestAnimationFrame(tryFocus);
    }
  }, [focusedCell, rowOffsets]);

  const handleCellKeyDown = useCallback((e, ri, di, cellRowEvents, resourceId) => {
    const maxRi = flatRows.length - 1;
    const maxDi = totalDays - 1;
    let nextRi = ri, nextDi = di;
    let move = false;
    switch (e.key) {
      case 'ArrowLeft':  nextDi = Math.max(0, di - 1);     move = true; break;
      case 'ArrowRight': nextDi = Math.min(maxDi, di + 1); move = true; break;
      case 'ArrowUp': {
        nextRi = ri - 1;
        while (nextRi >= 0 && flatRows[nextRi]?._type === 'groupHeader') nextRi--;
        nextRi = Math.max(0, nextRi);
        if (flatRows[nextRi]?._type === 'groupHeader') nextRi = ri;
        move = true; break;
      }
      case 'ArrowDown': {
        nextRi = ri + 1;
        while (nextRi <= maxRi && flatRows[nextRi]?._type === 'groupHeader') nextRi++;
        nextRi = Math.min(maxRi, nextRi);
        if (flatRows[nextRi]?._type === 'groupHeader') nextRi = ri;
        move = true; break;
      }
      case 'Home': nextDi = 0;     move = true; break;
      case 'End':  nextDi = maxDi; move = true; break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const hit = cellRowEvents.find(ev => ev._dayStart <= di && ev._dayEnd >= di);
        if (hit) {
          const hitStage = getApprovalStage(hit);
          if (AUDIT_STAGES.has(hitStage)) openAudit(hit, e.currentTarget);
          else onEventClick?.(hit);
        } else {
          const dayDate = days[di];
          onDateSelect?.(startOfDay(dayDate), addDays(startOfDay(dayDate), 1), resourceId);
        }
        return;
      }
      default: return;
    }
    if (move) {
      e.preventDefault();
      lastKeyNavCell.current = true;
      setFocusedCell({ rowIdx: nextRi, dayIdx: nextDi });
    }
  }, [flatRows, totalDays, onEventClick, onDateSelect, days, openAudit]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    if (ctx?.emptyState) return <>{ctx.emptyState}</>;
    return (
      <div className={styles.empty}>
        <p>No assets to display in {format(currentDate, 'MMMM yyyy')}.</p>
      </div>
    );
  }

  const dayColW = pxPerDay;
  const showDayAbbr = dayColW >= 24;
  const showDayNum  = dayColW >= 12;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrap} ref={wrapRef} data-zoom={activeZoom}>
      <div
        className={styles.inner}
        style={{ width: NAME_W + totalDays * dayColW }}
        role="grid"
        aria-label={`Assets timeline for ${format(currentDate, 'MMMM yyyy')}`}
        aria-rowcount={flatRows.length + 1}
        aria-colcount={totalDays + 1}
        ref={gridRef}
      >
        {/* ── Sticky header ── */}
        <div className={styles.headerRow} role="row" aria-rowindex={1}>
          <div
            className={styles.cornerCell}
            style={{ width: NAME_W, minWidth: NAME_W }}
            role="columnheader"
            aria-label={`Assets — ${format(currentDate, 'MMMM yyyy')}`}
          >
            <span className={styles.cornerTitle}>
              {format(currentDate, 'MMM yyyy')}
            </span>
            <div className={styles.zoomControl} role="group" aria-label="Zoom level">
              {ZOOM_ORDER.map(z => (
                <button
                  key={z}
                  type="button"
                  className={[
                    styles.zoomBtn,
                    z === activeZoom && styles.zoomBtnActive,
                  ].filter(Boolean).join(' ')}
                  aria-pressed={z === activeZoom}
                  aria-label={`Zoom to ${ZOOM_LABELS[z]}`}
                  onClick={() => handleZoomChange(z)}
                  disabled={!onZoomChange}
                >
                  {ZOOM_LABELS[z][0]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.dayHeads} role="presentation">
            {days.map((day, di) => (
              <div
                key={format(day, 'yyyy-MM-dd')}
                role="columnheader"
                aria-label={`${format(day, 'EEEE, MMMM d')}${isToday(day) ? ', today' : ''}`}
                aria-colindex={di + 2}
                className={[
                  styles.dayHead,
                  isToday(day)   && styles.todayHead,
                  isWeekend(day) && styles.weekendHead,
                ].filter(Boolean).join(' ')}
                style={{ width: dayColW, minWidth: dayColW }}
              >
                {showDayNum && (
                  <span className={styles.dayNum} aria-hidden="true">{format(day, 'd')}</span>
                )}
                {showDayAbbr && (
                  <span className={styles.dayAbbr} aria-hidden="true">{format(day, 'EEE')}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div
          className={styles.body}
          role="presentation"
          style={{ position: 'relative', height: totalBodyH }}
        >
          {flatRows.slice(visStart, visEnd + 1).map((rowData, relIdx) => {
            const rowIdx = visStart + relIdx;

            if (rowData._type === 'groupHeader') {
              const topOffset = rowOffsets[rowIdx];
              return (
                <div
                  key={`gh-${rowData.groupKey}`}
                  className={styles.groupHeaderRow}
                  style={{ position: 'absolute', top: topOffset, left: 0, right: 0, height: rowData.rowH }}
                  role="row"
                  aria-rowindex={rowIdx + 2}
                >
                  <div className={styles.groupHeaderCell} style={{ width: NAME_W + totalDays * dayColW }}>
                    <button
                      className={styles.groupToggleBtn}
                      onClick={() => toggleGroup(rowData.groupKey)}
                      aria-expanded={!rowData.collapsed}
                      aria-label={`${rowData.collapsed ? 'Expand' : 'Collapse'} group ${rowData.groupLabel}`}
                    >
                      <span className={styles.groupChevron} data-collapsed={rowData.collapsed || undefined}>&#9656;</span>
                      <span className={styles.groupLabel}>{rowData.groupLabel}</span>
                      <span className={styles.groupCount}>{rowData.count}</span>
                    </button>
                  </div>
                </div>
              );
            }

            const { key, resource, sublabel, events: rowEvents, rowH } = rowData;
            const topOffset = rowOffsets[rowIdx];
            const locationData = locations.get(resource) ?? null;

            return (
              <div
                key={key}
                className={styles.row}
                style={{
                  position: 'absolute',
                  top:      topOffset,
                  left:     0,
                  right:    0,
                  height:   rowH,
                  minHeight: rowH,
                }}
                role="row"
                aria-rowindex={rowIdx + 2}
              >
                {/* Sticky asset cell — row header */}
                <div
                  className={styles.nameCell}
                  style={{ width: NAME_W, minWidth: NAME_W, height: rowH }}
                  role="rowheader"
                  aria-label={resource}
                >
                  <div className={styles.assetMeta}>
                    <span className={styles.assetRegistration}>{resource}</span>
                    {sublabel && (
                      <span className={styles.assetSublabel}>{sublabel}</span>
                    )}
                  </div>
                  <div
                    className={styles.locationBanner}
                    aria-label={locationData
                      ? `Asset location: ${locationData.text} (${locationData.status})`
                      : 'Asset location'}
                    data-status={locationData?.status ?? 'placeholder'}
                  >
                    {renderAssetLocation
                      ? renderAssetLocation(locationData, { id: resource })
                      : locationData
                        ? <span className={styles.locationText}>{locationData.text}</span>
                        : <span className={styles.locationPlaceholder}>Location —</span>
                    }
                  </div>
                </div>

                {/* Event zone */}
                <div
                  className={styles.eventZone}
                  style={{ width: totalDays * dayColW, height: rowH, position: 'relative' }}
                  role="presentation"
                >
                  {days.map((day, di) => (
                    <div
                      key={di}
                      className={[
                        styles.dayCol,
                        isToday(day)   && styles.todayCol,
                        isWeekend(day) && styles.weekendCol,
                      ].filter(Boolean).join(' ')}
                      style={{ left: di * dayColW, width: dayColW, height: rowH }}
                    />
                  ))}

                  {days.map((day, di) => {
                    const isFocused  = focusedCell.rowIdx === rowIdx && focusedCell.dayIdx === di;
                    const resourceId = resource;
                    const cellHasEvent = rowEvents.some(ev => ev._dayStart <= di && ev._dayEnd >= di);
                    return (
                      <div
                        key={`kbcell-${di}`}
                        role="gridcell"
                        tabIndex={isFocused ? 0 : -1}
                        data-cell={`${rowIdx}-${di}`}
                        aria-label={`${resource}, ${format(day, 'MMMM d')}${isToday(day) ? ', today' : ''}${cellHasEvent ? '' : ', empty — click to create'}`}
                        aria-rowindex={rowIdx + 2}
                        aria-colindex={di + 2}
                        className={styles.kbCell}
                        style={{ left: di * dayColW, width: dayColW, top: 0, height: rowH }}
                        onKeyDown={e => handleCellKeyDown(e, rowIdx, di, rowEvents, resourceId)}
                        onClick={() => {
                          setFocusedCell({ rowIdx, dayIdx: di });
                          if (!cellHasEvent) {
                            onDateSelect?.(startOfDay(day), addDays(startOfDay(day), 1), resourceId);
                          }
                        }}
                      />
                    );
                  })}

                  {/* Event pills */}
                  {rowEvents.map(ev => {
                    const evColor = resolveAssetColor(ev, categoryColorMap, ctx?.colorRules);
                    const left    = ev._dayStart * dayColW + 2;
                    const width   = Math.max(dayColW - 4, (ev._dayEnd - ev._dayStart + 1) * dayColW - 4);
                    const top     = ROW_PAD + ev._lane * (LANE_H + LANE_GAP);
                    const stage       = getApprovalStage(ev);
                    const onClick = (e) => {
                      if (AUDIT_STAGES.has(stage)) openAudit(ev, e.currentTarget);
                      else onEventClick?.(ev);
                    };
                    const prefix      = approvalPrefix(stage);
                    const statusClass = ev.status === 'cancelled' ? styles.cancelled
                      : ev.status === 'tentative' ? styles.tentative : '';

                    const ariaLabel = [
                      ev.title,
                      ev.category && `category ${ev.category}`,
                      stage && `stage ${stage.replace('_', ' ')}`,
                      ev.status && ev.status !== 'confirmed' && ev.status,
                    ].filter(Boolean).join(', ');

                    return (
                      <button
                        key={ev.id}
                        className={[
                          styles.event,
                          styles[`pill_${pillStyle}`] || styles.pill_hue,
                          approvalClass(stage),
                          statusClass,
                        ].filter(Boolean).join(' ')}
                        style={{ left, top, width, height: LANE_H, '--ev-color': evColor }}
                        onClick={onClick}
                        aria-label={ariaLabel}
                        data-stage={stage || undefined}
                      >
                        {prefix && (
                          <span className={styles.stagePrefix} aria-hidden="true">{prefix}</span>
                        )}
                        <span className={styles.evTitle}>{ev.title}</span>
                        {(ev._dayEnd - ev._dayStart + 1) * dayColW >= 60 && ev.category && (
                          <span className={styles.evCat} aria-hidden="true">{ev.category}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AuditDrawer event={auditEvent} onClose={closeAudit} />
      <div
        className={styles.srOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="assets-announcer"
      >
        {announcement}
      </div>
    </div>
  );
}
