import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isToday, startOfDay, addDays,
} from 'date-fns';
import type { Day } from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import { layoutSpans } from '../core/layout';
import ApprovalDot from '../ui/ApprovalDot';
import EventStatusBadge from '../ui/EventStatusBadge';
import styles from './WeekView.module.css';
import type { CalendarViewEvent } from '../types/ui';
import type { NormalizedEvent } from '../types/events';

const SPAN_H            = 28;
const SPAN_GAP          = 3;
const MAX_SPANS_VISIBLE = 4;
const MAX_PILLS         = 8;

type WeekViewEvent = CalendarViewEvent & { color?: string };

interface WeekViewProps {
  currentDate: Date;
  events: WeekViewEvent[];
  onEventClick?: (ev: WeekViewEvent) => void;
  onEventMove?: (ev: WeekViewEvent, newStart: Date, newEnd: Date) => void;
  onEventResize?: (ev: WeekViewEvent, newStart: Date, newEnd: Date) => void;
  onDateSelect?: (start: Date, end: Date) => void;
  config?: { display?: { dayStart?: number; dayEnd?: number } };
  weekStartDay?: Day;
}

function isMultiDay(ev: WeekViewEvent) {
  if (ev.allDay) return true;
  return startOfDay(ev.start).getTime() !== startOfDay(ev.end).getTime();
}

