/**
 * useDrag — pointer-event drag state machine for time-grid views.
 *
 * Modes:
 *   'move'         — drag event to new time / day column
 *   'resize'       — drag bottom handle, changes end time
 *   'resize-top'   — drag top handle, changes start time
 *   'create'       — drag on empty grid area to create a new event
 *
 * Usage:
 *   const drag = useDrag({ pxPerHour, dayStart, dayEnd });
 *
 *   drag.startMove(ev, e, gridEl, days, gutterWidth)
 *   drag.startResize(ev, e, gridEl, days, gutterWidth)
 *   drag.startResizeTop(ev, e, gridEl, days, gutterWidth)
 *   drag.startCreate(e, gridEl, days, gutterWidth)   ← call from grid onPointerDown
 *
 *   drag.onPointerMove(e)
 *   const result = drag.onPointerUp()
 *     // move | resize | resize-top → { ev, newStart, newEnd, type }
 *     // create                     → { ev: null, newStart, newEnd, type: 'create' }
 *     // click / no movement        → null
 *   drag.cancel()
 *
 *   drag.ghost      — { ev, start, end } | null  (ev is null for 'create')
 *   drag.draggedId  — id of source event while dragging (null for create)
 */
import { useRef, useState, useCallback } from 'react';
import { getHours, getMinutes, isSameDay } from 'date-fns';
import type { NormalizedEvent } from '../types/events';

const SNAP_MIN    = 15;
const MIN_DRAG_PX = 4;

type DragEventBase = {
  id?: string | number | undefined;
  start: Date;
  end: Date;
  _numCols?: number | undefined;
  _col?: number | undefined;
};
type DragGhost<TEvent extends DragEventBase> = { ev: TEvent | null; start: Date; end: Date } | null;
type DragMode = 'move' | 'resize' | 'resize-top' | 'create';
type DragResult<TEvent extends DragEventBase> =
  | { type: 'create'; ev: null; newStart: Date; newEnd: Date }
  | { type: Exclude<DragMode, 'create'>; ev: TEvent; newStart: Date; newEnd: Date };
type DragPointer = {
  clientX: number;
  clientY: number;
  button: number;
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
};
type DragGridElement = {
  getBoundingClientRect(): { top: number; left: number; width: number };
  setPointerCapture(pointerId: number): void;
};
type DragState<TEvent extends DragEventBase> = {
  type: DragMode;
  ev: TEvent | null;
  gridEl: DragGridElement;
  days: Date[];
  gutterWidth: number;
  colWidth: number;
  startClientY: number;
  startClientX: number;
  moved: boolean;
  offsetY?: number;
  durationMs?: number;
  dayIndex?: number;
  startMin?: number;
  endMin?: number;
  anchorMin?: number;
  anchorDay?: Date;
};

function snap(m: number) { return Math.round(m / SNAP_MIN) * SNAP_MIN; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** Build a Date from a day + total minutes-from-midnight. */
function dateFromDayAndMinutes(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes); // JS auto-overflows into hours
  return d;
}

