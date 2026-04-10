import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  format, getISOWeek, startOfDay, addDays, subDays,
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
  const [popoverDay,  setPopoverDay]  = useState(null);
  // Keyboard-focused day cell (roving tabindex pattern).
  const [focusedDay,  setFocusedDay]  = useState(() => startOfDay(currentDate));
  const gridRef = useRef(null);
  const ctx = useCalendarContext();

  // Sync focusedDay when the parent navigates to a new month.
  useEffect(() => {
    setFocusedDay(startOfDay(currentDate));
  }, [currentDate]);

  // After focusedDay changes, move DOM focus to the newly-active cell.
  // Skip if the focus change was initiated by a mouse click (pointer
  // interaction already sets focus natively).
  const lastKeyNav = useRef(false);
  useEffect(() => {
    if (!lastKeyNav.current || !gridRef.current) return;
    lastKeyNav.current = false;
    const key = format(focusedDay, 'yyyy-MM-dd');
    const cell = gridRef.current.querySelector(`[data-date="${key}"]`);
    cell?.focus({ preventScroll: false });
  }, [focusedDay]);

  // Arrow-key navigation handler attached to each gridcell.
  const handleCellKeyDown = useCallback((e, day) => {
    let next = null;
    switch (e.key) {
      case 'ArrowLeft':  next = subDays(day, 1);  break;
      case 'ArrowRight': next = addDays(day, 1);  break;
      case 'ArrowUp':    next = subDays(day, 7);  break;
      case 'ArrowDown':  next = addDays(day, 7);  break;
      case 'Home':       next = startOfWeek(day, { weekStartsOn: weekStartDay }); break;
      case 'End':        next = endOfWeek(day,   { weekStartsOn: weekStartDay }); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (onDateSelect) {
          const s = new Date(day); s.setHours(9, 0, 0, 0);
          const en = new Date(day); en.setHours(10, 0, 0, 0);
          onDateSelect(s, en);
        }
        return;
      default: return;
    }
    if (next) {
      e.preventDefault();
      lastKeyNav.current = true;
      setFocusedDay(startOfDay(next));
    }
  }, [weekStartDay, onDateSelect]);

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

    const timeLabel = ev.allDay
      ? 'all day'
      : `${format(ev.start, 'h:mm a')}`;
    const ariaLabel = `${ev.title}, ${timeLabel}${ev.category ? `, ${ev.category}` : ''}`;

    return (
      <button key={ev.id}
        className={[styles.eventPill, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
        style={{ '--ev-color': color }}
        onClick={e => { e.stopPropagation(); onClick(); }}
        onPointerDown={e => startPillDrag(ev, e)}
        aria-label={ariaLabel}
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
    <div
      className={styles.month}
      onPointerUp={commitDrag}
      onPointerLeave={cancelDrag}
      role="grid"
      aria-label={format(currentDate, 'MMMM yyyy')}
      ref={gridRef}
    >
      {/* Day name header */}
      <div
        className={styles.header}
        role="row"
        aria-rowindex={1}
        style={{ gridTemplateColumns: showWeekNumbers ? `32px repeat(7, 1fr)` : `repeat(7, 1fr)` }}
      >
        {showWeekNumbers && <div className={styles.weekNumHead} role="presentation" />}
        {dayNames.map(n => (
          <div key={n} className={styles.dayName} role="columnheader" aria-label={n}>{n}</div>
        ))}
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
                            aria-label={`${ev.title}${ev.category ? `, ${ev.category}` : ''}${continuesBefore ? ', continues from previous week' : ''}${continuesAfter ? ', continues next week' : ''}`}
                          >
                            {!continuesBefore && ev.title}
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* ── Day cells ── */}
                <div className={styles.weekCells} role="row" aria-rowindex={wi + 2} style={{ paddingTop: spansHeight }}>
                  {week.map((day, di) => {
                    const dayKey     = format(day, 'yyyy-MM-dd');
                    const daySingles = singleByDay.get(dayKey) || [];
                    const isDropTarget = dragTarget && isSameDay(dragTarget, day);
                    const isFocused  = isSameDay(day, focusedDay);

                    const spansOnDay    = spans.filter(s => s.startCol <= di && s.endCol >= di);
                    const hiddenSpans   = spansOnDay.filter(s => s.lane >= MAX_SPANS_VISIBLE).length;
                    const visibleSpLanes = spansOnDay.filter(s => s.lane < MAX_SPANS_VISIBLE).length;
                    const MAX_PILLS     = Math.max(0, 3 - visibleSpLanes);
                    const overflowCount = hiddenSpans + Math.max(0, daySingles.length - MAX_PILLS);
                    const isPopoverOpen = popoverDay && isSameDay(popoverDay, day);
                    const popoverId     = `wc-popover-${dayKey}`;
                    const totalEvents   = daySingles.length + spansOnDay.length;
                    const cellLabel     = `${format(day, 'EEEE, MMMM d')}${isToday(day) ? ', today' : ''}${totalEvents > 0 ? `, ${totalEvents} event${totalEvents === 1 ? '' : 's'}` : ''}`;

                    return (
                      <div
                        key={dayKey}
                        role="gridcell"
                        tabIndex={isFocused ? 0 : -1}
                        data-date={dayKey}
                        aria-label={cellLabel}
                        aria-selected={isFocused}
                        className={[
                          styles.cell,
                          !isSameMonth(day, currentDate) && styles.otherMonth,
                          isToday(day) && styles.today,
                          isDropTarget && styles.dropTarget,
                        ].filter(Boolean).join(' ')}
                        onClick={() => {
                          setFocusedDay(startOfDay(day));
                          if (!onDateSelect) return;
                          const s = new Date(day); s.setHours(9, 0, 0, 0);
                          const e = new Date(day); e.setHours(10, 0, 0, 0);
                          onDateSelect(s, e);
                        }}
                        onKeyDown={e => handleCellKeyDown(e, day)}
                        onPointerEnter={() => handleCellPointerEnter(day)}
                      >
                        <span className={styles.dayNum}>{format(day, 'd')}</span>

                        <div className={styles.events}>
                          {daySingles.slice(0, MAX_PILLS).map(ev => renderPill(ev))}
                          {isDropTarget && renderGhostPill()}
                          {overflowCount > 0 && (
                            <button
                              className={styles.morePill}
                              aria-label={`${overflowCount} more event${overflowCount === 1 ? '' : 's'} on ${format(day, 'MMMM d')}`}
                              aria-expanded={!!isPopoverOpen}
                              aria-controls={popoverId}
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
                          <div id={popoverId} className={styles.popover} onClick={e => e.stopPropagation()}>
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