export default function WeekView({
  currentDate, events, onEventClick, onEventMove, onDateSelect, weekStartDay = 0,
}: WeekViewProps) {
  const ctx = useCalendarContext();
  const [focusedDay,   setFocusedDay]   = useState(() => startOfDay(currentDate));
  const [overflowDay,  setOverflowDay]  = useState<Date | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFocusedDay(startOfDay(currentDate));
  }, [currentDate]);

  const days = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const end   = endOfWeek(currentDate,   { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start, end });
  }, [currentDate, weekStartDay]);

  const weekStart = days[0]!;
  const weekEnd   = days[6]!;

  const { multiDay, singleDay } = useMemo(() => {
    const multi: WeekViewEvent[] = [];
    const single: WeekViewEvent[] = [];
    events.forEach(ev => (isMultiDay(ev) ? multi : single).push(ev));
    return { multiDay: multi, singleDay: single };
  }, [events]);

  const singleByDay = useMemo(() => {
    const map = new Map<string, WeekViewEvent[]>();
    singleDay.forEach(ev => {
      const key = format(ev.start, 'yyyy-MM-dd');
      let bucket = map.get(key);
      if (!bucket) { bucket = []; map.set(key, bucket); }
      bucket.push(ev);
    });
    map.forEach((dayEvs, key) => {
      dayEvs.sort((a, b) => a.start.getTime() - b.start.getTime());
      map.set(key, dayEvs);
    });
    return map;
  }, [singleDay]);

  const spans = useMemo(
    () => layoutSpans(multiDay, weekStart, weekEnd),
    [multiDay, weekStart, weekEnd],
  );
  const laneCount   = spans.length ? Math.max(...spans.map(s => s.lane)) + 1 : 0;
  const spansHeight = Math.min(laneCount, MAX_SPANS_VISIBLE) * (SPAN_H + SPAN_GAP);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const lastKeyNav = useRef(false);
  useEffect(() => {
    if (!lastKeyNav.current || !gridRef.current) return;
    lastKeyNav.current = false;
    const key = format(focusedDay, 'yyyy-MM-dd');
    const cell = gridRef.current.querySelector<HTMLElement>(`[data-date="${key}"]`);
    cell?.focus({ preventScroll: false });
  }, [focusedDay]);

  const handleCellKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>, day: Date) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault(); lastKeyNav.current = true;
        setFocusedDay(addDays(startOfDay(day), -1)); break;
      case 'ArrowRight':
        e.preventDefault(); lastKeyNav.current = true;
        setFocusedDay(addDays(startOfDay(day), 1)); break;
      case 'Enter': case ' ':
        e.preventDefault();
        if (onDateSelect) {
          const s = new Date(day); s.setHours(9, 0, 0, 0);
          const end = new Date(day); end.setHours(10, 0, 0, 0);
          onDateSelect(s, end);
        }
        break;
      default: return;
    }
  }, [onDateSelect]);

  // ── Span bar drag (multi-day events, day-to-day) ──────────────────────────
  type SpanDrag = {
    ev: WeekViewEvent;
    startCol: number;
    endCol: number;
    width: number;
    clickOffset: number;
    colW: number;
    moved: boolean;
  };
  const spanDragRef  = useRef<SpanDrag | null>(null);
  const swallowNextSpanClickRef = useRef(false);
  const [spanGhost, setSpanGhost] = useState<{ ev: WeekViewEvent; startCol: number; endCol: number } | null>(null);
  const spansRef     = useRef<HTMLDivElement | null>(null);

  // ── Pill drag (single-day events, day-to-day) ─────────────────────────────
  type PillDrag = { ev: WeekViewEvent; startCol: number; colW: number; moved: boolean };
  const pillDragRef    = useRef<PillDrag | null>(null);
  const [pillTargetCol, setPillTargetCol] = useState<number | null>(null);
  const daysAreaRef    = useRef<HTMLDivElement | null>(null);

  function startPillDrag(ev: WeekViewEvent, e: ReactPointerEvent<HTMLButtonElement>, dayCol: number) {
    if (!ctx?.permissions?.canDrag) return;
    // No e.preventDefault() — that would suppress the synthesized click event.
    // setPointerCapture on daysArea redirects pointerup there, so click won't
    // fire on the pill button; handleDaysAreaPointerUp handles the tap case.
    e.stopPropagation();
    const grid = daysAreaRef.current;
    if (!grid) return;
    const colW = grid.getBoundingClientRect().width / 7;
    pillDragRef.current = { ev, startCol: dayCol, colW, moved: false };
    grid.setPointerCapture(e.pointerId);
    setPillTargetCol(dayCol);
  }

  function handleDaysAreaPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = pillDragRef.current;
    if (!d || !daysAreaRef.current) return;
    const rect = daysAreaRef.current.getBoundingClientRect();
    const col  = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left) / d.colW)));
    if (!d.moved && col !== d.startCol) d.moved = true;
    setPillTargetCol(col);
  }

  function handleDaysAreaPointerUp() {
    const d = pillDragRef.current;
    const targetCol = pillTargetCol;
    pillDragRef.current = null;
    setPillTargetCol(null);
    if (!d) return;
    if (!d.moved) {
      // Tap/click with no movement. setPointerCapture redirected pointerup to
      // daysArea so the pill's onClick never fires — trigger it manually here.
      onEventClick?.(d.ev);
      return;
    }
    if (targetCol === null) return;
    const diff = targetCol - d.startCol;
    if (diff === 0) return;
    onEventMove?.(d.ev, addDays(d.ev.start, diff), addDays(d.ev.end, diff));
  }

  function startSpanDrag(ev: WeekViewEvent, e: ReactPointerEvent<HTMLButtonElement>, startCol: number, endCol: number) {
    e.preventDefault();
    e.stopPropagation();
    const grid = spansRef.current;
    if (!grid) return;
    const rect   = grid.getBoundingClientRect();
    const colW   = rect.width / 7;
    const clickCol = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left) / colW)));
    spanDragRef.current = {
      ev,
      startCol,
      endCol,
      width: endCol - startCol,
      clickOffset: clickCol - startCol,
      colW,
      moved: false,
    };
    grid.setPointerCapture(e.pointerId);
    setSpanGhost({ ev, startCol, endCol });
  }

  function handleSpanPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = spanDragRef.current;
    if (!d || !spansRef.current) return;
    const rect   = spansRef.current.getBoundingClientRect();
    const col    = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left) / d.colW)));
    const start  = Math.max(0, Math.min(7 - d.width - 1, col - d.clickOffset));
    if (!d.moved && start !== d.startCol) d.moved = true;
    setSpanGhost({ ev: d.ev, startCol: start, endCol: start + d.width });
  }

  function handleSpanPointerUp() {
    const d = spanDragRef.current;
    const g = spanGhost;
    spanDragRef.current = null;
    setSpanGhost(null);
    if (!d || !g) return;
    if (!d.moved) {
      onEventClick?.(d.ev);
      return;
    }
    const diff = g.startCol - d.startCol;
    if (diff === 0) return;
    onEventMove?.(d.ev, addDays(d.ev.start, diff), addDays(d.ev.end, diff));
  }

  // ── Renderers ─────────────────────────────────────────────────────────────
  function renderPill(ev: WeekViewEvent, dayCol?: number, onAfterClick?: () => void) {
    const color    = resolveColor(ev as never, ctx?.colorRules);
    const isDragging = pillDragRef.current?.ev.id === ev.id;
    const onClick  = () => { if (isDragging) return; onEventClick?.(ev); onAfterClick?.(); };
    const isConflicting = !!ctx?.conflictingEventIds?.has(ev.id);
    const statusClass   = ev.status === 'cancelled' ? styles['cancelled']
      : ev.status === 'tentative' ? styles['tentative'] : '';
    const timeLabel = ev.allDay ? 'All day' : format(ev.start, 'h:mm a');
    const ariaLabel = `${ev.title}, ${timeLabel}${ev.category ? `, ${ev.category}` : ''}`;

    const inner = ctx?.renderEvent
      ? ctx.renderEvent(ev as unknown as NormalizedEvent, { view: 'week', isCompact: false, onClick, color })
      : null;

    return (
      <button key={ev.id}
        className={[styles['pill'], statusClass, isDragging && styles['dragging']].filter(Boolean).join(' ')}
        data-wc-event-id={ev.id}
        data-wc-conflicting={isConflicting ? 'true' : undefined}
        data-wc-priority={ev.visualPriority ?? undefined}
        style={{ '--ev-color': color }}
        onClick={e => { e.stopPropagation(); onClick(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } }}
        onPointerDown={dayCol !== undefined ? (e: ReactPointerEvent<HTMLButtonElement>) => startPillDrag(ev, e, dayCol) : undefined}
        aria-label={ev.lifecycle ? `${ariaLabel}, lifecycle ${ev.lifecycle}` : ariaLabel}
      >
        {inner ?? (
          <>
            <ApprovalDot event={ev as never} />
            <EventStatusBadge lifecycle={(ev as { lifecycle?: unknown }).lifecycle as never} variant="compact" />
            {!ev.allDay && <span className={styles['pillTime']}>{format(ev.start, 'h:mm a')}</span>}
            <span className={styles['pillTitle']}>{ev.title}</span>
            {ev.resource && <span className={styles['pillResource']}>{ev.resource}</span>}
          </>
        )}
      </button>
    );
  }

  return (
    <div
      className={styles['week']}
      role="grid"
      aria-label={`Week of ${format(weekStart, 'MMMM d')} – ${format(weekEnd, 'MMMM d, yyyy')}`}
      ref={gridRef}
    >
      {/* ── Body (single scroll container — header sticky at top, cells below) ── */}
      <div className={styles['body']}>
        {/* Header: sticky inside the scroll container so both header and cell
            columns share the same container width, including any scrollbar. */}
        <div className={styles['headerRow']} role="row" aria-rowindex={1}>
          {days.map(day => (
            <div key={format(day, 'yyyy-MM-dd')}
              role="columnheader"
              aria-label={`${format(day, 'EEEE, MMMM d')}${isToday(day) ? ', today' : ''}`}
              className={[styles['dayHead'], isToday(day) && styles['todayHead']].filter(Boolean).join(' ')}
            >
              <span className={styles['dayAbbr']} aria-hidden="true">{format(day, 'EEE')}</span>
              <span className={[styles['dayNum'], isToday(day) && styles['todayNum']].filter(Boolean).join(' ')} aria-hidden="true">
                {format(day, 'd')}
              </span>
            </div>
          ))}
        </div>
        <div
          className={styles['daysArea']}
          ref={daysAreaRef}
          onPointerMove={handleDaysAreaPointerMove}
          onPointerUp={handleDaysAreaPointerUp}
          onPointerCancel={() => { pillDragRef.current = null; setPillTargetCol(null); }}
        >
          {/* Day cells — single-day events as pills */}
          <div className={styles['weekCells']} role="row" aria-rowindex={2}>
            {days.map((day, di) => {
              const dayKey     = format(day, 'yyyy-MM-dd');
              const daySingles = singleByDay.get(dayKey) || [];
              const isFocused  = isSameDay(day, focusedDay);

              const spansOnDay  = spans.filter(s => s.startCol <= di && s.endCol >= di);
              const hiddenSpans = spansOnDay.filter(s => s.lane >= MAX_SPANS_VISIBLE).length;
              const overflow    = hiddenSpans + Math.max(0, daySingles.length - MAX_PILLS);
              const isOverflowOpen = overflowDay && isSameDay(overflowDay, day);
              const totalEvents = daySingles.length + spansOnDay.length;
              const cellLabel   = `${format(day, 'EEEE, MMMM d')}${isToday(day) ? ', today' : ''}${totalEvents > 0 ? `, ${totalEvents} event${totalEvents === 1 ? '' : 's'}` : ''}`;
              const isPillTarget = pillTargetCol === di && pillDragRef.current !== null;

              return (
                <div
                  key={dayKey}
                  role="gridcell"
                  tabIndex={isFocused ? 0 : -1}
                  data-date={dayKey}
                  aria-label={cellLabel}
                  aria-selected={isFocused}
                  className={[styles['cell'], isToday(day) && styles['todayCell'], isPillTarget && styles['pillDragTarget']].filter(Boolean).join(' ')}
                  onClick={() => {
                    setFocusedDay(startOfDay(day));
                    if (!onDateSelect) return;
                    const s = new Date(day); s.setHours(9, 0, 0, 0);
                    const e = new Date(day); e.setHours(10, 0, 0, 0);
                    onDateSelect(s, e);
                  }}
                  onKeyDown={e => handleCellKeyDown(e, day)}
                >
                  <div className={styles['events']} style={{ paddingTop: spansHeight }}>
                    {daySingles.slice(0, MAX_PILLS).map(ev => renderPill(ev, di))}
                    {overflow > 0 && (
                      <button
                        className={styles['moreLink']}
                        aria-label={`${overflow} more event${overflow === 1 ? '' : 's'} on ${format(day, 'MMMM d')}`}
                        aria-expanded={!!isOverflowOpen}
                        onClick={e => { e.stopPropagation(); setOverflowDay(isOverflowOpen ? null : day); }}
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>

                  {/* Per-day overflow popover */}
                  {isOverflowOpen && (
                    <div className={styles['overflowPopover']} onClick={e => e.stopPropagation()}>
                      <div className={styles['overflowHead']}>
                        <span>{format(day, 'MMMM d')}</span>
                        <button onClick={() => setOverflowDay(null)} aria-label="Close">×</button>
                      </div>
                      {daySingles.slice(MAX_PILLS).map(ev => renderPill(ev, undefined, () => setOverflowDay(null)))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Horizontal rule at the bottom of the spans zone */}
          {laneCount > 0 && (
            <div className={styles['spansEdge']} style={{ top: spansHeight }} aria-hidden="true" />
          )}

          {/* Multi-day spanning bars — absolutely overlaid at the top of the cells */}
          {laneCount > 0 && (
            <div
              className={styles['spansLayer']}
              style={{ top: 0, height: spansHeight }}
              ref={spansRef}
              onPointerMove={handleSpanPointerMove}
              onPointerUp={handleSpanPointerUp}
              onPointerCancel={() => { spanDragRef.current = null; setSpanGhost(null); }}
            >
              {spans
                .filter(s => s.lane < MAX_SPANS_VISIBLE)
                .map(({ ev, startCol, endCol, lane, continuesBefore, continuesAfter }) => {
                  const color = resolveColor(ev as never, ctx?.colorRules);
                  const isConflicting = !!ctx?.conflictingEventIds?.has(ev.id);
                  const statusClass = ev.status === 'cancelled' ? styles['cancelled']
                    : ev.status === 'tentative' ? styles['tentative'] : '';
                  const isDimmed = spanGhost?.ev?.id === ev.id;
                  return (
                    <button
                      key={ev.id}
                      className={[
                        styles['spanBar'],
                        continuesBefore && styles['continuesBefore'],
                        continuesAfter  && styles['continuesAfter'],
                        statusClass,
                        isDimmed && styles['dragging'],
                      ].filter(Boolean).join(' ')}
                      data-wc-conflicting={isConflicting ? 'true' : undefined}
                      style={{
                        '--ev-color': color,
                        left:   `${(startCol / 7) * 100}%`,
                        width:  `${((endCol - startCol + 1) / 7) * 100}%`,
                        top:    lane * (SPAN_H + SPAN_GAP),
                        height: SPAN_H,
                      }}
                      onClick={e => { e.stopPropagation(); }}
                      onPointerDown={e => startSpanDrag(ev, e, startCol, endCol)}
                      aria-label={`${ev.title}${ev.category ? `, ${ev.category}` : ''}${continuesBefore ? ', continues from previous week' : ''}${continuesAfter ? ', continues next week' : ''}`}
                    >
                      {!continuesBefore && (
                        <>
                          <EventStatusBadge lifecycle={(ev as { lifecycle?: unknown }).lifecycle as never} variant="compact" />
                          {ev.title}
                        </>
                      )}
                    </button>
                  );
                })}

              {/* Drag ghost */}
              {spanGhost && (
                <div
                  className={[styles['spanBar'], styles['spanGhost']].join(' ')}
                  aria-hidden="true"
                  style={{
                    '--ev-color': resolveColor(spanGhost.ev as never, ctx?.colorRules),
                    left:   `${(spanGhost.startCol / 7) * 100}%`,
                    width:  `${((spanGhost.endCol - spanGhost.startCol + 1) / 7) * 100}%`,
                    top:    0,
                    height: SPAN_H,
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
