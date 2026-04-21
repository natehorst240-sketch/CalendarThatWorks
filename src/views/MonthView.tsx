import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  format, getISOWeek, startOfDay, addDays, subDays,
} from 'date-fns';
import type { Day } from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import { displayEndDay, layoutSpans } from '../core/layout';
import type { CalendarViewEvent } from '../types/ui';
import styles from './MonthView.module.css';

const SPAN_H   = 22;
const SPAN_GAP = 3;
const MAX_SPANS_VISIBLE = 3;
const OVERFLOW_TRACK_H = SPAN_H + 4;

function isMultiDay(ev: CalendarViewEvent): boolean {
  if (ev.allDay) return true;
  return !isSameDay(startOfDay(ev.start), displayEndDay(ev));
}

type MonthViewProps = {
  currentDate: Date;
  events: CalendarViewEvent[];
  onEventClick?: (event: CalendarViewEvent) => void;
  onEventMove?: (event: CalendarViewEvent, newStart: Date, newEnd: Date) => void;
  onDateSelect?: (start: Date, end: Date) => void;
  config?: {
    display?: {
      showWeekNumbers?: boolean;
      enlargeMonthRowOnHover?: boolean;
    };
  };
  weekStartDay?: Day;
  pillHoverTitle?: boolean;
} & Record<string, unknown>;

