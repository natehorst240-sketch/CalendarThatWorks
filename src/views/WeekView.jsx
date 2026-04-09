import { useMemo, useRef, useCallback } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isToday,
  getHours, getMinutes,
  startOfDay, addMinutes,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext.js';
import { layoutOverlaps, layoutSpans } from '../core/layout.js';
import { useDrag } from '../hooks/useDrag.js';
import styles from './WeekView.module.css';

const SPAN_H   = 22;
const SPAN_GAP = 2;
const MAX_SPANS = 4;
const GUTTER_W  = 56; // px — width of the time gutter column

function isMultiDay(ev) {
  return ev.allDay || !isSameDay(ev.start, ev.end);
}

export default function WeekView({
  currentDate, events, onEventClick, onEventSave, onEventMove, onEventResize, onSlotClick,
  config, weekStartDay = 0,
}) {
  const ctx = useCalendarContext();
  const dayStart   = config?.display?.dayStart ?? 6;
  const dayEnd     = config?.display?.dayEnd   ?? 22;
  const totalHours = dayEnd - dayStart;
  const pxPerHour  = 64;
  const bizHours   = ctx?.businessHours ?? null;

  const gridRef = useRef(null);

  const days = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const end   = endOfWeek(currentDate,   { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start, end });
  }, [currentDate, weekStartDay]);

  const weekStart = days[0];
  const weekEnd   = days[6];

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

  function eventPosition(start, end) {
    const startMin = (getHours(start) - dayStart) * 60 + getMinutes(start);
    const endMin   = (getHours(end)   - dayStart) * 60 + getMinutes(end);
    return {
      top:    Math.max(0, startMin) / 60 * pxPerHour,
      height: Math.max(22, (endMin - startMin)) / 60 * pxPerHour,
    };
  }

  const now = new Date();
  const nowTop = ((getHours(now) - dayStart) * 60 + getMinutes(now)) / 60 * pxPerHour;
  const showNowLine = getHours(now) >= dayStart && getHours(now) < dayEnd;

  // ── Drag interaction ──────────────────────────────────────────────────────
  const drag = useDrag({ pxPerHour, dayStart, dayEnd });

  const handleGridPointerMove = useCallback((e) => {
    drag.onPointerMove(e);
  }, [drag.onPointerMove]);

  const handleGridPointerUp = useCallback(() => {
    const result = drag.onPointerUp();
    if (!result) return;
    const raw     = result.ev._raw ?? result.ev;
    const updated = { ...raw, start: result.newStart, end: result.newEnd };
    if (result.type === 'move' && onEventMove) {
      onEventMove(result.ev, result.newStart, result.newEnd);
    } else if (result.type === 'resize' && onEventResize) {
      onEventResize(result.ev, result.newStart, result.newEnd);
    } else {
      onEventSave?.(updated);
    }
  }, [drag.onPointerUp, onEventMove, onEventResize, onEventSave]);

  const handleGridClick = useCallback((e) => {
    if (!onSlotClick) return;
    if (e.target.closest('[data-event]')) return;
    const grid = gridRef.current;
    if (!grid) return;
    const rect     = grid.getBoundingClientRect();
    const relY     = e.clientY - rect.top;
    const relX     = e.clientX - rect.left;
    const colWidth = (rect.width - GUTTER_W) / days.length;
    const colIdx   = Math.max(0, Math.min(days.length - 1, Math.floor((relX - GUTTER_W) / colWidth)));
    const day      = days[colIdx];
    const rawMin   = (relY / pxPerHour) * 60 + dayStart * 60;
    const snapped  = Math.round(rawMin / 15) * 15;
    const clampMin = Math.max(dayStart * 60, Math.min((dayEnd - 1) * 60, snapped));
    const startD   = new Date(startOfDay(day));
    startD.setMinutes(clampMin);
    onSlotClick(day, startD, addMinutes(startD, 60));
  }, [onSlotClick, days, dayStart, dayEnd, pxPerHour]);

  // ── Renderers ─────────────────────────────────────────────────────────────

  function renderTimedEvent(ev) {
    const isDimmed = drag.draggedId === ev.id;
    const color    = resolveColor(ev, ctx?.colorRules);
    const onClick  = () => !isDimmed && onEventClick?.(ev);
    const { top, height } = eventPosition(ev.start, ev.end);
    const numCols  = ev._numCols ?? 1;
    const col      = ev._col     ?? 0;
    const pctLeft  = (col / numCols) * 100;
    const pctWidth = (1 / numCols) * 100;
    const statusClass = ev.status === 'cancelled' ? styles.cancelled
      : ev.status === 'tentative' ? styles.tentative : '';

    function handlePointerDown(e) {
      if (e.button !== 0) return;
      drag.startMove(ev, e, gridRef.current, days, GUTTER_W);
    }
    function handleResizeDown(e) {
      if (e.button !== 0) return;
      drag.startResize(ev, e, gridRef.current, days, GUTTER_W);
    }

    const inner = ctx?.renderEvent
      ? ctx.renderEvent(ev, { view: 'week', isCompact: false, onClick, color })
      : null;

    return (
      <div key={ev.id} data-event="1"
        className={[styles.event, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
        style={{ top, height, '--ev-color': color, left: `${pctLeft}%`, width: `${pctWidth}%` }}
        role="button" tabIndex={0}
        onClick={onClick}
        onKeyDown={e => e.key === 'Enter' && onClick()}
        onPointerDown={handlePointerDown}
      >
        {inner ?? (
          <>
            <span className={styles.evTitle}>{ev.title}</span>
            <span className={styles.evTime}>{format(ev.start, 'h:mm a')}</span>
          </>
        )}
        <div className={styles.resizeHandle} onPointerDown={handleResizeDown} aria-hidden="true" />
      </div>
    );
  }

  function renderGhost(day) {
    const g = drag.ghost;
    if (!g || !isSameDay(g.start, day)) return null;
    const { top, height } = eventPosition(g.start, g.end);
    const color = resolveColor(g.ev, ctx?.colorRules);
    return (
      <div key="ghost" className={styles.ghost} aria-hidden="true"
        style={{ top, height, '--ev-color': color, left: '1%', width: '98%' }}
      />
    );
  }

  return (
    <div className={styles.week}>
      {/* ── Header row ── */}
      <div className={styles.headerRow}>
        <div className={styles.timeGutter} />
        {days.map(day => (
          <div key={format(day, 'yyyy-MM-dd')}
            className={[styles.dayHead, isToday(day) && styles.todayHead].filter(Boolean).join(' ')}>
            <span className={styles.dayAbbr}>{format(day, 'EEE')}</span>
            <span className={[styles.dayNum, isToday(day) && styles.todayNum].filter(Boolean).join(' ')}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* ── All-day / multi-day row ── */}
      {allDayLanes > 0 && (
        <div className={styles.allDayRow}>
          <div className={styles.timeGutter}><span>all&#8209;day</span></div>
          <div className={styles.allDayGrid} style={{ height: allDayHeight }}>
            {allDaySpans
              .filter(s => s.lane < MAX_SPANS)
              .map(({ ev, startCol, endCol, lane, continuesBefore, continuesAfter }) => {
                const color = resolveColor(ev, ctx?.colorRules);
                const pctLeft  = (startCol / 7) * 100;
                const pctWidth = ((endCol - startCol + 1) / 7) * 100;
                const statusClass = ev.status === 'cancelled' ? styles.cancelled
                  : ev.status === 'tentative' ? styles.tentative : '';
                return (
                  <button key={ev.id}
                    className={[
                      styles.allDaySpan,
                      continuesBefore && styles.continuesBefore,
                      continuesAfter  && styles.continuesAfter,
                      statusClass,
                    ].filter(Boolean).join(' ')}
                    style={{
                      '--ev-color': color,
                      left:   `${pctLeft}%`,
                      width:  `${pctWidth}%`,
                      top:    lane * (SPAN_H + SPAN_GAP),
                      height: SPAN_H,
                    }}
                    onClick={() => onEventClick?.(ev)}
                    title={ev.title}
                  >
                    {!continuesBefore && ev.title}
                  </button>
                );
              })}
            {allDayLanes > MAX_SPANS && (
              <span className={styles.allDayMore}>+{allDayLanes - MAX_SPANS} more</span>
            )}
          </div>
        </div>
      )}

      {/* ── Time grid ── */}
      <div
        className={styles.grid}
        ref={gridRef}
        onPointerMove={handleGridPointerMove}
        onPointerUp={handleGridPointerUp}
        onPointerCancel={drag.cancel}
        onClick={handleGridClick}
      >
        <div className={styles.timeCol}>
          {hours.map(h => (
            <div key={h} className={styles.hourLabel} style={{ height: pxPerHour }}>
              {h === dayStart ? '' : format(new Date().setHours(h, 0, 0, 0), 'h a')}
            </div>
          ))}
        </div>

        {days.map(day => {
          const key    = format(day, 'yyyy-MM-dd');
          const dayEvs = timedByDay.get(key) || [];
          return (
            <div key={key}
              className={[styles.dayCol, isToday(day) && styles.todayCol].filter(Boolean).join(' ')}
              style={{ height: totalHours * pxPerHour }}
            >
              {hours.map(h => (
                <div key={h}
                  className={[
                    styles.hourLine,
                    bizHours && !isBizHour(h, day) && styles.offHour,
                  ].filter(Boolean).join(' ')}
                  style={{ top: (h - dayStart) * pxPerHour, height: pxPerHour }}
                />
              ))}
              {isToday(day) && showNowLine && (
                <div className={styles.nowLine} style={{ top: nowTop }}>
                  <div className={styles.nowDot} />
                </div>
              )}
              {dayEvs.map(ev => renderTimedEvent(ev))}
              {renderGhost(day)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
