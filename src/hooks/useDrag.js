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
 *   // on event pointerdown:
 *   drag.startMove(ev, e, gridRef.current, days, GUTTER_W);
 *   drag.startResize(ev, e, gridRef.current, days, GUTTER_W);
 *
 *   // on grid pointermove / pointerup / pointercancel:
 *   drag.onPointerMove(e);
 *   const result = drag.onPointerUp();   // { ev, newStart, newEnd } | null
 *   drag.cancel();
 *
 *   // render: drag.ghost => { ev, start, end } | null
 *   // render: drag.draggedId => id of the event being dragged (render dimmed)
 */
import { useRef, useState, useCallback } from 'react';
import { getHours, getMinutes, isSameDay, startOfDay } from 'date-fns';

const SNAP_MIN = 15;   // snap to 15-minute increments
const MIN_DRAG_PX = 4; // pixels of movement before we treat it as a drag not a click

function snap(minutes) {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function dateFromDayAndMinutes(day, minutes) {
  const d = new Date(startOfDay(day).getTime());
  d.setMinutes(minutes);
  return d;
}

export function useDrag({ pxPerHour, dayStart, dayEnd }) {
  // ghost is what gets rendered: null or { ev, start, end }
  const ghostRef   = useRef(null);
  const [ghost, setDisplayGhost] = useState(null);

  // mutable drag state — stored in a ref so pointer handlers never go stale
  const s = useRef(null);

  function updateGhost(next) {
    ghostRef.current = next;
    setDisplayGhost(prev => {
      if (!next && !prev) return prev;
      if (!next) return null;
      if (!prev) return next;
      if (
        prev.start.getTime() === next.start.getTime() &&
        prev.end.getTime()   === next.end.getTime()
      ) return prev; // same snap position — skip re-render
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
      type:        'move',
      ev,
      days,
      gutterWidth,
      colWidth,
      offsetY:     relY - eventTopPx,
      durationMs:  ev.end.getTime() - ev.start.getTime(),
      startClientY: e.clientY,
      startClientX: e.clientX,
      moved:       false,
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

  // ── onPointerMove ──────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e, gridEl) => {
    if (!s.current) return;

    const dx = Math.abs(e.clientX - s.current.startClientX);
    const dy = Math.abs(e.clientY - s.current.startClientY);
    if (dx > MIN_DRAG_PX || dy > MIN_DRAG_PX) s.current.moved = true;
    if (!s.current.moved) return;

    const rect   = gridEl.getBoundingClientRect();
    const relY   = e.clientY - rect.top;
    const relX   = e.clientX - rect.left;
    const { type, ev, days, gutterWidth, colWidth } = s.current;

    if (type === 'move') {
      const snappedStartMin = yToMinutes(relY - s.current.offsetY);
      const colIdx    = clamp(Math.floor((relX - gutterWidth) / colWidth), 0, days.length - 1);
      const targetDay = days[colIdx];
      const newStart  = dateFromDayAndMinutes(targetDay, snappedStartMin);
      const newEnd    = new Date(newStart.getTime() + s.current.durationMs);
      updateGhost({ ev, start: newStart, end: newEnd });
    } else {
      // resize
      const snappedEndMin = yToMinutes(relY);
      const clampedEnd    = Math.max(s.current.startMin + SNAP_MIN, snappedEndMin);
      const targetDay     = days[s.current.dayIndex];
      const newEnd        = dateFromDayAndMinutes(targetDay, clampedEnd);
      updateGhost({ ev, start: ev.start, end: newEnd });
    }
  }, [pxPerHour, dayStart, dayEnd]);

  // ── onPointerUp ───────────────────────────────────────────────────────────
  // Returns { ev, newStart, newEnd } if the event was actually moved, else null.
  const onPointerUp = useCallback(() => {
    const drag        = s.current;
    const finalGhost  = ghostRef.current;
    s.current         = null;
    ghostRef.current  = null;
    setDisplayGhost(null);

    if (!drag || !finalGhost || !drag.moved) return null;

    const startMoved = finalGhost.start.getTime() !== drag.ev.start.getTime();
    const endMoved   = finalGhost.end.getTime()   !== drag.ev.end.getTime();
    if (!startMoved && !endMoved) return null;

    return { ev: drag.ev, newStart: finalGhost.start, newEnd: finalGhost.end };
  }, []);

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    s.current        = null;
    ghostRef.current = null;
    setDisplayGhost(null);
  }, []);

  return {
    ghost,                        // render this as the drag preview
    draggedId: ghost?.ev?.id ?? null,  // dim the source event while dragging
    startMove,
    startResize,
    onPointerMove,
    onPointerUp,
    cancel,
  };
}
