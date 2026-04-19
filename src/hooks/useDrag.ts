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

const SNAP_MIN    = 15;
const MIN_DRAG_PX = 4;

function snap(m) { return Math.round(m / SNAP_MIN) * SNAP_MIN; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Build a Date from a day + total minutes-from-midnight. */
function dateFromDayAndMinutes(day, minutes) {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes); // JS auto-overflows into hours
  return d;
}

export function useDrag({ pxPerHour, dayStart, dayEnd }) {
  const ghostRef = useRef(null);
  const [ghost, setDisplayGhost] = useState(null);
  const s = useRef(null); // mutable drag state

  function updateGhost(next) {
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

  function yToMinutes(relY) {
    return clamp(
      snap((relY / pxPerHour) * 60 + dayStart * 60),
      dayStart * 60,
      dayEnd * 60 - SNAP_MIN,   // last reachable snap = e.g. 21:45 when dayEnd=22
    );
  }

  // ── startMove ─────────────────────────────────────────────────────────────
  const startMove = useCallback((ev, e, gridEl, days, gutterWidth) => {
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
  const startResize = useCallback((ev, e, gridEl, days, gutterWidth) => {
    e.preventDefault();
    e.stopPropagation();
    const rect     = gridEl.getBoundingClientRect();
    const colWidth = (rect.width - gutterWidth) / days.length;
    const dayIndex = Math.max(0, days.findIndex(d => isSameDay(d, ev.start)));
    s.current = {
      type: 'resize', ev, gridEl, days, gutterWidth, colWidth, dayIndex,
      startMin:     getHours(ev.start) * 60 + getMinutes(ev.start),
      startClientY: e.clientY, startClientX: e.clientX, moved: false,
    };
    gridEl.setPointerCapture(e.pointerId);
    updateGhost({ ev, start: ev.start, end: ev.end });
  }, []);

  // ── startResizeTop (top edge — start time) ────────────────────────────────
  const startResizeTop = useCallback((ev, e, gridEl, days, gutterWidth) => {
    e.preventDefault();
    e.stopPropagation();
    const rect     = gridEl.getBoundingClientRect();
    const colWidth = (rect.width - gutterWidth) / days.length;
    const dayIndex = Math.max(0, days.findIndex(d => isSameDay(d, ev.start)));
    s.current = {
      type: 'resize-top', ev, gridEl, days, gutterWidth, colWidth, dayIndex,
      endMin:       getHours(ev.end) * 60 + getMinutes(ev.end),
      startClientY: e.clientY, startClientX: e.clientX, moved: false,
    };
    gridEl.setPointerCapture(e.pointerId);
    updateGhost({ ev, start: ev.start, end: ev.end });
  }, []);

  // ── startCreate (pointer-down on empty grid area) ─────────────────────────
  const startCreate = useCallback((e, gridEl, days, gutterWidth) => {
    if (e.button !== 0) return;
    const rect     = gridEl.getBoundingClientRect();
    const colWidth = (rect.width - gutterWidth) / days.length;
    const relY     = e.clientY - rect.top;
    const relX     = e.clientX - rect.left;
    const colIdx   = clamp(Math.floor((relX - gutterWidth) / colWidth), 0, days.length - 1);
    const anchorDay = days[colIdx];
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
  const onPointerMove = useCallback((e) => {
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
      const snappedStart = yToMinutes(relY - s.current.offsetY);
      const colIdx    = clamp(Math.floor((relX - gutterWidth) / colWidth), 0, days.length - 1);
      const targetDay = days[colIdx];
      const newStart  = dateFromDayAndMinutes(targetDay, snappedStart);
      const newEnd    = new Date(newStart.getTime() + s.current.durationMs);
      updateGhost({ ev, start: newStart, end: newEnd });

    } else if (type === 'resize') {
      const snappedEnd = yToMinutes(relY);
      const clamped    = Math.max(s.current.startMin + SNAP_MIN, snappedEnd);
      const newEnd     = dateFromDayAndMinutes(days[s.current.dayIndex], clamped);
      updateGhost({ ev, start: ev.start, end: newEnd });

    } else if (type === 'resize-top') {
      const snappedStart = yToMinutes(relY);
      const clamped      = Math.min(s.current.endMin - SNAP_MIN, snappedStart);
      const newStart     = dateFromDayAndMinutes(days[s.current.dayIndex], clamped);
      updateGhost({ ev, start: newStart, end: ev.end });

    } else if (type === 'create') {
      const currentMin = yToMinutes(relY);
      const rawStart   = Math.min(s.current.anchorMin, currentMin);
      const rawEnd     = Math.max(s.current.anchorMin + SNAP_MIN, currentMin);
      const newStart   = dateFromDayAndMinutes(s.current.anchorDay, rawStart);
      const newEnd     = dateFromDayAndMinutes(s.current.anchorDay, rawEnd);
      updateGhost({ ev: null, start: newStart, end: newEnd });
    }
  }, [pxPerHour, dayStart, dayEnd]);

  // ── onPointerUp ───────────────────────────────────────────────────────────
  const onPointerUp = useCallback(() => {
    const drag       = s.current;
    const finalGhost = ghostRef.current;
    s.current        = null;
    ghostRef.current = null;
    setDisplayGhost(null);

    if (!drag || !finalGhost || !drag.moved) return null;

    if (drag.type === 'create') {
      return { type: 'create', ev: null, newStart: finalGhost.start, newEnd: finalGhost.end };
    }

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
