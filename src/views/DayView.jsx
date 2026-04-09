import { useMemo } from 'react';
import {
  format, isToday, isSameDay, getHours, getMinutes, startOfDay, addDays,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext.js';
import { layoutOverlaps } from '../core/layout.js';
import styles from './DayView.module.css';

export default function DayView({ currentDate, events, onEventClick, config }) {
  const ctx = useCalendarContext();
  const dayStart  = config?.display?.dayStart ?? 6;
  const dayEnd    = config?.display?.dayEnd   ?? 22;
  const pxPerHour = 64;
  const bizHours  = ctx?.businessHours ?? null;

  const hours = [];
  for (let h = dayStart; h <= dayEnd; h++) hours.push(h);

  // All-day row: any event that spans through currentDate (not just starts today)
  const dayFloor  = startOfDay(currentDate);
  const dayCeil   = addDays(dayFloor, 1); // exclusive upper bound
  const allDayEvs = events.filter(e => {
    if (!(e.allDay || !isSameDay(e.start, e.end))) return false;
    return e.start < dayCeil && e.end > dayFloor;
  });
  // Timed events: only single-day events that start today
  const rawTimed  = events.filter(e => isSameDay(e.start, currentDate) &&
    !e.allDay && isSameDay(e.start, e.end));
  const dayEvents = useMemo(() => layoutOverlaps(rawTimed), [rawTimed]);

  const now = new Date();
  const nowTop = ((getHours(now) - dayStart) * 60 + getMinutes(now)) / 60 * pxPerHour;
  const showNow = isToday(currentDate) && getHours(now) >= dayStart && getHours(now) < dayEnd;

  function eventPosition(ev) {
    const startMin = (getHours(ev.start) - dayStart) * 60 + getMinutes(ev.start);
    const endMin   = (getHours(ev.end)   - dayStart) * 60 + getMinutes(ev.end);
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

  function renderEvent(ev) {
    const color   = resolveColor(ev, ctx?.colorRules);
    const onClick = () => onEventClick?.(ev);
    const { top, height } = eventPosition(ev);
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
          <div key={ev.id} className={[styles.event, statusClass].filter(Boolean).join(' ')}
            style={{ top, height, '--ev-color': color, left: `${pctLeft}%`, width: `${pctWidth}%` }}>
            {custom}
          </div>
        );
      }
    }

    return (
      <button key={ev.id} className={[styles.event, statusClass].filter(Boolean).join(' ')}
        style={{ top, height, '--ev-color': color, left: `${pctLeft}%`, width: `${pctWidth}%` }}
        onClick={onClick}>
        <span className={styles.evTitle}>{ev.title}</span>
        <span className={styles.evTime}>{format(ev.start, 'h:mm a')} – {format(ev.end, 'h:mm a')}</span>
        {ev.resource && numCols === 1 && <span className={styles.evMeta}>{ev.resource}</span>}
      </button>
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
          <div className={styles.timeLabel}>all‑day</div>
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
        <div className={styles.eventCol} style={{ height: (dayEnd - dayStart) * pxPerHour }}>
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
        </div>
      </div>
    </div>
  );
}
