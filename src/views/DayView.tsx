import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  format, isToday, isSameDay, getHours, getMinutes,
  startOfDay, addDays,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import { hoursInTimezone } from '../core/engine/time/timezone';
import { layoutOverlaps } from '../core/layout';
import { useDrag } from '../hooks/useDrag';
import type { NormalizedEvent } from '../types/events';
import type { CalendarViewEvent } from '../types/ui';
import styles from './DayView.module.css';

const GUTTER_W = 56;

type DayViewProps = {
  currentDate: Date;
  events: CalendarViewEvent[];
  onEventClick?: (event: CalendarViewEvent) => void;
  onEventMove?: (event: CalendarViewEvent, newStart: Date, newEnd: Date) => void;
  onEventResize?: (event: CalendarViewEvent, newStart: Date, newEnd: Date) => void;
  onDateSelect?: (start: Date, end: Date) => void;
  config?: { display?: { dayStart?: number; dayEnd?: number } };
};

export default function DayView({
  currentDate, events, onEventClick, onEventMove, onEventResize, onDateSelect, config,
}: DayViewProps) {
  const ctx = useCalendarContext();
  const dayStart  = config?.display?.dayStart ?? 6;
  const dayEnd    = config?.display?.dayEnd   ?? 22;
  const pxPerHour = 64;
  const bizHours  = ctx?.businessHours ?? null;

  const gridRef = useRef<HTMLDivElement | null>(null);
  const days    = useMemo(() => [currentDate], [currentDate]);

  const hours = [];
  for (let h = dayStart; h <= dayEnd; h++) hours.push(h);

  // Slot hours: exclude last boundary label (each slot spans h to h+1)
  const slotHours = useMemo(() => {
    const arr = [];
    for (let h = dayStart; h < dayEnd; h++) arr.push(h);
    return arr;
  }, [dayStart, dayEnd]);

  // ── Roving tabIndex for time-slot keyboard navigation ─────────────────────
  const [focusedHour, setFocusedHour] = useState(0);
  const lastKeyNavSlot = useRef(false);

  useEffect(() => {
    if (!lastKeyNavSlot.current || !gridRef.current) return;
    lastKeyNavSlot.current = false;
    const el = gridRef.current.querySelector<HTMLElement>(`[data-slot="${focusedHour}"]`);
    el?.focus({ preventScroll: false });
  }, [focusedHour]);

  const handleSlotKeyDown = useCallback((
    e: ReactKeyboardEvent<HTMLDivElement>,
    hi: number,
    slotStart: Date,
    slotEnd: Date,
  ) => {
    const maxHi = slotHours.length - 1;
    let next = null;
    switch (e.key) {
      case 'ArrowUp':  next = Math.max(0, hi - 1);    break;
      case 'ArrowDown': next = Math.min(maxHi, hi + 1); break;
      case 'Home':     next = 0;                       break;
      case 'End':      next = maxHi;                   break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onDateSelect?.(slotStart, slotEnd);
        return;
      default: return;
    }
    e.preventDefault();
    lastKeyNavSlot.current = true;
    setFocusedHour(next);
  }, [slotHours.length, onDateSelect]);

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

  const displayTz = ctx?.displayTimezone ?? null;

  const now     = new Date();
  const nowHour = displayTz ? hoursInTimezone(now, displayTz) : getHours(now) + getMinutes(now) / 60;
  const nowTop  = (nowHour - dayStart) * pxPerHour;
  const showNow = isToday(currentDate) && nowHour >= dayStart && nowHour < dayEnd;

  function eventPosition(start: Date, end: Date) {
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

  function isBizHour(h: number) {
    if (!bizHours) return true;
    const bizDays = bizHours.days ?? [1, 2, 3, 4, 5];
    return bizDays.includes(currentDate.getDay()) && h >= bizHours.start && h < bizHours.end;
  }

  // ── Drag ────────────────────────────────────────────────────────────────
  const drag = useDrag({ pxPerHour, dayStart, dayEnd });

  const handleGridPointerDown = useCallback((e) => {
    if (e.button !== 0 || !ctx?.permissions?.canAddEvent) return;
    drag.startCreate(e, gridRef.current, days, GUTTER_W);
  }, [drag.startCreate, days, ctx?.permissions?.canAddEvent]);

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
  function renderEvent(ev: CalendarViewEvent) {
    const isDimmed = drag.draggedId === ev.id;
    const color    = resolveColor(ev as NormalizedEvent, ctx?.colorRules);
    const onClick  = () => !isDimmed && onEventClick?.(ev);
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

    if (ctx?.renderEvent) {
      const custom = ctx.renderEvent(ev as NormalizedEvent, { view: 'day', isCompact: false, onClick, color });
      if (custom != null) {
        return (
          <div key={ev.id} data-event="1"
            className={[styles.event, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
            style={{ top, height, '--ev-color': color, left: `${pctLeft}%`, width: `${pctWidth}%` }}
            role="button" tabIndex={0}
            aria-label={ariaLabel}
            onClick={onClick}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
            onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startMove(ev as NormalizedEvent, e, gridRef.current, days, GUTTER_W); }}
          >
            <div className={styles.resizeHandleTop}
              onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startResizeTop(ev as NormalizedEvent, e, gridRef.current, days, GUTTER_W); }}
              aria-hidden="true" />
            {custom}
            <div className={styles.resizeHandle}
              onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startResize(ev as NormalizedEvent, e, gridRef.current, days, GUTTER_W); }}
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
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startMove(ev as NormalizedEvent, e, gridRef.current, days, GUTTER_W); }}
      >
        <div className={styles.resizeHandleTop}
          onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startResizeTop(ev as NormalizedEvent, e, gridRef.current, days, GUTTER_W); }}
          aria-hidden="true" />
        <span className={styles.evTitle}>{ev.title}</span>
        <span className={styles.evTime}>{format(ev.start, 'h:mm a')} – {format(ev.end, 'h:mm a')}</span>
        {ev.resource && numCols === 1 && <span className={styles.evMeta}>{ev.resource}</span>}
        <div className={styles.resizeHandle}
          onPointerDown={e => { if (e.button !== 0 || !ctx?.permissions?.canDrag) return; e.stopPropagation(); drag.startResize(ev as NormalizedEvent, e, gridRef.current, days, GUTTER_W); }}
          aria-hidden="true" />
      </div>
    );
  }

  function renderGhost() {
    const g = drag.ghost;
    if (!g || !isSameDay(g.start, currentDate)) return null;
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
      <div className={[styles.ghost, !g.ev && styles.ghostCreate].filter(Boolean).join(' ')}
        aria-hidden="true"
        style={{ top, height, '--ev-color': color, left, width }}
      />
    );
  }

  const dayLabel = `${format(currentDate, 'EEEE, MMMM d')}${isToday(currentDate) ? ', today' : ''}`;

  return (
    <div className={styles.day} role="grid" aria-label={dayLabel}>
      <div className={styles.dayHeader} role="row" aria-rowindex={1}>
        <span
          role="columnheader"
          aria-label={dayLabel}
          className={[styles.dayNum, isToday(currentDate) && styles.today].filter(Boolean).join(' ')}
        >
          {format(currentDate, 'EEEE, MMMM d')}
        </span>
      </div>

      {allDayEvs.length > 0 && (
        <div className={styles.allDayRow} role="row" aria-rowindex={2}>
          <div className={styles.timeLabel} role="rowheader" aria-label="All-day events">
            <span aria-hidden="true">all&#8209;day</span>
          </div>
          <div className={styles.allDayEvents} role="gridcell" aria-label="All-day events">
            {allDayEvs.map(ev => {
              const color = resolveColor(ev as NormalizedEvent, ctx?.colorRules);
              const ariaLabel = `${ev.title}${ev.category ? `, ${ev.category}` : ''}${ev.status && ev.status !== 'confirmed' ? `, ${ev.status}` : ''}`;
              return (
                <button key={ev.id} className={styles.allDayPill} style={{ '--ev-color': color }}
                  aria-label={ariaLabel}
                  onClick={() => onEventClick?.(ev)}>{ev.title}</button>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.grid} role="presentation">
        <div className={styles.timeCol} aria-hidden="true">
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
          {/* Background hour lines */}
          {hours.map(h => (
            <div key={h}
              className={[styles.hourLine, bizHours && !isBizHour(h) && styles.offHour].filter(Boolean).join(' ')}
              style={{ top: (h - dayStart) * pxPerHour, height: pxPerHour }}
            />
          ))}

          {/* Keyboard-interactive slot cells */}
          {slotHours.map((h, hi) => {
            const isFocused = focusedHour === hi;
            const slotStart = new Date(currentDate); slotStart.setHours(h, 0, 0, 0);
            const slotEnd   = new Date(currentDate); slotEnd.setHours(h + 1, 0, 0, 0);
            return (
              <div
                key={`slot-${h}`}
                role="gridcell"
                tabIndex={isFocused ? 0 : -1}
                data-slot={`${hi}`}
                aria-label={`${format(currentDate, 'EEEE, MMMM d')}, ${format(slotStart, 'h:mm a')}${isToday(currentDate) ? ', today' : ''}`}
                aria-rowindex={hi + 3}
                aria-colindex={1}
                className={styles.slotCell}
                style={{ top: (h - dayStart) * pxPerHour, height: pxPerHour }}
                onKeyDown={e => handleSlotKeyDown(e, hi, slotStart, slotEnd)}
              />
            );
          })}

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