export default function MonthView({
  currentDate, events, onEventClick, onEventMove, onDateSelect,
  config, weekStartDay = 0, pillHoverTitle = false,
}: MonthViewProps) {
  const [popoverState, setPopoverState] = useState<{ day: Date; anchorRect: DOMRect } | null>(null);
  const [hoveredWeekIdx, setHoveredWeekIdx] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window === 'undefined' ? 1024 : window.innerWidth),
  );
  // Hover projection panel state (positioned above hovered month-view pills).
  const [titleHover, setTitleHover] = useState<{
    title: string;
    color: string;
    x: number;
    y: number;
    dates: string;
    category: string | null;
    resource: string | null;
    notes: string | null;
  } | null>(null);
  // Keyboard-focused day cell (roving tabindex pattern).
  const [focusedDay,  setFocusedDay]  = useState(() => startOfDay(currentDate));
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ctx = useCalendarContext();

  // Sync focusedDay when the parent navigates to a new month.
  useEffect(() => {
    setFocusedDay(startOfDay(currentDate));
  }, [currentDate]);

  // Keep month-row spacing in sync with responsive CSS breakpoints.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!popoverState) return undefined;

    function handlePointerDown(e: MouseEvent) {
      if (e.target.closest?.('[data-month-popover], [data-month-more-trigger]')) return;
      setPopoverState(null);
    }

    function handleDismiss(e: KeyboardEvent | Event) {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      setPopoverState(null);
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleDismiss);
    window.addEventListener('resize', handleDismiss);
    window.addEventListener('scroll', handleDismiss, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleDismiss);
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
    };
  }, [popoverState]);

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
  const handleCellKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>, day: Date) => {
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
  const dragRef = useRef<{ ev: CalendarViewEvent; moved: boolean; targetDay: Date | null } | null>(null);
  const [dragTarget, setDragTarget] = useState<Date | null>(null);

  function startPillDrag(ev: CalendarViewEvent, e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || !ctx?.permissions?.canDrag) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { ev, moved: false, targetDay: null };
  }

  function handleCellPointerEnter(day: Date) {
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
    const wks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) wks.push(days.slice(i, i + 7));
    const names: string[] = [];
    for (let i = 0; i < 7; i++) names.push(format(days[i], 'EEE'));
    return { weeks: wks, dayNames: names };
  }, [currentDate, weekStartDay]);

  const { multiDay, singleDay } = useMemo(() => {
    const multi: CalendarViewEvent[] = [];
    const single: CalendarViewEvent[] = [];
    events.forEach(ev => (isMultiDay(ev) ? multi : single).push(ev));
    return { multiDay: multi, singleDay: single };
  }, [events]);

  const singleByDay = useMemo(() => {
    const map = new Map<string, CalendarViewEvent[]>();
    singleDay.forEach(ev => {
      const key = format(ev.start, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    });

    map.forEach((dayEvents, key) => {
      dayEvents.sort((a: CalendarViewEvent, b: CalendarViewEvent) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        const startDiff = a.start.getTime() - b.start.getTime();
        if (startDiff !== 0) return startDiff;
        return a.title.localeCompare(b.title);
      });
      map.set(key, dayEvents);
    });

    return map;
  }, [singleDay]);

  const showWeekNumbers = config?.display?.showWeekNumbers;
  const enlargeMonthRowOnHover = !!config?.display?.enlargeMonthRowOnHover;
  const layoutMetrics = useMemo(() => {
    if (viewportWidth <= 480) {
      return { dayNumTrackH: 24, weekRowMinH: 80, weekRowHoverMinH: 120 };
    }
    if (viewportWidth <= 768) {
      return { dayNumTrackH: 28, weekRowMinH: 72, weekRowHoverMinH: 108 };
    }
    return { dayNumTrackH: 32, weekRowMinH: 120, weekRowHoverMinH: 150 };
  }, [viewportWidth]);

  function buildHoverProjection(ev: CalendarViewEvent, color: string, rect: DOMRect) {
    const dates = ev.allDay
      ? (isSameDay(ev.start, ev.end)
        ? format(ev.start, 'EEE, MMM d')
        : `${format(ev.start, 'EEE, MMM d')} – ${format(ev.end, 'EEE, MMM d')}`)
      : (isSameDay(ev.start, ev.end)
        ? `${format(ev.start, 'EEE, MMM d, h:mm a')} – ${format(ev.end, 'h:mm a')}`
        : `${format(ev.start, 'EEE, MMM d, h:mm a')} – ${format(ev.end, 'EEE, MMM d, h:mm a')}`);

    const notes = ev.notes ?? ev.meta?.notes ?? ev._raw?.notes ?? '';

    return {
      title: ev.title,
      color,
      x: rect.left + rect.width / 2,
      y: rect.top,
      dates,
      category: ev.category || null,
      resource: ev.resource || null,
      notes: notes ? String(notes) : null,
    };
  }

  const getPopoverEvents = useCallback((day: Date): CalendarViewEvent[] => {
    const dayStart = startOfDay(day);
    const dayKey = format(day, 'yyyy-MM-dd');
    const spanningEvents = multiDay.filter((ev) => dayStart >= startOfDay(ev.start) && dayStart <= displayEndDay(ev));
    const singleEvents = singleByDay.get(dayKey) || [];
    return [...spanningEvents, ...singleEvents];
  }, [multiDay, singleByDay]);

  const popoverStyle = useMemo(() => {
    if (!popoverState?.anchorRect) return null;

    const viewportW = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const viewportH = typeof window === 'undefined' ? 720 : window.innerHeight;
    const margin = 8;
    const width = Math.min(280, Math.max(220, popoverState.anchorRect.width + 28));
    let left = popoverState.anchorRect.left;
    if (left + width > viewportW - margin) left = viewportW - width - margin;
    if (left < margin) left = margin;

    const estimatedHeight = 300;
    const shouldOpenUp = popoverState.anchorRect.bottom + estimatedHeight > viewportH - margin;
    let top = shouldOpenUp
      ? popoverState.anchorRect.top - estimatedHeight - 6
      : popoverState.anchorRect.bottom + 6;
    if (top < margin) top = margin;

    return {
      left,
      top,
      width,
      maxHeight: Math.max(160, viewportH - top - margin),
    };
  }, [popoverState]);

  // ── Renderers ─────────────────────────────────────────────────────────────
  function renderPill(ev: CalendarViewEvent, extra: { onAfterClick?: () => void } = {}, weekIdx: number | null = null) {
    const color       = resolveColor(ev, ctx?.colorRules);
    const onClick     = () => { onEventClick?.(ev); extra.onAfterClick?.(); };
    const isDimmed    = dragRef.current?.ev?.id === ev.id && dragTarget !== null;
    const statusClass = ev.status === 'cancelled' ? styles.cancelled
      : ev.status === 'tentative' ? styles.tentative : '';
    const display     = ev.meta?._display ?? {};

    function handlePillMouseEnter(e: ReactMouseEvent<HTMLElement>) {
      if (enlargeMonthRowOnHover && weekIdx != null) setHoveredWeekIdx(weekIdx);
      if (pillHoverTitle) {
        const r = e.currentTarget.getBoundingClientRect();
        setTitleHover(buildHoverProjection(ev, color, r));
      }
    }
    function handlePillMouseLeave() {
      if (enlargeMonthRowOnHover) setHoveredWeekIdx((prev: number | null) => (prev === weekIdx ? null : prev));
      if (pillHoverTitle) setTitleHover(null);
    }

    if (ctx?.renderEvent) {
      const custom = ctx.renderEvent(ev, { view: 'month', isCompact: true, onClick, color });
      if (custom != null) {
        return (
          <div key={ev.id}
            className={[styles.eventPill, statusClass, isDimmed && styles.dragging].filter(Boolean).join(' ')}
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onClick(); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } }}
            onPointerDown={e => startPillDrag(ev, e)}
            onMouseEnter={handlePillMouseEnter}
            onMouseLeave={handlePillMouseLeave}
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
        className={[
          styles.eventPill,
          statusClass,
          isDimmed && styles.dragging,
          ctx?.editMode && styles.editModePill,
        ].filter(Boolean).join(' ')}
        style={{
          '--ev-color': color,
          fontWeight: display.bold  ? '700' : undefined,
          fontSize:   display.large ? '12px' : undefined,
          minHeight:  display.large ? '26px' : undefined,
          height:     display.large ? '26px' : undefined,
        }}
        onClick={e => { e.stopPropagation(); onClick(); }}
        onPointerDown={e => startPillDrag(ev, e)}
        onMouseEnter={handlePillMouseEnter}
        onMouseLeave={handlePillMouseLeave}
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
    <>
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

          const isHovered = enlargeMonthRowOnHover && hoveredWeekIdx === wi;
          const rowMinH   = Math.max(
            isHovered ? layoutMetrics.weekRowHoverMinH : layoutMetrics.weekRowMinH,
            layoutMetrics.dayNumTrackH + spansHeight + SPAN_H + OVERFLOW_TRACK_H + 6,
          );

          return (
            <div
              key={wi}
              className={[styles.weekRow, isHovered && styles.weekRowHovered].filter(Boolean).join(' ')}
              style={{ minHeight: rowMinH }}
            >
              {showWeekNumbers && (
                <div className={styles.weekNum}>{getISOWeek(week[0])}</div>
              )}

              <div className={styles.daysArea}>
                {/* ── Day cells (base layer — fills full daysArea height) ── */}
                <div className={styles.weekCells} role="row" aria-rowindex={wi + 2}>
                  {week.map((day, di) => {
                    const dayKey     = format(day, 'yyyy-MM-dd');
                    const daySingles = singleByDay.get(dayKey) || [];
                    const isDropTarget = dragTarget && isSameDay(dragTarget, day);
                    const isFocused  = isSameDay(day, focusedDay);

                    const spansOnDay    = spans.filter(s => s.startCol <= di && s.endCol >= di);
                    const hiddenSpans   = spansOnDay.filter(s => s.lane >= MAX_SPANS_VISIBLE).length;
                    const visibleSpLanes = spansOnDay.filter(s => s.lane < MAX_SPANS_VISIBLE).length;
                    const MAX_PILLS     = Math.max(1, 3 - visibleSpLanes);
                    const overflowCount = hiddenSpans + Math.max(0, daySingles.length - MAX_PILLS);
                    const isPopoverOpen = popoverState && isSameDay(popoverState.day, day);
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
                        <div className={styles.cellHead}>
                          <span className={styles.dayNum}>{format(day, 'd')}</span>
                          {overflowCount > 0 && (
                            <button
                              className={styles.moreLink}
                              data-month-more-trigger="true"
                              aria-label={`${overflowCount} more event${overflowCount === 1 ? '' : 's'} on ${format(day, 'MMMM d')}`}
                              aria-expanded={!!isPopoverOpen}
                              aria-controls={popoverId}
                              onClick={e => {
                                e.stopPropagation();
                                const anchorRect = e.currentTarget.getBoundingClientRect();
                                setPopoverState(isPopoverOpen ? null : { day, anchorRect });
                              }}
                            >
                              +{overflowCount} more
                            </button>
                          )}
                        </div>

                        {/* paddingTop reserves space for the absolutely-positioned spansLayer */}
                        <div className={styles.events} style={{ paddingTop: spansHeight }}>
                          {daySingles.slice(0, MAX_PILLS).map((ev: CalendarViewEvent) => renderPill(ev, {}, wi))}
                          {isDropTarget && renderGhostPill()}
                        </div>

                      </div>
                    );
                  })}
                </div>

                {/* ── Spanning event bars (overlaid below date numbers, above pills) ── */}
                {laneCount > 0 && (
                  <div className={styles.spansLayer} style={{ top: layoutMetrics.dayNumTrackH, height: spansHeight }}>
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
                            onMouseEnter={(e) => {
                              if (enlargeMonthRowOnHover) setHoveredWeekIdx(wi);
                              if (pillHoverTitle) {
                                const r = e.currentTarget.getBoundingClientRect();
                                setTitleHover(buildHoverProjection(ev, color, r));
                              }
                            }}
                            onMouseLeave={() => {
                              if (enlargeMonthRowOnHover) setHoveredWeekIdx((prev: number | null) => (prev === wi ? null : prev));
                              if (pillHoverTitle) setTitleHover(null);
                            }}
                            aria-label={`${ev.title}${ev.category ? `, ${ev.category}` : ''}${continuesBefore ? ', continues from previous week' : ''}${continuesAfter ? ', continues next week' : ''}`}
                          >
                            {!continuesBefore && ev.title}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {popoverState && popoverStyle && (
      <div
        id={`wc-popover-${format(popoverState.day, 'yyyy-MM-dd')}`}
        className={styles.popover}
        data-month-popover="true"
        style={popoverStyle}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.popoverHead}>
          <span>{format(popoverState.day, 'MMMM d')}</span>
          <button onClick={() => setPopoverState(null)} aria-label="Close expanded day events">×</button>
        </div>
        {getPopoverEvents(popoverState.day).map(ev =>
          renderPill(ev, { onAfterClick: () => setPopoverState(null) }),
        )}
      </div>
    )}

    {/* ── Pill hover projection overlay ── */}
    {popoverState && popoverStyle && (
      <div
        id={`wc-popover-${format(popoverState.day, 'yyyy-MM-dd')}`}
        className={styles.popover}
        data-month-popover="true"
        style={popoverStyle}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.popoverHead}>
          <span>{format(popoverState.day, 'MMMM d')}</span>
          <button onClick={() => setPopoverState(null)} aria-label="Close expanded day events">×</button>
        </div>
        {getPopoverEvents(popoverState.day).map(ev =>
          renderPill(ev, { onAfterClick: () => setPopoverState(null) }),
        )}
      </div>
    )}

    {pillHoverTitle && titleHover && (
      <div
        aria-hidden="true"
        style={{
          position:      'fixed',
          left:          titleHover.x,
          top:           titleHover.y - 10,
          transform:     'translate(-50%, -100%)',
          background:    titleHover.color,
          color:         '#fff',
          fontSize:      16,
          fontWeight:    600,
          lineHeight:    1.25,
          padding:       '10px 14px',
          borderRadius:  10,
          pointerEvents: 'none',
          zIndex:        9999,
          maxWidth:      460,
          boxShadow:     '0 4px 20px rgba(0,0,0,0.28)',
          textShadow:    '0 1px 3px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{titleHover.title}</div>
        <div style={{ opacity: 0.95 }}>{titleHover.dates}</div>
        {titleHover.category && <div>Category: {titleHover.category}</div>}
        {titleHover.resource && <div>Resource: {titleHover.resource}</div>}
        {titleHover.notes && (
          <div style={{ marginTop: 4, opacity: 0.95 }}>
            Notes: {titleHover.notes.length > 140 ? `${titleHover.notes.slice(0, 140)}…` : titleHover.notes}
          </div>
        )}
      </div>
    )}
    </>
  );
}
