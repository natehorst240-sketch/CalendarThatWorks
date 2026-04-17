import { useRef, useCallback, useEffect } from 'react';

/**
 * useTouchDnd — long-press touch drag with elementFromPoint hit-testing.
 *
 * HTML5 drag-and-drop fires no events on touch devices, so views that want
 * cross-group DnD on mobile need a parallel touch pathway.  This hook runs
 * that pathway without fighting the browser's scroll gesture:
 *
 *   1. touchstart arms a long-press timer (default 300ms).
 *   2. Movement before the timer fires cancels the gesture (scroll intent).
 *   3. After long-press, we enter drag mode: preventDefault on subsequent
 *      touchmoves, hit-test via document.elementFromPoint, and call
 *      onOver / onDrop with the matching drop element.
 *
 * Drop targets are any DOM node carrying the configured attribute
 * (default: `data-wc-drop`).  The hook is stateless wrt the calling view —
 * pass in onStart / onOver / onDrop / onCancel callbacks and wire the
 * returned `onTouchStart(e, payload)` to your drag sources.
 */
export function useTouchDnd({
  enabled       = true,
  longPressMs   = 300,
  moveThreshold = 10,
  dropAttr      = 'data-wc-drop',
  vibrateMs     = 10,
  onStart,
  onOver,
  onDrop,
  onCancel,
} = {}) {
  const stateRef = useRef(null);

  const cleanup = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    window.removeEventListener('touchmove',   s.handleMove);
    window.removeEventListener('touchend',    s.handleEnd);
    window.removeEventListener('touchcancel', s.handleCancel);
    if (s.prevUserSelect != null) document.body.style.userSelect = s.prevUserSelect;
    stateRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  return useCallback((e, payload) => {
    if (!enabled) return;
    if (stateRef.current) return; // only one gesture at a time
    const touches = e.touches ?? e.nativeEvent?.touches;
    if (!touches || touches.length !== 1) return;
    const touch = touches[0];

    const s = {
      payload,
      startX: touch.clientX,
      startY: touch.clientY,
      dragging: false,
      overEl: null,
      prevUserSelect: null,
      timer: null,
    };

    s.handleMove = (evt) => {
      const list = evt.touches;
      if (!list || list.length !== 1) return;
      const t = list[0];
      const dist = Math.hypot(t.clientX - s.startX, t.clientY - s.startY);

      if (!s.dragging) {
        if (dist > moveThreshold) {
          cleanup();
          onCancel?.(payload);
        }
        return;
      }
      // Drag mode: suppress browser scroll + hit-test.
      if (evt.cancelable) evt.preventDefault();
      const hit    = document.elementFromPoint(t.clientX, t.clientY);
      const dropEl = hit?.closest?.(`[${dropAttr}]`) ?? null;
      if (dropEl !== s.overEl) {
        s.overEl = dropEl;
        onOver?.(dropEl, payload);
      }
    };

    s.handleEnd = (evt) => {
      const wasDragging = s.dragging;
      const overEl = s.overEl;
      if (wasDragging && evt?.cancelable) evt.preventDefault(); // suppress ghost click
      cleanup();
      if (!wasDragging) {
        onCancel?.(payload);
        return;
      }
      onDrop?.(overEl, payload);
    };

    s.handleCancel = () => {
      cleanup();
      onCancel?.(payload);
    };

    stateRef.current = s;
    window.addEventListener('touchmove',   s.handleMove, { passive: false });
    window.addEventListener('touchend',    s.handleEnd,  { passive: false });
    window.addEventListener('touchcancel', s.handleCancel);

    s.timer = setTimeout(() => {
      if (stateRef.current !== s) return;
      s.dragging = true;
      s.timer = null;
      s.prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      if (vibrateMs > 0 && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(vibrateMs); } catch { /* ignore */ }
      }
      const cont = onStart?.(payload);
      if (cont === false) {
        cleanup();
        onCancel?.(payload);
      }
    }, longPressMs);
  }, [enabled, longPressMs, moveThreshold, dropAttr, vibrateMs, cleanup, onStart, onOver, onDrop, onCancel]);
}
