import { useMemo, useRef, useCallback } from 'react';
import {
  format, isToday, isSameDay, getHours, getMinutes,
  startOfDay, addDays,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext.js';
import { layoutOverlaps } from '../core/layout.js';
import { useDrag } from '../hooks/useDrag.js';
import styles from './DayView.module.css';

const GUTTER_W = 56;

export default function DayView({
  currentDate, events, onEventClick, onEventMove, onEventResize, onDateSelect, config,
}) {
  const ctx = useCalendarContext();
  const dayStart  = config?.display?.dayStart ?? 6;
  const dayEnd    = config?.display?.dayEnd   ?? 22;
  const pxPerHour = 64;
  const bizHours  = ctx?.businessHours ?? null;

  const gridRef = useRef(null);
  const days    = useMemo(() => [currentDate], [currentDate]);

  const hours = [];
  for (let h = dayStart; h <= dayEnd; h++) hours.push(h);

  // All-day row: multi-day events overlapping currentDate
  const dayFloor  = startOfDay(currentDate);
  const dayCeil   = addDays(dayFloor, 1);
  const allDayEvs = events.filter(e => {
    if (!(e.allDay || !isSameDay(e.start, e.end))) return false;
    return e.start < dayCeil && e.end > dayFloor;
  });
  const rawTimed  = events.filter(e =>
    isSameDay(e.start, currentDate) && !e.allDay && isSameDay(e.start, e.end),
  );
  const dayEvents = useMemo(() => layoutOverlaps(rawTimed), [rawTimed]);

  const now    = new Date();
  const nowTop = ((getHours(now) - dayStart) * 60 + getMinutes(now)) / 60 * pxPerHour;
  const showNow = isToday(currentDate) && getHours(now) >= dayStart && getHours(now) < dayEnd;

  function eventPosition(start, end) {
    const startMin = (getHours(start) - dayStart) * 60 + getMinutes(start);
    const endMin   = (getHours(end)   - dayStart) * 60 + getMinutes(end);
    return {
      top:    Math.max(0, startMin) / 60 * pxPerHour,
      height: Math.max(22, endMin - startMin) / 60 * pxPerHour,
    };
  }

  function isBizHour(h) {
    if (!bizHours) return true;
    const bizDays = bizHours.days ?? [1, 2, 3, 4, 5];
    return bizDays.includes(currentDate.getDay()) && h >= bizHours.start && h < bizHours.end;
  }

  // ── Drag ────────────────────────────────────────────────────────────────
  const drag = useDrag({ pxPerHour, dayStart, dayEnd });

  const handleGridPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    drag.startCreate(e, gridRef.current, days, GUTTER_W);
  }, [drag.startCreate, days]);

  const handleGridPointerMove = useCallback((e) => {
    drag.onPointerMove(e);
  }, [drag.onPointerMove]);

  const handleGridPointerUp = useCallback(() => {
    const result = drag.onPointerUp();
    if (!result) return;
    if (result.type === 'create') {
      onDateSelect?.(result.newStart, result.newEnd);
    } else if (result.type === 'resize' || result.type === 'resize-top') {
      onEventResize?.(result.ev, result.newStart, result.newEnd);
    } else if (result.type === 'move') {
      onEventMove?.(result.ev, result.newStart, result.newEnd);
    }
  }, [drag.onPointerUp, onEventMove, onEventResize, onDateSelect]);

  // ── Renderers ─────────────────────────────────────────────────────────
  function renderEvent(ev) {
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

    if (ctx?.renderEvent) {
      const custom = ctx.renderEvent(ev, { view: 'day', isCompact: false, onClick, color });
      if (custom != null) {
        return (
          <div key={ev.id} data-event="1"
            className={[styles.event, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
            style={{ top, height, '--ev-color': color, left: `${pctLeft}%`, width: `${pctWidth}%` }}
            onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); drag.startMove(ev, e, gridRef.current, days, GUTTER_W); }}
          >
            <div className={styles.resizeHandleTop}
              onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); drag.startResizeTop(ev, e, gridRef.current, days, GUTTER_W); }}
              aria-hidden="true" />
            {custom}
            <div className={styles.resizeHandle}
              onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); drag.startResize(ev, e, gridRef.current, days, GUTTER_W); }}
              aria-hidden="true" />
          </div>
        );
      }
    }

    return (
      <div key={ev.id} data-event="1"
        className={[styles.event, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
        style={{ top, height, '--ev-color': color, left: `${pctLeft}%`, width: `${pctWidth}%` }}
        role="button" tabIndex={0}
        onClick={onClick}
        onKeyDown={e => e.key === 'Enter' && onClick()}
        onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); drag.startMove(ev, e, gridRef.current, days, GUTTER_W); }}
      >
        <div className={styles.resizeHandleTop}
          onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); drag.startResizeTop(ev, e, gridRef.current, days, GUTTER_W); }}
          aria-hidden="true" />
        <span className={styles.evTitle}>{ev.title}</span>
        <span className={styles.evTime}>{format(ev.start, 'h:mm a')} – {format(ev.end, 'h:mm a')}</span>
        {ev.resource && numCols === 1 && <span className={styles.evMeta}>{ev.resource}</span>}
        <div className={styles.resizeHandle}
          onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); drag.startResize(ev, e, gridRef.current, days, GUTTER_W); }}
          aria-hidden="true" />
      </div>
    );
  }

  function renderGhost() {
    const g = drag.ghost;
    if (!g || !isSameDay(g.start, currentDate)) return null;
    const { top, height } = eventPosition(g.start, g.end);
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
      <div className={[styles.ghost, !g.ev && styles.ghostCreate].filter(Boolean).join(' ')}
        aria-hidden="true"
        style={{ top, height, '--ev-color': color, left, width }}
      />
    );
  }

  return (
    <div className={styles.day}>
      <div className={styles.dayHeader}>
        <span className={[styles.dayNum, isToday(currentDate) && styles.today].filter(Boolean).join(' ')}>
          {format(currentDate, 'EEEE, MMMM d')}
        </span>
      </div>

      {allDayEvs.length > 0 && (
        <div className={styles.allDayRow}>
          <div className={styles.timeLabel}>all&#8209;day</div>
          <div className={styles.allDayEvents}>
            {allDayEvs.map(ev => {
              const color = resolveColor(ev, ctx?.colorRules);
              return (
                <button key={ev.id} className={styles.allDayPill} style={{ '--ev-color': color }}
                  onClick={() => onEventClick?.(ev)}>{ev.title}</button>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.timeCol}>
          {hours.map(h => (
            <div key={h} className={styles.hourLabel} style={{ height: pxPerHour }}>
              {h === dayStart ? '' : format(new Date().setHours(h, 0, 0, 0), 'h a')}
            </div>
          ))}
        </div>
        <div
          className={styles.eventCol}
          style={{ height: (dayEnd - dayStart) * pxPerHour }}
          ref={gridRef}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={drag.cancel}
        >
          {hours.map(h => (
            <div key={h}
              className={[styles.hourLine, bizHours && !isBizHour(h) && styles.offHour].filter(Boolean).join(' ')}
              style={{ top: (h - dayStart) * pxPerHour, height: pxPerHour }}
            />
          ))}
          {showNow && (
            <div className={styles.nowLine} style={{ top: nowTop }}>
              <div className={styles.nowDot} />
            </div>
          )}
          {dayEvents.map(ev => renderEvent(ev))}
          {renderGhost()}
        </div>
      </div>
    </div>
  );
}
