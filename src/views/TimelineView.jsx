/**
 * TimelineView.jsx — Horizontal employee / resource timeline.
 *
 * Layout:
 *   Rows    = employees (or resources, when no employees prop)
 *   Columns = days of the month
 *   Events  = horizontal bars spanning their day(s)
 *
 * Props:
 *   employees       Array<{ id, name, color?, role? }>
 *                   When provided, rows are employee-defined and matched via
 *                   event.resource === employee.id.  Pass [] to fall back to
 *                   resource-derived rows.
 *   onCallCategory  Category string that marks on-call shift events.
 *                   Default: 'on-call'.  These get a striped background style.
 */
import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, isToday, isWeekend,
  differenceInCalendarDays, startOfDay, min, max,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext.js';
import styles from './TimelineView.module.css';

// ─── Layout constants ─────────────────────────────────────────────────────────

const NAME_W   = 188;  // px — left column (wider to fit avatar + role)
const DAY_W    = 52;   // px — each day column
const LANE_H   = 26;   // px — each event lane
const LANE_GAP = 3;    // px — gap between lanes
const ROW_PAD  = 8;    // px — top/bottom padding per row

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function employeeColor(emp, idx) {
  if (emp.color) return emp.color;
  return `hsl(${Math.round((idx * 137.508) % 360)}, 55%, 45%)`;
}

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimelineView({
  currentDate,
  events,
  onEventClick,
  employees = [],
  onCallCategory = 'on-call',
}) {
  const ctx        = useCalendarContext();
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const days       = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart.toISOString()],
  );
  const totalDays = days.length;

  // ── Row source: employees list OR derive from event resources ──────────────

  const useEmployees = employees && employees.length > 0;

  const resourceList = useMemo(() => {
    if (useEmployees) return null; // not used
    const set = new Set();
    events.forEach(e => set.add(e.resource ?? '(Unassigned)'));
    return [...set].sort((a, b) => {
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      return a.localeCompare(b);
    });
  }, [useEmployees, events]);

  // Build row data
  const rows = useMemo(() => {
    if (useEmployees) {
      return employees.map((emp, idx) => {
        const eventsForRow = events.filter(
          e => (e.resource ?? '') === emp.id,
        );
        const { events: laned, laneCount } = assignLanes(eventsForRow, monthStart, monthEnd);
        const rowH = Math.max(
          laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2,
          // Taller minimum so avatar + role always fit
          ROW_PAD * 2 + LANE_H + 16,
        );
        return {
          key:     emp.id,
          emp,
          empIdx:  idx,
          events:  laned,
          laneCount,
          rowH,
        };
      });
    }

    return resourceList.map(resource => {
      const resEvents = events.filter(
        e => (e.resource ?? '(Unassigned)') === resource,
      );
      const { events: laned, laneCount } = assignLanes(resEvents, monthStart, monthEnd);
      const rowH = laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2;
      return { key: resource, emp: null, empIdx: 0, resource, events: laned, laneCount, rowH };
    });
  }, [useEmployees, employees, resourceList, events, monthStart.toISOString(), monthEnd.toISOString()]);

  // ── Empty state ────────────────────────────────────────────────────────────

  if (rows.length === 0) {
    if (ctx?.emptyState) return <>{ctx.emptyState}</>;
    return (
      <div className={styles.empty}>
        <p>No {useEmployees ? 'employees' : 'events'} to display in {format(currentDate, 'MMMM yyyy')}.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrap}>
      <div className={styles.inner} style={{ width: NAME_W + totalDays * DAY_W }}>

        {/* ── Sticky header ── */}
        <div className={styles.headerRow}>
          <div className={styles.cornerCell} style={{ width: NAME_W, minWidth: NAME_W }}>
            {format(currentDate, 'MMMM yyyy')}
          </div>
          <div className={styles.dayHeads}>
            {days.map(day => (
              <div
                key={format(day, 'yyyy-MM-dd')}
                className={[
                  styles.dayHead,
                  isToday(day)   && styles.todayHead,
                  isWeekend(day) && styles.weekendHead,
                ].filter(Boolean).join(' ')}
                style={{ width: DAY_W, minWidth: DAY_W }}
              >
                <span className={styles.dayNum}>{format(day, 'd')}</span>
                <span className={styles.dayAbbr}>{format(day, 'EEE')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Body rows ── */}
        <div className={styles.body}>
          {rows.map(({ key, emp, empIdx, resource, events: rowEvents, rowH }) => {
            const label = emp ? emp.name : resource;
            const color = emp ? employeeColor(emp, empIdx) : null;

            return (
              <div
                key={key}
                className={styles.row}
                style={{ height: rowH, minHeight: rowH }}
              >
                {/* Sticky name / employee cell */}
                <div
                  className={styles.nameCell}
                  style={{ width: NAME_W, minWidth: NAME_W, height: rowH }}
                >
                  {emp ? (
                    /* Employee display: avatar + name + role */
                    <>
                      <div
                        className={styles.empAvatar}
                        style={{ background: color }}
                        aria-hidden="true"
                      >
                        {emp.avatar
                          ? <img src={emp.avatar} alt="" className={styles.empAvatarImg} />
                          : getInitials(emp.name)
                        }
                      </div>
                      <div className={styles.nameInfo}>
                        <span className={styles.empName}>{emp.name}</span>
                        {emp.role && <span className={styles.empRole}>{emp.role}</span>}
                      </div>
                    </>
                  ) : (
                    <span className={styles.resourceName}>{label}</span>
                  )}
                </div>

                {/* Event zone */}
                <div
                  className={styles.eventZone}
                  style={{ width: totalDays * DAY_W, height: rowH, position: 'relative' }}
                >
                  {/* Day column backgrounds */}
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
                    const isOnCall = ev.category === onCallCategory || ev.meta?.onCall === true;
                    const evColor  = isOnCall
                      ? (color ?? resolveColor(ev, ctx?.colorRules))
                      : resolveColor(ev, ctx?.colorRules);

                    const left   = ev._dayStart * DAY_W + 2;
                    const width  = Math.max(DAY_W - 4, (ev._dayEnd - ev._dayStart + 1) * DAY_W - 4);
                    const top    = ROW_PAD + ev._lane * (LANE_H + LANE_GAP);
                    const onClick = () => onEventClick?.(ev);

                    const statusClass = ev.status === 'cancelled' ? styles.cancelled
                      : ev.status === 'tentative' ? styles.tentative : '';

                    if (ctx?.renderEvent) {
                      const custom = ctx.renderEvent(ev, {
                        view: 'timeline', isCompact: true, onClick, color: evColor,
                      });
                      if (custom != null) {
                        return (
                          <div
                            key={ev.id}
                            className={[
                              styles.event,
                              isOnCall && styles.onCall,
                              statusClass,
                            ].filter(Boolean).join(' ')}
                            style={{ left, top, width, height: LANE_H, '--ev-color': evColor }}
                          >
                            {custom}
                          </div>
                        );
                      }
                    }

                    return (
                      <button
                        key={ev.id}
                        className={[
                          styles.event,
                          isOnCall && styles.onCall,
                          statusClass,
                        ].filter(Boolean).join(' ')}
                        style={{ left, top, width, height: LANE_H, '--ev-color': evColor }}
                        onClick={onClick}
                        title={`${ev.title}${ev.category ? ` · ${ev.category}` : ''}`}
                      >
                        {isOnCall
                          ? <span className={styles.onCallIcon} aria-hidden="true">🌙</span>
                          : <span className={styles.evDot} />
                        }
                        <span className={styles.evTitle}>{ev.title}</span>
                        {!isOnCall && (ev._dayEnd - ev._dayStart + 1) >= 3 && ev.category && (
                          <span className={styles.evCat}>{ev.category}</span>
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
    </div>
  );
}
