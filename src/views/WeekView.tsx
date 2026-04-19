import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isToday,
  getHours, getMinutes,
  startOfDay, addDays, addMinutes,
} from 'date-fns';
import type { Day } from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import { hoursInTimezone } from '../core/engine/time/timezone';
import { layoutOverlaps, layoutSpans } from '../core/layout';
import { useDrag } from '../hooks/useDrag';
import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './WeekView.module.css';

const SPAN_H    = 34;
const SPAN_GAP  = 3;
const MAX_SPANS = 4;
const GUTTER_W  = 56;

function isMultiDay(ev) {
  return ev.allDay || !isSameDay(ev.start, ev.end);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export default function WeekView({
  currentDate, events, onEventClick, onEventMove, onEventResize, onDateSelect,
  config, weekStartDay = 0,
}: { currentDate: Date; events: any; onEventClick?: any; onEventMove?: any; onEventResize?: any; onDateSelect?: any; config?: any; weekStartDay?: Day } & Record<string, any>) {
  const ctx = useCalendarContext();
  const dayStart   = config?.display?.dayStart ?? 6;
  const dayEnd     = config?.display?.dayEnd   ?? 22;
  const totalHours = dayEnd - dayStart;
  const pxPerHour  = 64;
  const bizHours   = ctx?.businessHours ?? null;

  const gridRef    = useRef(null);
  const allDayRef  = useRef(null);
  // Tracks whether the most recent pointer-up was a real drag (not a click).
  // Used to guard onClick handlers so a just-finished drag doesn't fire onEventClick.
  const wasDragRef = useRef(false);

  // ── Roving tabIndex for time-slot keyboard navigation ─────────────────────
  const [focusedSlot, setFocusedSlot] = useState({ dayIdx: 0, hourIdx: 0 });
  const lastKeyNavSlot = useRef(false);

  useEffect(() => {
    if (!lastKeyNavSlot.current || !gridRef.current) return;
    lastKeyNavSlot.current = false;
    const { dayIdx, hourIdx } = focusedSlot;
    const el = gridRef.current.querySelector(`[data-slot="${dayIdx}-${hourIdx}"]`);
    el?.focus({ preventScroll: false });
  }, [focusedSlot]);

  const days = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const end   = endOfWeek(currentDate,   { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start, end });
  }, [currentDate, weekStartDay]);

  const weekStart = days[0];
  const weekEnd   = days[6];

  // Slot hours = hours that have a full 1-hour slot below them
  const slotHours = useMemo(() => {
    const arr = [];
    for (let h = dayStart; h < dayEnd; h++) arr.push(h);
    return arr;
  }, [dayStart, dayEnd]);

  // ── Slot keyboard navigation ───────────────────────────────────────────────
  const handleSlotKeyDown = useCallback((e, di, hi, slotStart, slotEnd) => {
    const maxDi = days.length - 1;
    const maxHi = slotHours.length - 1;
    let nextDi = di, nextHi = hi;
    let move = false;
    switch (e.key) {
      case 'ArrowLeft':  nextDi = Math.max(0, di - 1);     move = true; break;
      case 'ArrowRight': nextDi = Math.min(maxDi, di + 1); move = true; break;
      case 'ArrowUp':    nextHi = Math.max(0, hi - 1);     move = true; break;
      case 'ArrowDown':  nextHi = Math.min(maxHi, hi + 1); move = true; break;
      case 'Home':       nextDi = 0;                        move = true; break;
      case 'End':        nextDi = maxDi;                    move = true; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onDateSelect?.(slotStart, slotEnd);
        return;
      default: return;
    }
    if (move) {
      e.preventDefault();
      lastKeyNavSlot.current = true;
      setFocusedSlot({ dayIdx: nextDi, hourIdx: nextHi });
    }
  }, [days.length, slotHours.length, onDateSelect]);

  // ── All-day overflow popover ───────────────────────────────────────────────
  const [allDayOverflowOpen, setAllDayOverflowOpen] = useState(false);
  const overflowTrapRef = useFocusTrap(() => setAllDayOverflowOpen(false), allDayOverflowOpen);

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay = [];
    const timed  = [];
    events.forEach(ev => (isMultiDay(ev) ? allDay : timed).push(ev));
    return { allDayEvents: allDay, timedEvents: timed };
  }, [events]);

  const allDaySpans = useMemo(
    () => layoutSpans(allDayEvents, weekStart, weekEnd),
    [allDayEvents, weekStart, weekEnd],
  );
  const allDayLanes   = allDaySpans.length ? Math.max(...allDaySpans.map(s => s.lane)) + 1 : 0;
  const allDayVisible = Math.min(allDayLanes, MAX_SPANS);
  const allDayHeight  = allDayVisible * (SPAN_H + SPAN_GAP);
  const overflowCount = allDayLanes > MAX_SPANS ? allDayLanes - MAX_SPANS : 0;

  const timedByDay = useMemo(() => {
    const map = new Map();
    days.forEach(day => {
      const key    = format(day, 'yyyy-MM-dd');
      const dayEvs = timedEvents.filter(e => isSameDay(e.start, day));
      map.set(key, layoutOverlaps(dayEvs));
    });
    return map;
  }, [days, timedEvents]);

  const hours = [];
  for (let h = dayStart; h <= dayEnd; h++) hours.push(h);

  function isBizHour(h, day) {
    if (!bizHours) return true;
    const bizDays = bizHours.days ?? [1, 2, 3, 4, 5];
    return bizDays.includes(day.getDay()) && h >= bizHours.start && h < bizHours.end;
  }

  const displayTz = ctx?.displayTimezone ?? null;

  function eventPosition(start, end) {
    const startH = displayTz ? hoursInTimezone(start, displayTz) : getHours(start) + getMinutes(start) / 60;
    const endH   = displayTz ? hoursInTimezone(end,   displayTz) : getHours(end)   + getMinutes(end)   / 60;
    const startMin = (startH - dayStart) * 60;
    const endMin   = (endH   - dayStart) * 60;
    const totalMin = (dayEnd - dayStart) * 60;
    const visStart = Math.max(0, startMin);
    const visEnd   = Math.min(totalMin, endMin);
    if (visEnd <= visStart) return null;
    return {
      top:    visStart / 60 * pxPerHour,
      height: Math.max(22, visEnd - visStart) / 60 * pxPerHour,
    };
  }

  const now = new Date();
  const nowHour     = displayTz ? hoursInTimezone(now, displayTz) : getHours(now) + getMinutes(now) / 60;
  const nowTop      = (nowHour - dayStart) * pxPerHour;
  const showNowLine = nowHour >= dayStart && nowHour < dayEnd;

  // ── Timed-grid drag ───────────────────────────────────────────────────────
  const drag = useDrag({ pxPerHour, dayStart, dayEnd });

  const handleGridPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (!ctx?.permissions?.canAddEvent) return;
    drag.startCreate(e, gridRef.current, days, GUTTER_W);
  }, [drag.startCreate, days, ctx?.permissions?.canAddEvent]);

  const handleGridPointerMove = useCallback((e) => {
    drag.onPointerMove(e);
  }, [drag.onPointerMove]);

  const handleGridPointerUp = useCallback(() => {
    const result = drag.onPointerUp();
    if (!result) return;
    // Mark that a real drag just ended so the subsequent click event is ignored.
    wasDragRef.current = true;
    requestAnimationFrame(() => { wasDragRef.current = false; });
    if (result.type === 'create') {
      onDateSelect?.(result.newStart, result.newEnd);
    } else if (result.type === 'resize' || result.type === 'resize-top') {
      onEventResize?.(result.ev, result.newStart, result.newEnd);
    } else if (result.type === 'move') {
      onEventMove?.(result.ev, result.newStart, result.newEnd);
    }
  }, [drag.onPointerUp, onEventMove, onEventResize, onDateSelect]);

  // Single click on an empty time slot → create a 1-hour event at that time.
  // Drags are excluded via wasDragRef (set true in handleGridPointerUp for real drags).
  const handleGridClick = useCallback((e) => {
    if (wasDragRef.current) return;
    if (!ctx?.permissions?.canAddEvent) return;
    if (e.target.closest('[data-event]')) return; // click was on an event, not empty space
    const rect = gridRef.current.getBoundingClientRect();
    const colWidth = (rect.width - GUTTER_W) / days.length;
    const relX = e.clientX - rect.left - GUTTER_W;
    const relY = e.clientY - rect.top;
    const dayIdx = clamp(Math.floor(relX / colWidth), 0, days.length - 1);
    const clickedHour = Math.floor(relY / pxPerHour) + dayStart;
    const h = clamp(clickedHour, dayStart, dayEnd - 1);
    const start = new Date(days[dayIdx]); start.setHours(h, 0, 0, 0);
    const end   = new Date(days[dayIdx]); end.setHours(h + 1, 0, 0, 0);
    onDateSelect?.(start, end);
  }, [ctx?.permissions?.canAddEvent, days, dayStart, dayEnd, pxPerHour, onDateSelect]);

  // ── All-day bar drag ──────────────────────────────────────────────────────
  const allDayDragRef  = useRef(null);
  const allDayGhostRef = useRef(null);
  const [allDayGhost, setAllDayGhost] = useState(null);

  function updateAllDayGhost(next) {
    allDayGhostRef.current = next;
    setAllDayGhost(prev => {
      if (!next && !prev) return prev;
      if (!next) return null;
      if (!prev) return next;
      if (prev.startCol === next.startCol && prev.endCol === next.endCol) return prev;
      return next;
    });
  }

  function startAllDayBarDrag(ev, e, spanStartCol, spanEndCol) {
    e.preventDefault();
    e.stopPropagation();
    const grid     = allDayRef.current;
    const rect     = grid.getBoundingClientRect();
    const colWidth = rect.width / 7;
    const relX     = e.clientX - rect.left;
    const clickCol = clamp(Math.floor(relX / colWidth), 0, 6);
    allDayDragRef.current = {
      ev, spanStartCol, spanEndCol,
      spanWidth:    spanEndCol - spanStartCol,
      clickOffset:  clickCol - spanStartCol,
      colWidth,
    };
    grid.setPointerCapture(e.pointerId);
    updateAllDayGhost({ ev, startCol: spanStartCol, endCol: spanEndCol });
  }

  function handleAllDayPointerMove(e) {
    const d = allDayDragRef.current;
    if (!d) return;
    const rect       = allDayRef.current.getBoundingClientRect();
    const relX       = e.clientX - rect.left;
    const currentCol = clamp(Math.floor(relX / d.colWidth), 0, 6);
    const newStart   = clamp(currentCol - d.clickOffset, 0, 7 - d.spanWidth - 1);
    const newEnd     = newStart + d.spanWidth;
    updateAllDayGhost({ ev: d.ev, startCol: newStart, endCol: newEnd });
  }

  function handleAllDayPointerUp() {
    const d     = allDayDragRef.current;
    const ghost = allDayGhostRef.current;
    allDayDragRef.current  = null;
    allDayGhostRef.current = null;
    setAllDayGhost(null);
    if (!d || !ghost) return;
    const colDiff = ghost.startCol - d.spanStartCol;
    if (colDiff === 0) return;
    const newStart = addDays(d.ev.start, colDiff);
    const newEnd   = addDays(d.ev.end,   colDiff);
    onEventMove?.(d.ev, newStart, newEnd);
  }

  // ── Renderers ─────────────────────────────────────────────────────────────


  function formatPillDate(date) {
    return format(date, 'M/d h:mma');
  }

  function pillResource(ev) {
    return ev.resource || 'Unassigned';
  }

  function renderTimedEvent(ev) {
    const isDimmed = drag.draggedId === ev.id;
    const color    = resolveColor(ev, ctx?.colorRules);
    const onClick  = () => !wasDragRef.current && onEventClick?.(ev);
    const pos = eventPosition(ev.start, ev.end);
    if (!pos) return null;
    const { top, height } = pos;
    const numCols  = ev._numCols ?? 1;
    const col      = ev._col     ?? 0;
    const pctLeft  = (col / numCols) * 100;
    const pctWidth = (1 / numCols) * 100;
    const statusClass = ev.status === 'cancelled' ? styles.cancelled
      : ev.status === 'tentative' ? styles.tentative : '';
    const ariaLabel = `${ev.title}, ${format(ev.start, 'h:mm a')} to ${format(ev.end, 'h:mm a')}${ev.category ? `, ${ev.category}` : ''}${ev.status && ev.status !== 'confirmed' ? `, ${ev.status}` : ''}`;
    const display   = ev.meta?._display ?? {};

    const inner = ctx?.renderEvent
      ? ctx.renderEvent(ev, { view: 'week', isCompact: false, onClick, color })
      : null;

    return (
      <div key={ev.id} data-event="1"
        className={[
          styles.event, statusClass,
          isDimmed && styles.dragging,
          ctx?.editMode && styles.editModeEvent,
        ].filter(Boolean).join(' ')}
        style={{
          top, height, '--ev-color': color,
          left: `${pctLeft}%`, width: `${pctWidth}%`,
          fontSize: display.large ? '12px' : undefined,
        }}
        role="button" tabIndex={0}
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startMove(ev, e, gridRef.current, days, GUTTER_W); }}
      >
        <div className={styles.resizeHandleTop}
          onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startResizeTop(ev, e, gridRef.current, days, GUTTER_W); }}
          aria-hidden="true" />
        {inner ?? (
          <>
            <span className={styles.evTitle} style={{ fontWeight: display.bold ? '700' : undefined }}>Title: {ev.title}</span>
            <span className={styles.evTime}>Start: {format(ev.start, 'h:mm a')}</span>
            <span className={styles.evTime}>End: {format(ev.end, 'h:mm a')}</span>
            <span className={styles.evMeta}>Resource: {pillResource(ev)}</span>
          </>
        )}
        <div className={styles.resizeHandle}
          onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startResize(ev, e, gridRef.current, days, GUTTER_W); }}
          aria-hidden="true" />
      </div>
    );
  }

  function renderGhost(day) {
    const g = drag.ghost;
    if (!g || !isSameDay(g.start, day)) return null;
    const pos = eventPosition(g.start, g.end);
    if (!pos) return null;
    const { top, height } = pos;
    let left, width;
    if (g.ev) {
      const numCols = g.ev._numCols ?? 1;
      const col     = g.ev._col     ?? 0;
      left  = `${(col / numCols) * 100}%`;
      width = `${(1 / numCols) * 100}%`;
    } else {
      left  = '2px';
      width = 'calc(100% - 4px)';
    }
    const color = g.ev ? resolveColor(g.ev, ctx?.colorRules) : undefined;
    return (
      <div key="ghost" className={[styles.ghost, !g.ev && styles.ghostCreate].filter(Boolean).join(' ')}
        aria-hidden="true"
        style={{ top, height, '--ev-color': color, left, width }}
      />
    );
  }

  return (
    <div
      className={styles.week}
      role="grid"
      aria-label={`Week of ${format(weekStart, 'MMMM d')} – ${format(weekEnd, 'MMMM d, yyyy')}`}
    >
      {/* ── Header row ── */}
      <div className={styles.headerRow} role="row" aria-rowindex={1}>
        <div className={styles.timeGutter} role="presentation" />
        {days.map(day => (
          <div key={format(day, 'yyyy-MM-dd')}
            role="columnheader"
            aria-label={`${format(day, 'EEEE, MMMM d')}${isToday(day) ? ', today' : ''}`}
            className={[styles.dayHead, isToday(day) && styles.todayHead].filter(Boolean).join(' ')}>
            <span className={styles.dayAbbr} aria-hidden="true">{format(day, 'EEE')}</span>
            <span className={[styles.dayNum, isToday(day) && styles.todayNum].filter(Boolean).join(' ')} aria-hidden="true">
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* ── All-day / multi-day row ── */}
      {allDayLanes > 0 && (
        <div className={styles.allDayRow} role="row" aria-rowindex={2}>
          <div className={styles.timeGutter} role="rowheader" aria-label="All-day events">
            <span aria-hidden="true">all&#8209;day</span>
          </div>
          <div
            className={styles.allDayGrid}
            style={{ height: allDayHeight }}
            ref={allDayRef}
            role="gridcell"
            aria-label="All-day events area"
            onPointerMove={handleAllDayPointerMove}
            onPointerUp={handleAllDayPointerUp}
            onPointerCancel={() => { allDayDragRef.current = null; setAllDayGhost(null); }}
          >
            {allDaySpans
              .filter(s => s.lane < MAX_SPANS)
              .map(({ ev, startCol, endCol, lane, continuesBefore, continuesAfter }) => {
                const color = resolveColor(ev, ctx?.colorRules);
                const pctLeft  = (startCol / 7) * 100;
                const pctWidth = ((endCol - startCol + 1) / 7) * 100;
                const statusClass = ev.status === 'cancelled' ? styles.cancelled
                  : ev.status === 'tentative' ? styles.tentative : '';
                const isDimmedBar = allDayGhost?.ev?.id === ev.id;
                const startLabel = formatPillDate(ev.start);
                const endLabel = formatPillDate(ev.end);
                const resourceLabel = pillResource(ev);
                const ariaLabel = `${ev.title}, start ${startLabel}, end ${endLabel}, resource ${resourceLabel}${ev.category ? `, ${ev.category}` : ''}${continuesBefore ? ', continues from previous week' : ''}${continuesAfter ? ', continues next week' : ''}${ev.status && ev.status !== 'confirmed' ? `, ${ev.status}` : ''}`;
                return (
                  <button key={ev.id}
                    className={[
                      styles.allDaySpan,
                      continuesBefore && styles.continuesBefore,
                      continuesAfter  && styles.continuesAfter,
                      statusClass,
                      isDimmedBar && styles.dragging,
                    ].filter(Boolean).join(' ')}
                    style={{
                      '--ev-color': color,
                      left:   `${pctLeft}%`,
                      width:  `${pctWidth}%`,
                      top:    lane * (SPAN_H + SPAN_GAP),
                      height: SPAN_H,
                      cursor: 'grab',
                    }}
                    aria-label={ariaLabel}
                    onClick={() => !isDimmedBar && onEventClick?.(ev)}
                    onPointerDown={e => startAllDayBarDrag(ev, e, startCol, endCol)}
                  >
                    <span className={styles.allDayTitleLine}>Title: {ev.title}</span>
                    <span className={styles.allDayMetaLine}>
                      <span>Start: {startLabel}</span>
                      <span>End: {endLabel}</span>
                      <span>Resource: {resourceLabel}</span>
                    </span>
                  </button>
                );
              })}

            {/* All-day drag ghost */}
            {allDayGhost && (() => {
              const g = allDayGhost;
              const color = resolveColor(g.ev, ctx?.colorRules);
              return (
                <div key="allday-ghost" className={styles.allDayGhost} aria-hidden="true"
                  style={{
                    '--ev-color': color,
                    left:   `${(g.startCol / 7) * 100}%`,
                    width:  `${((g.endCol - g.startCol + 1) / 7) * 100}%`,
                    top:    0,
                    height: SPAN_H,
                  }}
                />
              );
            })()}

            {/* Overflow button + popover */}
            {overflowCount > 0 && (
              <div className={styles.allDayMoreWrapper}>
                <button
                  className={styles.allDayMore}
                  aria-label={`${overflowCount} more all-day event${overflowCount === 1 ? '' : 's'}, ${allDayOverflowOpen ? 'expanded' : 'collapsed'}`}
                  aria-expanded={allDayOverflowOpen}
                  aria-controls="wc-allday-overflow"
                  onClick={e => { e.stopPropagation(); setAllDayOverflowOpen(v => !v); }}
                >
                  +{overflowCount} more
                </button>

                {allDayOverflowOpen && (
                  <div
                    id="wc-allday-overflow"
                    ref={overflowTrapRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Hidden all-day events"
                    className={styles.allDayOverflowPopover}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className={styles.allDayOverflowHead}>
                      <span>All-day events</span>
                      <button
                        className={styles.allDayOverflowClose}
                        onClick={() => setAllDayOverflowOpen(false)}
                        aria-label="Close"
                      >×</button>
                    </div>
                    {allDaySpans
                      .filter(s => s.lane >= MAX_SPANS)
                      .map(({ ev }) => {
                        const color = resolveColor(ev, ctx?.colorRules);
                        return (
                          <button
                            key={ev.id}
                            className={styles.allDayOverflowItem}
                            style={{ '--ev-color': color }}
                            aria-label={`${ev.title}${ev.category ? `, ${ev.category}` : ''}`}
                            onClick={() => { onEventClick?.(ev); setAllDayOverflowOpen(false); }}
                          >
                            {ev.title}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Time grid ── */}
      <div
        className={styles.grid}
        ref={gridRef}
        onPointerDown={handleGridPointerDown}
        onPointerMove={handleGridPointerMove}
        onPointerUp={handleGridPointerUp}
        onPointerCancel={drag.cancel}
        onClick={handleGridClick}
      >
        <div className={styles.timeCol} role="presentation">
          {hours.map(h => (
            <div key={h} className={styles.hourLabel} style={{ height: pxPerHour }} aria-hidden="true">
              {h === dayStart ? '' : format(new Date().setHours(h, 0, 0, 0), 'h a')}
            </div>
          ))}
        </div>

        {days.map((day, di) => {
          const key    = format(day, 'yyyy-MM-dd');
          const dayEvs = timedByDay.get(key) || [];
          return (
            <div key={key}
              className={[styles.dayCol, isToday(day) && styles.todayCol].filter(Boolean).join(' ')}
              style={{ height: totalHours * pxPerHour }}
            >
              {/* Background hour lines */}
              {hours.map(h => (
                <div key={h}
                  className={[
                    styles.hourLine,
                    bizHours && !isBizHour(h, day) && styles.offHour,
                  ].filter(Boolean).join(' ')}
                  style={{ top: (h - dayStart) * pxPerHour, height: pxPerHour }}
                />
              ))}

              {/* Keyboard-interactive slot cells (transparent to mouse, focusable by keyboard) */}
              {slotHours.map((h, hi) => {
                const isFocused = focusedSlot.dayIdx === di && focusedSlot.hourIdx === hi;
                const slotStart = new Date(day); slotStart.setHours(h, 0, 0, 0);
                const slotEnd   = new Date(day); slotEnd.setHours(h + 1, 0, 0, 0);
                return (
                  <div
                    key={`slot-${h}`}
                    role="gridcell"
                    tabIndex={isFocused ? 0 : -1}
                    data-slot={`${di}-${hi}`}
                    aria-label={`${format(day, 'EEEE, MMMM d')}, ${format(slotStart, 'h:mm a')}${isToday(day) ? ', today' : ''}`}
                    aria-rowindex={hi + 3}
                    aria-colindex={di + 1}
                    className={styles.slotCell}
                    style={{ top: (h - dayStart) * pxPerHour, height: pxPerHour }}
                    onKeyDown={e => handleSlotKeyDown(e, di, hi, slotStart, slotEnd)}
                  />
                );
              })}

              {/* Now line */}
              {isToday(day) && showNowLine && (
                <div className={styles.nowLine} style={{ top: nowTop }}>
                  <div className={styles.nowDot} />
                </div>
              )}

              {/* Timed events (above slot cells) */}
              {dayEvs.map(ev => renderTimedEvent(ev))}
              {renderGhost(day)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
