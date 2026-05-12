import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, format,
} from 'date-fns';
import type { Day } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import cls from './MiniCalendar.module.css';

export interface MiniCalendarProps {
  /** The currently selected/focused date (controls the highlighted cell). */
  currentDate?: Date;
  /** Fired when the user clicks a day cell. */
  onDateSelect?: (date: Date) => void;
  /** First day of week (IANA Day index, 0 = Sunday … 6 = Saturday). */
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Dates with events — cells with a dot indicator. */
  eventDates?: Date[];
}

export default function MiniCalendar({
  currentDate = new Date(),
  onDateSelect,
  weekStartDay = 0,
  eventDates = [],
}: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

  // Keep the visible month in sync when the host navigates the main calendar
  // to a different month (e.g. "Today" button, keyboard shortcuts). Only
  // snaps when currentDate leaves the currently shown month so the user can
  // still browse ahead in the mini calendar without being interrupted.
  useEffect(() => {
    setViewMonth(prev =>
      isSameMonth(prev, currentDate)
        ? prev
        : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
    );
  }, [currentDate]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: weekStartDay as Day });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: weekStartDay as Day });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth, weekStartDay]);

  const eventDateSet = useMemo(() => {
    const set = new Set<string>();
    eventDates.forEach(d => set.add(format(d, 'yyyy-MM-dd')));
    return set;
  }, [eventDates]);

  const weekDayLabels = useMemo(() => {
    const base = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    return [...base.slice(weekStartDay), ...base.slice(0, weekStartDay)];
  }, [weekStartDay]);

  const prevMonth = useCallback(() => setViewMonth(m => subMonths(m, 1)), []);
  const nextMonth = useCallback(() => setViewMonth(m => addMonths(m, 1)), []);

  const handleDayClick = useCallback((day: Date) => {
    onDateSelect?.(day);
    if (!isSameMonth(day, viewMonth)) {
      setViewMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }, [onDateSelect, viewMonth]);

  return (
    <div className={cls['root']} role="group" aria-label="Mini calendar">
      {/* Header */}
      <div className={cls['header']}>
        <button
          type="button"
          className={cls['navBtn']}
          onClick={prevMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className={cls['monthLabel']} aria-live="polite" aria-atomic="true">
          {format(viewMonth, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          className={cls['navBtn']}
          onClick={nextMonth}
          aria-label="Next month"
          title="Next month"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className={cls['weekRow']} aria-hidden="true">
        {weekDayLabels.map(label => (
          <span key={label} className={cls['weekLabel']}>{label}</span>
        ))}
      </div>

      {/* Day grid */}
      <div className={cls['grid']} role="grid">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const outside = !isSameMonth(day, viewMonth);
          const selected = isSameDay(day, currentDate);
          const todayFlag = isToday(day);
          const hasEvents = eventDateSet.has(key);

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={[
                cls['day'],
                outside && cls['outside'],
                selected && cls['selected'],
                todayFlag && !selected && cls['today'],
              ].filter(Boolean).join(' ')}
              onClick={() => handleDayClick(day)}
              aria-label={format(day, 'MMMM d, yyyy')}
              aria-current={todayFlag ? 'date' : undefined}
              aria-selected={selected}
            >
              {format(day, 'd')}
              {hasEvents && <span className={cls['dot']} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
