import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useRef } from 'react';
import { useTouchSwipe } from '../useTouchSwipe.js';

function Harness({ enabled = true, onSwipeLeft, onSwipeRight }) {
  const ref = useRef(null);
  useTouchSwipe({ targetRef: ref, enabled, onSwipeLeft, onSwipeRight, minDistance: 40 });
  return <div ref={ref} data-testid="swipe-target">Swipe target</div>;
}

function dispatchSwipe(el, { startX, startY, endX, endY }) {
  const touchstart = new Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(touchstart, 'touches', {
    value: [{ clientX: startX, clientY: startY, target: el }],
  });
  el.dispatchEvent(touchstart);

  const touchend = new Event('touchend', { bubbles: true, cancelable: true });
  Object.defineProperty(touchend, 'changedTouches', {
    value: [{ clientX: endX, clientY: endY, target: el }],
  });
  el.dispatchEvent(touchend);
}

describe('useTouchSwipe', () => {
  it('calls onSwipeLeft for a horizontal left swipe', () => {
    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(<Harness onSwipeLeft={onSwipeLeft} onSwipeRight={vi.fn()} />);
    const target = getByTestId('swipe-target');

    dispatchSwipe(target, { startX: 220, startY: 90, endX: 140, endY: 96 });
    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it('calls onSwipeRight for a horizontal right swipe', () => {
    const onSwipeRight = vi.fn();
    const { getByTestId } = render(<Harness onSwipeLeft={vi.fn()} onSwipeRight={onSwipeRight} />);
    const target = getByTestId('swipe-target');

    dispatchSwipe(target, { startX: 90, startY: 150, endX: 160, endY: 146 });
    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it('ignores mostly-vertical gestures', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { getByTestId } = render(<Harness onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />);
    const target = getByTestId('swipe-target');

    dispatchSwipe(target, { startX: 140, startY: 40, endX: 150, endY: 170 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(<Harness enabled={false} onSwipeLeft={onSwipeLeft} onSwipeRight={vi.fn()} />);
    const target = getByTestId('swipe-target');

    dispatchSwipe(target, { startX: 200, startY: 100, endX: 100, endY: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