export function useDrag<TEvent extends DragEventBase = NormalizedEvent>(
  { pxPerHour, dayStart, dayEnd }: { pxPerHour: number; dayStart: number; dayEnd: number },
): {
  ghost: DragGhost<TEvent>;
  draggedId: TEvent['id'] | null;
  startMove: (ev: TEvent, e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => void;
  startResize: (ev: TEvent, e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => void;
  startResizeTop: (ev: TEvent, e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => void;
  startCreate: (e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => void;
  onPointerMove: (e: DragPointer) => void;
  onPointerUp: () => DragResult<TEvent> | null;
  cancel: () => void;
} {
  const ghostRef = useRef<DragGhost<TEvent>>(null);
  const [ghost, setDisplayGhost] = useState<DragGhost<TEvent>>(null);
  const s = useRef<DragState<TEvent> | null>(null); // mutable drag state

  function updateGhost(next: DragGhost<TEvent>): void {
    ghostRef.current = next;
    setDisplayGhost(prev => {
      if (!next && !prev) return prev;
      if (!next) return null;
      if (!prev) return next;
      if (
        prev.start.getTime() === next.start.getTime() &&
        prev.end.getTime()   === next.end.getTime()
      ) return prev; // same snapped position — skip re-render
      return next;
    });
  }

  function yToMinutes(relY: number): number {
    return clamp(
      snap((relY / pxPerHour) * 60 + dayStart * 60),
      dayStart * 60,
      dayEnd * 60 - SNAP_MIN,   // last reachable snap = e.g. 21:45 when dayEnd=22
    );
  }

  // ── startMove ─────────────────────────────────────────────────────────────
  const startMove = useCallback((ev: TEvent, e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect       = gridEl.getBoundingClientRect();
    const startMin   = getHours(ev.start) * 60 + getMinutes(ev.start);
    const eventTopPx = (startMin - dayStart * 60) / 60 * pxPerHour;
    const colWidth   = (rect.width - gutterWidth) / days.length;
    s.current = {
      type: 'move', ev, gridEl, days, gutterWidth, colWidth,
      offsetY:      e.clientY - rect.top - eventTopPx,
      durationMs:   ev.end.getTime() - ev.start.getTime(),
      startClientY: e.clientY, startClientX: e.clientX, moved: false,
    };
    gridEl.setPointerCapture(e.pointerId);
    updateGhost({ ev, start: ev.start, end: ev.end });
  }, [pxPerHour, dayStart]);

  // ── startResize (bottom edge — end time) ──────────────────────────────────
  const startResize = useCallback((ev: TEvent, e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect     = gridEl.getBoundingClientRect();
    const colWidth = (rect.width - gutterWidth) / days.length;
    const dayIndex = Math.max(0, days.findIndex((d: Date) => isSameDay(d, ev.start)));
    s.current = {
      type: 'resize', ev, gridEl, days, gutterWidth, colWidth, dayIndex,
      startMin:     getHours(ev.start) * 60 + getMinutes(ev.start),
      startClientY: e.clientY, startClientX: e.clientX, moved: false,
    };
    gridEl.setPointerCapture(e.pointerId);
    updateGhost({ ev, start: ev.start, end: ev.end });
  }, []);

  // ── startResizeTop (top edge — start time) ────────────────────────────────
  const startResizeTop = useCallback((ev: TEvent, e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect     = gridEl.getBoundingClientRect();
    const colWidth = (rect.width - gutterWidth) / days.length;
    const dayIndex = Math.max(0, days.findIndex((d: Date) => isSameDay(d, ev.start)));
    s.current = {
      type: 'resize-top', ev, gridEl, days, gutterWidth, colWidth, dayIndex,
      endMin:       getHours(ev.end) * 60 + getMinutes(ev.end),
      startClientY: e.clientY, startClientX: e.clientX, moved: false,
    };
    gridEl.setPointerCapture(e.pointerId);
    updateGhost({ ev, start: ev.start, end: ev.end });
  }, []);

  // ── startCreate (pointer-down on empty grid area) ─────────────────────────
  const startCreate = useCallback((e: DragPointer, gridEl: DragGridElement, days: Date[], gutterWidth: number) => {
    if (e.button !== 0) return;
    const rect     = gridEl.getBoundingClientRect();
    const colWidth = (rect.width - gutterWidth) / days.length;
    const relY     = e.clientY - rect.top;
    const relX     = e.clientX - rect.left;
    const colIdx   = clamp(Math.floor((relX - gutterWidth) / colWidth), 0, days.length - 1);
    const anchorDay = days[colIdx];
    if (anchorDay === undefined) return;
    const anchorMin = yToMinutes(relY);
    s.current = {
      type: 'create', ev: null, gridEl, days, gutterWidth, colWidth,
      anchorMin, anchorDay,
      startClientY: e.clientY, startClientX: e.clientX, moved: false,
    };
    gridEl.setPointerCapture(e.pointerId);
    const start = dateFromDayAndMinutes(anchorDay, anchorMin);
    const end   = dateFromDayAndMinutes(anchorDay, anchorMin + SNAP_MIN);
    updateGhost({ ev: null, start, end });
  }, [pxPerHour, dayStart, dayEnd]);

  // ── onPointerMove ─────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e: DragPointer) => {
    if (!s.current) return;

    const dx = Math.abs(e.clientX - s.current.startClientX);
    const dy = Math.abs(e.clientY - s.current.startClientY);
    if (dx > MIN_DRAG_PX || dy > MIN_DRAG_PX) s.current.moved = true;
    if (!s.current.moved) return;

    const { type, ev, gridEl, days, gutterWidth, colWidth } = s.current;
    const rect = gridEl.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const relX = e.clientX - rect.left;

    if (type === 'move') {
      const snappedStart = yToMinutes(relY - (s.current.offsetY ?? 0));
      const colIdx    = clamp(Math.floor((relX - gutterWidth) / colWidth), 0, days.length - 1);
      const targetDay = days[colIdx];
      if (targetDay === undefined) return;
      const newStart  = dateFromDayAndMinutes(targetDay, snappedStart);
      const newEnd    = new Date(newStart.getTime() + (s.current.durationMs ?? 0));
      updateGhost({ ev, start: newStart, end: newEnd });

    } else if (type === 'resize') {
      if (ev === null) return;
      const snappedEnd = yToMinutes(relY);
      const clamped    = Math.max((s.current.startMin ?? 0) + SNAP_MIN, snappedEnd);
      const resizeDay  = days[s.current.dayIndex ?? 0];
      if (resizeDay === undefined) return;
      const newEnd     = dateFromDayAndMinutes(resizeDay, clamped);
      updateGhost({ ev, start: ev.start, end: newEnd });

    } else if (type === 'resize-top') {
      if (ev === null) return;
      const snappedStart = yToMinutes(relY);
      const clamped      = Math.min((s.current.endMin ?? dayEnd * 60) - SNAP_MIN, snappedStart);
      const resizeTopDay = days[s.current.dayIndex ?? 0];
      if (resizeTopDay === undefined) return;
      const newStart     = dateFromDayAndMinutes(resizeTopDay, clamped);
      updateGhost({ ev, start: newStart, end: ev.end });

    } else if (type === 'create') {
      const currentMin = yToMinutes(relY);
      const rawStart   = Math.min(s.current.anchorMin ?? currentMin, currentMin);
      const rawEnd     = Math.max((s.current.anchorMin ?? currentMin) + SNAP_MIN, currentMin);
      const createDay  = s.current.anchorDay ?? days[0];
      if (createDay === undefined) return;
      const newStart   = dateFromDayAndMinutes(createDay, rawStart);
      const newEnd     = dateFromDayAndMinutes(createDay, rawEnd);
      updateGhost({ ev: null, start: newStart, end: newEnd });
    }
  }, [pxPerHour, dayStart, dayEnd]);

  // ── onPointerUp ───────────────────────────────────────────────────────────
  const onPointerUp = useCallback((): DragResult<TEvent> | null => {
    const drag       = s.current;
    const finalGhost = ghostRef.current;
    s.current        = null;
    ghostRef.current = null;
    setDisplayGhost(null);

    if (!drag || !finalGhost || !drag.moved) return null;

    if (drag.type === 'create') {
      return { type: 'create', ev: null, newStart: finalGhost.start, newEnd: finalGhost.end };
    }

    if (!drag.ev) return null;
    const startMoved = finalGhost.start.getTime() !== drag.ev.start.getTime();
    const endMoved   = finalGhost.end.getTime()   !== drag.ev.end.getTime();
    if (!startMoved && !endMoved) return null;

    return {
      type:     drag.type, // 'move' | 'resize' | 'resize-top'
      ev:       drag.ev,
      newStart: finalGhost.start,
      newEnd:   finalGhost.end,
    };
  }, []);

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    s.current        = null;
    ghostRef.current = null;
    setDisplayGhost(null);
  }, []);

  return {
    ghost,
    draggedId: ghost?.ev?.id ?? null, // null for 'create' ghosts
    startMove,
    startResize,
    startResizeTop,
    startCreate,
    onPointerMove,
    onPointerUp,
    cancel,
  };
}
