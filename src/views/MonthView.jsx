import { useMemo, useState, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  format, getISOWeek, startOfDay,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext.js';
import { layoutSpans } from '../core/layout.js';
import styles from './MonthView.module.css';

const SPAN_H   = 22;
const SPAN_GAP = 3;
const MAX_SPANS_VISIBLE = 3;

function isMultiDay(ev) {
  return ev.allDay || !isSameDay(ev.start, ev.end);
}

export default function MonthView({
  currentDate, events, onEventClick, onEventMove, onDateSelect,
  config, weekStartDay = 0,
}) {
  const [popoverDay, setPopoverDay] = useState(null);
  const ctx = useCalendarContext();

  // ── Drag state ───────────────────────────────────────────────────────────
  const dragRef    = useRef(null); // { ev, moved, targetDay }
  const [dragTarget, setDragTarget] = useState(null); // Date | null

  function startPillDrag(ev, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { ev, moved: false, targetDay: null };
  }

  function handleCellPointerEnter(day) {
    const d = dragRef.current;
    if (!d) return;
    d.moved     = true;
    d.targetDay = day;
    setDragTarget(day);
  }

  function commitDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragTarget(null);
    if (!d || !d.moved || !d.targetDay) return;
    if (isSameDay(d.targetDay, d.ev.start)) return;

    const durationMs = d.ev.end.getTime() - d.ev.start.getTime();
    const newStart   = new Date(startOfDay(d.targetDay));
    if (!d.ev.allDay) {
      newStart.setHours(d.ev.start.getHours(), d.ev.start.getMinutes(), 0, 0);
    }
    const newEnd = new Date(newStart.getTime() + durationMs);
    onEventMove?.(d.ev, newStart, newEnd);
  }

  function cancelDrag() {
    dragRef.current = null;
    setDragTarget(null);
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const { weeks, dayNames } = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd   = endOfMonth(currentDate);
    const gridStart  = startOfWeek(monthStart, { weekStartsOn: weekStartDay });
    const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: weekStartDay });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const wks  = [];
    for (let i = 0; i < days.length; i += 7) wks.push(days.slice(i, i + 7));
    const names = [];
    for (let i = 0; i < 7; i++) names.push(format(days[i], 'EEE'));
    return { weeks: wks, dayNames: names };
  }, [currentDate, weekStartDay]);

  const { multiDay, singleDay } = useMemo(() => {
    const multi = [];
    const single = [];
    events.forEach(ev => (isMultiDay(ev) ? multi : single).push(ev));
    return { multiDay: multi, singleDay: single };
  }, [events]);

  const singleByDay = useMemo(() => {
    const map = new Map();
    singleDay.forEach(ev => {
      const key = format(ev.start, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    });
    return map;
  }, [singleDay]);

  const showWeekNumbers = config?.display?.showWeekNumbers;

  // ── Renderers ─────────────────────────────────────────────────────────────
  function renderPill(ev, extra = {}) {
    const color       = resolveColor(ev, ctx?.colorRules);
    const onClick     = () => { onEventClick?.(ev); extra.onAfterClick?.(); };
    const isDimmed    = dragRef.current?.ev?.id === ev.id && dragTarget !== null;
    const statusClass = ev.status === 'cancelled' ? styles.cancelled
      : ev.status === 'tentative' ? styles.tentative : '';

    if (ctx?.renderEvent) {
      const custom = ctx.renderEvent(ev, { view: 'month', isCompact: true, onClick, color });
      if (custom != null) {
        return (
          <div key={ev.id}
            className={[styles.eventPill, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
            onClick={e => { e.stopPropagation(); onClick(); }}
            onPointerDown={e => startPillDrag(ev, e)}
          >
            {custom}
          </div>
        );
      }
    }

    return (
      <button key={ev.id}
        className={[styles.eventPill, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
        style={{ '--ev-color': color }}
        onClick={e => { e.stopPropagation(); onClick(); }}
        onPointerDown={e => startPillDrag(ev, e)}
        title={ev.title}
      >
        {ev.title}
      </button>
    );
  }

  function renderGhostPill() {
    const d = dragRef.current;
    if (!d || !dragTarget) return null;
    const color = resolveColor(d.ev, ctx?.colorRules);
    return (
      <div
        className={[styles.eventPill, styles.ghost].filter(Boolean).join(' ')}
        style={{ '--ev-color': color }}
        aria-hidden="true"
      >
        {d.ev.title}
      </div>
    );
  }

  return (
    <div className={styles.month}
      onPointerUp={commitDrag}
      onPointerLeave={cancelDrag}
    >
      {/* Day name header */}
      <div className={styles.header}
        style={{ gridTemplateColumns: showWeekNumbers ? `32px repeat(7, 1fr)` : `repeat(7, 1fr)` }}>
        {showWeekNumbers && <div className={styles.weekNumHead} />}
        {dayNames.map(n => <div key={n} className={styles.dayName}>{n}</div>)}
      </div>

      <div className={styles.grid}>
        {weeks.map((week, wi) => {
          const weekStart = week[0];
          const weekEnd   = week[6];

          const spans = layoutSpans(multiDay, weekStart, weekEnd);
          const laneCount   = spans.length ? Math.max(...spans.map(s => s.lane)) + 1 : 0;
          const spansHeight = Math.min(laneCount, MAX_SPANS_VISIBLE) * (SPAN_H + SPAN_GAP);

          return (
            <div key={wi} className={styles.weekRow}>
              {showWeekNumbers && (
                <div className={styles.weekNum}>{getISOWeek(week[0])}</div>
              )}

              <div className={styles.daysArea}>
                {/* ── Spanning event bars ── */}
                {laneCount > 0 && (
                  <div className={styles.spansLayer} style={{ height: spansHeight }}>
                    {spans
                      .filter(s => s.lane < MAX_SPANS_VISIBLE)
                      .map(({ ev, startCol, endCol, lane, continuesBefore, continuesAfter }) => {
                        const color = resolveColor(ev, ctx?.colorRules);
                        const pctLeft  = (startCol / 7) * 100;
                        const pctWidth = ((endCol - startCol + 1) / 7) * 100;
                        const statusClass = ev.status === 'cancelled' ? styles.cancelled
                          : ev.status === 'tentative' ? styles.tentative : '';
                        const isDimmed = dragRef.current?.ev?.id === ev.id && dragTarget !== null;
                        return (
                          <button
                            key={`${ev.id}-w${wi}`}
                            className={[
                              styles.spanBar,
                              continuesBefore && styles.continuesBefore,
                              continuesAfter  && styles.continuesAfter,
                              statusClass,
                              isDimmed && styles.dragging,
                            ].filter(Boolean).join(' ')}
                            style={{
                              '--ev-color': color,
                              left:   `${pctLeft}%`,
                              width:  `${pctWidth}%`,
                              top:    lane * (SPAN_H + SPAN_GAP),
                              height: SPAN_H,
                            }}
                            onClick={e => { e.stopPropagation(); onEventClick?.(ev); }}
                            onPointerDown={e => startPillDrag(ev, e)}
                            title={ev.title}
                          >
                            {!continuesBefore && ev.title}
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* ── Day cells ── */}
                <div className={styles.weekCells} style={{ paddingTop: spansHeight }}>
                  {week.map((day, di) => {
                    const dayKey     = format(day, 'yyyy-MM-dd');
                    const daySingles = singleByDay.get(dayKey) || [];
                    const isDropTarget = dragTarget && isSameDay(dragTarget, day);

                    const spansOnDay    = spans.filter(s => s.startCol <= di && s.endCol >= di);
                    const hiddenSpans   = spansOnDay.filter(s => s.lane >= MAX_SPANS_VISIBLE).length;
                    const visibleSpLanes = spansOnDay.filter(s => s.lane < MAX_SPANS_VISIBLE).length;
                    const MAX_PILLS     = Math.max(0, 3 - visibleSpLanes);
                    const overflowCount = hiddenSpans + Math.max(0, daySingles.length - MAX_PILLS);
                    const isPopoverOpen = popoverDay && isSameDay(popoverDay, day);

                    return (
                      <div
                        key={dayKey}
                        className={[
                          styles.cell,
                          !isSameMonth(day, currentDate) && styles.otherMonth,
                          isToday(day) && styles.today,
                          isDropTarget && styles.dropTarget,
                        ].filter(Boolean).join(' ')}
                        onClick={() => {
                          if (!onDateSelect) return;
                          const s = new Date(day); s.setHours(9, 0, 0, 0);
                          const e = new Date(day); e.setHours(10, 0, 0, 0);
                          onDateSelect(s, e);
                        }}
                        onPointerEnter={() => handleCellPointerEnter(day)}
                      >
                        <span className={styles.dayNum}>{format(day, 'd')}</span>

                        <div className={styles.events}>
                          {daySingles.slice(0, MAX_PILLS).map(ev => renderPill(ev))}
                          {isDropTarget && renderGhostPill()}
                          {overflowCount > 0 && (
                            <button
                              className={styles.morePill}
                              onClick={e => {
                                e.stopPropagation();
                                setPopoverDay(isPopoverOpen ? null : day);
                              }}
                            >
                              +{overflowCount} more
                            </button>
                          )}
                        </div>

                        {isPopoverOpen && (
                          <div className={styles.popover} onClick={e => e.stopPropagation()}>
                            <div className={styles.popoverHead}>
                              <span>{format(day, 'MMMM d')}</span>
                              <button onClick={() => setPopoverDay(null)}>×</button>
                            </div>
                            {[...spansOnDay.map(s => s.ev), ...daySingles].map(ev =>
                              renderPill(ev, { onAfterClick: () => setPopoverDay(null) }),
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
