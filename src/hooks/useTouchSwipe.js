import { useEffect, useRef } from 'react';

const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']);

function isInteractiveElement(node) {
  if (!(node instanceof Element)) return false;
  if (INTERACTIVE_TAGS.has(node.tagName)) return true;
  return node.closest('[contenteditable="true"], [data-no-swipe="true"]') != null;
}

/**
 * useTouchSwipe — lightweight horizontal swipe detection for touch devices.
 *
 * Designed for calendar navigation: swipe left => next range, swipe right => previous.
 * The hook intentionally avoids calling preventDefault so vertical page/view scrolling
 * remains natural on mobile.
 */
export function useTouchSwipe({
  targetRef,
  enabled = true,
  onSwipeLeft,
  onSwipeRight,
  minDistance = 48,
  maxOffAxis = 72,
  maxDurationMs = 700,
}) {
  const gestureRef = useRef(null);

  useEffect(() => {
    const el = targetRef?.current;
    if (!enabled || !el) return undefined;

    const handleTouchStart = (e) => {
      if (e.touches.length !== 1) {
        gestureRef.current = null;
        return;
      }
      if (isInteractiveElement(e.target)) {
        gestureRef.current = null;
        return;
      }
      const touch = e.touches[0];
      gestureRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        ts: Date.now(),
      };
    };

    const handleTouchEnd = (e) => {
      const start = gestureRef.current;
      gestureRef.current = null;
      if (!start || e.changedTouches.length === 0) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const dt = Date.now() - start.ts;

      if (dt > maxDurationMs) return;
      if (Math.abs(dy) > maxOffAxis) return;
      if (Math.abs(dx) < minDistance) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;

      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    };

    const clearGesture = () => {
      gestureRef.current = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', clearGesture, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', clearGesture);
    };
  }, [enabled, maxDurationMs, maxOffAxis, minDistance, onSwipeLeft, onSwipeRight, targetRef]);
}
