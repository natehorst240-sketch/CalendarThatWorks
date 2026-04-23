/**
 * ScheduleView — 6-week rolling grid (great for maintenance planning).
 * Columns = resources, Rows = days, Cells = events for that resource/day.
 */
import { useMemo } from 'react';
import {
  startOfWeek, addDays, eachDayOfInterval, format,
  isSameDay, isToday,
} from 'date-fns';
import type { Day } from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import styles from './ScheduleView.module.css';

const WEEKS = 6;

type ScheduleEvent = {
  id: string;
  title: string;
  start: Date;
  resource?: string;
  status?: string;
  [key: string]: unknown;
};

export default function ScheduleView({ currentDate, events, onEventClick, weekStartDay = 0 }: { currentDate: Date; events: ScheduleEvent[]; onEventClick?: (event: ScheduleEvent) => void; weekStartDay?: Day } & Record<string, any>) {
  const ctx = useCalendarContext();

  const resources = useMemo<string[]>(() => {
    const set = new Set<string>();
    events.forEach((e: ScheduleEvent) => { if (e.resource) set.add(e.resource); });
    return [...set].sort();
  }, [events]);

  const days = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const end   = addDays(start, WEEKS * 7 - 1);
    return eachDayOfInterval({ start, end });
  }, [currentDate, weekStartDay]);

  if (resources.length === 0) {
    return (
      <div className={styles.fallback}>
        <p className={styles.hint}>Schedule view groups events by resource. Add a <code>resource</code> field to your events.</p>
        <div className={styles.simpleList}>
          {events.slice(0, 40).map((ev: ScheduleEvent) => {
            const color = resolveColor(ev as any, ctx?.colorRules);
            return (
              <button key={ev.id} className={styles.simpleEvent} onClick={() => onEventClick?.(ev)}
                style={{ '--ev-color': color }}>
                <span>{format(ev.start, 'MMM d')}</span>
                <span>{ev.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.schedule}>
      {/* Header */}
      <div className={styles.header} style={{ gridTemplateColumns: `120px repeat(${resources.length}, minmax(100px, 1fr))` }}>
        <div className={styles.cornerCell} />
        {resources.map(r => (
          <div key={r} className={styles.resourceHead}>{r}</div>
        ))}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const isWeekStart = day.getDay() === weekStartDay;

          return (
            <div key={key}
              className={[styles.row, isWeekStart && styles.weekStart, isToday(day) && styles.todayRow].filter(Boolean).join(' ')}
              style={{ gridTemplateColumns: `120px repeat(${resources.length}, minmax(100px, 1fr))` }}
            >
              <div className={[styles.dateCell, isToday(day) && styles.todayDate].filter(Boolean).join(' ')}>
                <span className={styles.weekDay}>{format(day, 'EEE')}</span>
                <span className={styles.dayNum}>{format(day, 'MMM d')}</span>
              </div>
              {resources.map(res => {
                const cellEvents = events.filter((e: ScheduleEvent) => e.resource === res && isSameDay(e.start, day));
                return (
                  <div key={res} className={styles.cell}>
                    {cellEvents.map(ev => {
                      const color = resolveColor(ev as any, ctx?.colorRules);
                      const statusClass = ev.status === 'cancelled' ? styles.cancelled
                        : ev.status === 'tentative' ? styles.tentative : '';

                      if (ctx?.renderEvent) {
                        const custom = ctx.renderEvent(ev, {
                          view: 'schedule', isCompact: true,
                          onClick: () => onEventClick?.(ev), color,
                        });
                        if (custom != null) {
                          return (
                            <div key={ev.id} className={[styles.eventPill, statusClass].filter(Boolean).join(' ')}
                              style={{ '--ev-color': color }}
                              data-wc-priority={(ev.visualPriority as string | undefined) ?? undefined}
                              onClick={() => onEventClick?.(ev)}>
                              {custom}
                            </div>
                          );
                        }
                      }

                      return (
                        <button key={ev.id}
                          className={[styles.eventPill, statusClass].filter(Boolean).join(' ')}
                          style={{ '--ev-color': color }}
                          data-wc-priority={(ev.visualPriority as string | undefined) ?? undefined}
                          onClick={() => onEventClick?.(ev)}
                          title={ev.title}
                        >
                          {ev.title}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
