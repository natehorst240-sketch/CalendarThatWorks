/**
 * TimelineView.jsx — Horizontal resource timeline (Gantt-style).
 *
 * Layout:
 *   Rows    = people / resources  (sticky left column)
 *   Columns = days of the month   (scrolls right)
 *   Events  = horizontal bars spanning their day(s)
 */
import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, isToday, isWeekend, isSameMonth,
  differenceInCalendarDays, startOfDay, min, max,
  getDaysInMonth,
} from 'date-fns';
import styles from './TimelineView.module.css';

const NAME_W  = 150; // px — left name column
const DAY_W   = 52;  // px — per day column
const LANE_H  = 26;  // px — each event lane
const LANE_GAP = 3;  // px — gap between lanes
const ROW_PAD = 6;   // px — top/bottom row padding

/**
 * Assign non-overlapping vertical lanes to events (day-granularity).
 * Mutates each event with a `_lane` and `_startDay` / `_span` field.
 */
function assignLanes(events, monthStart, monthEnd) {
  const clipped = events
    .filter(e => startOfDay(e.start) <= monthEnd && startOfDay(e.end) >= monthStart)
    .map(e => ({
      ...e,
      _dayStart: differenceInCalendarDays(
        max([startOfDay(e.start), monthStart]),
        monthStart
      ),
      _dayEnd: differenceInCalendarDays(
        min([startOfDay(e.end), monthEnd]),
        monthStart
      ),
    }))
    .sort((a, b) => a._dayStart - b._dayStart || a._dayEnd - b._dayEnd);

  const laneEnd = []; // laneEnd[i] = last _dayEnd in lane i

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

export default function TimelineView({ currentDate, events, onEventClick }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart]);
  const totalDays = days.length;

  // Collect all resources; events without a resource go to "(Unassigned)"
  const resources = useMemo(() => {
    const set = new Set();
    events.forEach(e => set.add(e.resource ?? '(Unassigned)'));
    return [...set].sort((a, b) => {
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      return a.localeCompare(b);
    });
  }, [events]);

  // Group + lane-assign events per resource
  const rows = useMemo(() => {
    return resources.map(resource => {
      const resEvents = events.filter(
        e => (e.resource ?? '(Unassigned)') === resource
      );
      const { events: laned, laneCount } = assignLanes(resEvents, monthStart, monthEnd);
      const rowH = laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2;
      return { resource, events: laned, laneCount, rowH };
    });
  }, [resources, events, monthStart, monthEnd]);

  if (resources.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No events to display in {format(currentDate, 'MMMM yyyy')}.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.inner} style={{ width: NAME_W + totalDays * DAY_W }}>

        {/* ── Sticky header row ── */}
        <div className={styles.headerRow}>
          {/* Corner cell */}
          <div className={styles.cornerCell} style={{ width: NAME_W, minWidth: NAME_W }}>
            {format(currentDate, 'MMMM yyyy')}
          </div>

          {/* Day columns */}
          <div className={styles.dayHeads}>
            {days.map(day => (
              <div
                key={format(day, 'yyyy-MM-dd')}
                className={[
                  styles.dayHead,
                  isToday(day)    && styles.todayHead,
                  isWeekend(day)  && styles.weekendHead,
                ].filter(Boolean).join(' ')}
                style={{ width: DAY_W, minWidth: DAY_W }}
              >
                <span className={styles.dayNum}>{format(day, 'd')}</span>
                <span className={styles.dayAbbr}>{format(day, 'EEE')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Resource rows ── */}
        <div className={styles.body}>
          {rows.map(({ resource, events: rowEvents, rowH }) => (
            <div
              key={resource}
              className={styles.row}
              style={{ height: rowH, minHeight: rowH }}
            >
              {/* Sticky name cell */}
              <div
                className={styles.nameCell}
                style={{ width: NAME_W, minWidth: NAME_W, height: rowH }}
              >
                <span className={styles.resourceName}>{resource}</span>
              </div>

              {/* Event zone */}
              <div
                className={styles.eventZone}
                style={{ width: totalDays * DAY_W, height: rowH, position: 'relative' }}
              >
                {/* Day column background lines */}
                {days.map((day, di) => (
                  <div
                    key={di}
                    className={[
                      styles.dayCol,
                      isToday(day)   && styles.todayCol,
                      isWeekend(day) && styles.weekendCol,
                    ].filter(Boolean).join(' ')}
                    style={{ left: di * DAY_W, width: DAY_W, height: rowH }}
                  />
                ))}

                {/* Event bars */}
                {rowEvents.map(ev => {
                  const left   = ev._dayStart * DAY_W + 2;
                  const width  = Math.max(DAY_W - 4, (ev._dayEnd - ev._dayStart + 1) * DAY_W - 4);
                  const top    = ROW_PAD + ev._lane * (LANE_H + LANE_GAP);

                  return (
                    <button
                      key={ev.id}
                      className={styles.event}
                      style={{
                        left,
                        top,
                        width,
                        height: LANE_H,
                        '--ev-color': ev.color,
                      }}
                      onClick={() => onEventClick?.(ev)}
                      title={`${ev.title}${ev.category ? ` · ${ev.category}` : ''}`}
                    >
                      <span className={styles.evDot} />
                      <span className={styles.evTitle}>{ev.title}</span>
                      {(ev._dayEnd - ev._dayStart + 1) >= 3 && ev.category && (
                        <span className={styles.evCat}>{ev.category}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
