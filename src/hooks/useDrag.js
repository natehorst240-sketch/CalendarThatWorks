/**
 * useDrag — pointer-event drag state machine for time-grid views.
 *
 * Supports:
 *   • drag-to-move  — drag an event to a new time / day column
 *   • drag-to-resize — drag the bottom handle to change end time
 *
 * Usage (WeekView / DayView):
 *
 *   const drag = useDrag({ pxPerHour, dayStart, dayEnd });
 *
 *   // on event pointerdown — pass the grid element once here:
 *   drag.startMove(ev, e, gridRef.current, days, GUTTER_W);
 *   drag.startResize(ev, e, gridRef.current, days, GUTTER_W);
 *
 *   // on grid pointermove / pointerup / pointercancel (no gridEl needed):
 *   drag.onPointerMove(e);
 *   const result = drag.onPointerUp();
 *     // => { ev, newStart, newEnd, type: 'move'|'resize' } | null
 *   drag.cancel();
 *
 *   // render: drag.ghost => { ev, start, end } | null
 *   // render: drag.draggedId => id of the event being dragged (render dimmed)
 */
import { useRef, useState, useCallback } from 'react';
import { getHours, getMinutes, isSameDay } from 'date-fns';

const SNAP_MIN    = 15; // snap to 15-minute increments
const MIN_DRAG_PX = 4;  // pixels of movement before treating as a drag (not a click)

function snap(minutes) {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Build a Date from a day + total minutes-from-midnight (may overflow hours). */
function dateFromDayAndMinutes(day, minutes) {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0); // zero the time first so setMinutes is unambiguous
  d.setMinutes(minutes);   // JS auto-overflows into hours correctly
  return d;
}

export function useDrag({ pxPerHour, dayStart, dayEnd }) {
  // ghost drives rendering — null or { ev, start, end }
  const ghostRef = useRef(null);
  const [ghost, setDisplayGhost] = useState(null);

  // mutable drag state — ref to avoid stale closures in pointer handlers
  const s = useRef(null);

  function updateGhost(next) {
    ghostRef.current = next;
    setDisplayGhost(prev => {
      if (!next && !prev) return prev;
      if (!next) return null;
      if (!prev) return next;
      // Skip re-render when snapped position has not changed
      if (
        prev.start.getTime() === next.start.getTime() &&
        prev.end.getTime()   === next.end.getTime()
      ) return prev;
      return next;
    });
  }

  function yToMinutes(relY) {
    const raw = (relY / pxPerHour) * 60 + dayStart * 60;
    return clamp(snap(raw), dayStart * 60, (dayEnd - 1) * 60);
  }

  // ── startMove ─────────────────────────────────────────────────────────────
  const startMove = useCallback((ev, e, gridEl, days, gutterWidth) => {
    e.preventDefault();
    e.stopPropagation();

    const rect       = gridEl.getBoundingClientRect();
    const startMin   = getHours(ev.start) * 60 + getMinutes(ev.start);
    const eventTopPx = (startMin - dayStart * 60) / 60 * pxPerHour;
    const relY       = e.clientY - rect.top;
    const colWidth   = (rect.width - gutterWidth) / days.length;

    s.current = {
      type:         'move',
      ev,
      gridEl,       // stored so onPointerMove doesn't need it as an arg
      days,
      gutterWidth,
      colWidth,
      offsetY:      relY - eventTopPx,
      durationMs:   ev.end.getTime() - ev.start.getTime(),
      startClientY: e.clientY,
      startClientX: e.clientX,
      moved:        false,
    };

    gridEl.setPointerCapture(e.pointerId);
    updateGhost({ ev, start: ev.start, end: ev.end });
  }, [pxPerHour, dayStart]);

  // ── startResize ───────────────────────────────────────────────────────────
  const startResize = useCallback((ev, e, gridEl, days, gutterWidth) => {
    e.preventDefault();
    e.stopPropagation();

    const rect     = gridEl.getBoundingClientRect();
    const colWidth = (rect.width - gutterWidth) / days.length;
    const dayIndex = Math.max(0, days.findIndex(d => isSameDay(d, ev.start)));

    s.current = {
      type:         'resize',
      ev,
      gridEl,       // stored so onPointerMove doesn't need it as an arg
      days,
      gutterWidth,
      colWidth,
      dayIndex,
      startMin:     getHours(ev.start) * 60 + getMinutes(ev.start),
      startClientY: e.clientY,
      startClientX: e.clientX,
      moved:        false,
    };

    gridEl.setPointerCapture(e.pointerId);
    updateGhost({ ev, start: ev.start, end: ev.end });
  }, []);

  // ── onPointerMove — no gridEl arg; uses stored s.current.gridEl ──────────
  const onPointerMove = useCallback((e) => {
    if (!s.current) return;

    const dx = Math.abs(e.clientX - s.current.startClientX);
    const dy = Math.abs(e.clientY - s.current.startClientY);
    if (dx > MIN_DRAG_PX || dy > MIN_DRAG_PX) s.current.moved = true;
    if (!s.current.moved) return;

    const { gridEl, type, ev, days, gutterWidth, colWidth } = s.current;
    const rect = gridEl.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const relX = e.clientX - rect.left;

    if (type === 'move') {
      const snappedStartMin = yToMinutes(relY - s.current.offsetY);
      const colIdx    = clamp(Math.floor((relX - gutterWidth) / colWidth), 0, days.length - 1);
      const targetDay = days[colIdx];
      const newStart  = dateFromDayAndMinutes(targetDay, snappedStartMin);
      const newEnd    = new Date(newStart.getTime() + s.current.durationMs);
      updateGhost({ ev, start: newStart, end: newEnd });
    } else {
      // resize: only end time changes
      const snappedEndMin = yToMinutes(relY);
      const clampedEnd    = Math.max(s.current.startMin + SNAP_MIN, snappedEndMin);
      const targetDay     = days[s.current.dayIndex];
      const newEnd        = dateFromDayAndMinutes(targetDay, clampedEnd);
      updateGhost({ ev, start: ev.start, end: newEnd });
    }
  }, [pxPerHour, dayStart, dayEnd]);

  // ── onPointerUp ───────────────────────────────────────────────────────────
  // Returns { ev, newStart, newEnd, type } if the event moved/resized, else null.
  const onPointerUp = useCallback(() => {
    const drag       = s.current;
    const finalGhost = ghostRef.current;
    s.current        = null;
    ghostRef.current = null;
    setDisplayGhost(null);

    if (!drag || !finalGhost || !drag.moved) return null;

    const startMoved = finalGhost.start.getTime() !== drag.ev.start.getTime();
    const endMoved   = finalGhost.end.getTime()   !== drag.ev.end.getTime();
    if (!startMoved && !endMoved) return null;

    return {
      ev:       drag.ev,
      newStart: finalGhost.start,
      newEnd:   finalGhost.end,
      type:     drag.type, // 'move' | 'resize'
    };
  }, []);

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    s.current        = null;
    ghostRef.current = null;
    setDisplayGhost(null);
  }, []);

  return {
    ghost,                              // render this as the drag preview
    draggedId: ghost?.ev?.id ?? null,  // dim the source event while dragging
    startMove,
    startResize,
    onPointerMove,  // signature: (e) — gridEl stored internally
    onPointerUp,    // signature: () => result | null
    cancel,
  };
}
