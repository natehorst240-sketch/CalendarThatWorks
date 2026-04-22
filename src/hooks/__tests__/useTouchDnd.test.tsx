import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTouchDnd } from '../useTouchDnd';

type DndPayload = { id: string };
type DndCallbacks = {
  onStart: (payload: DndPayload) => void;
  onOver: (target: Element | null, payload: DndPayload) => void;
  onDrop: (target: Element | null, payload: DndPayload) => void;
  onCancel: (payload: DndPayload) => void;
};

function Harness({ enabled = true, longPressMs = 300, cbs }: {
  enabled?: boolean;
  longPressMs?: number;
  cbs: DndCallbacks;
}) {
  const onTouchStart = useTouchDnd({
    enabled,
    longPressMs,
    onStart:  cbs.onStart,
    onOver:   cbs.onOver,
    onDrop:   cbs.onDrop,
    onCancel: cbs.onCancel,
  });
  return (
    <div>
      <div
        data-testid="src"
        onTouchStart={e => onTouchStart(e.nativeEvent, { id: 'src-1' })}
      >
        source
      </div>
      <div data-testid="drop-a" data-wc-drop="A">A</div>
      <div data-testid="drop-b" data-wc-drop="B">B</div>
      <div data-testid="outside">outside</div>
    </div>
  );
}

/**
 * Dispatch a touch event with a given touches array via a native Event.
 * happy-dom doesn't build TouchEvent, so we forge the `touches` property.
 */
function fireTouch(
  type: string,
  el: EventTarget,
  touches: Array<{ x: number; y: number }>,
  { cancelable = true }: { cancelable?: boolean } = {},
): Event {
  const evt = new Event(type, { bubbles: true, cancelable });
  Object.defineProperty(evt, 'touches', {
    value: touches.map(t => ({ clientX: t.x, clientY: t.y, target: el })),
  });
  Object.defineProperty(evt, 'changedTouches', {
    value: touches.map(t => ({ clientX: t.x, clientY: t.y, target: el })),
  });
  el.dispatchEvent(evt);
  return evt;
}

describe('useTouchDnd', () => {
  let origElementFromPoint;
  let pointTarget = null;

  beforeEach(() => {
    vi.useFakeTimers();
    origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => pointTarget);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.elementFromPoint = origElementFromPoint;
    pointTarget = null;
  });

  it('fires onStart after long-press completes', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    expect(cbs.onStart).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });
    expect(cbs.onStart).toHaveBeenCalledWith({ id: 'src-1' });
  });

  it('cancels the long-press when movement exceeds threshold before timer fires', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    fireTouch('touchmove', window, [{ x: 120, y: 52 }]);

    act(() => { vi.advanceTimersByTime(300); });
    expect(cbs.onStart).not.toHaveBeenCalled();
    expect(cbs.onCancel).toHaveBeenCalled();
  });

  it('reports onOver when moving over different drop targets in drag mode', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    act(() => { vi.advanceTimersByTime(300); });

    pointTarget = getByTestId('drop-a');
    fireTouch('touchmove', window, [{ x: 100, y: 100 }]);
    expect(cbs.onOver).toHaveBeenLastCalledWith(getByTestId('drop-a'), { id: 'src-1' });

    pointTarget = getByTestId('drop-b');
    fireTouch('touchmove', window, [{ x: 200, y: 200 }]);
    expect(cbs.onOver).toHaveBeenLastCalledWith(getByTestId('drop-b'), { id: 'src-1' });
  });

  it('fires onDrop with the current drop target on touchend', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    act(() => { vi.advanceTimersByTime(300); });

    pointTarget = getByTestId('drop-b');
    fireTouch('touchmove', window, [{ x: 200, y: 200 }]);
    fireTouch('touchend',  window, [{ x: 200, y: 200 }]);

    expect(cbs.onDrop).toHaveBeenCalledWith(getByTestId('drop-b'), { id: 'src-1' });
    expect(cbs.onCancel).not.toHaveBeenCalled();
  });

  it('fires onDrop with null target when released outside any drop zone', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    act(() => { vi.advanceTimersByTime(300); });

    pointTarget = getByTestId('outside');
    fireTouch('touchmove', window, [{ x: 300, y: 300 }]);
    fireTouch('touchend',  window, [{ x: 300, y: 300 }]);

    expect(cbs.onDrop).toHaveBeenCalledWith(null, { id: 'src-1' });
  });

  it('does nothing when disabled', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness enabled={false} cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    act(() => { vi.advanceTimersByTime(300); });
    fireTouch('touchend', window, [{ x: 50, y: 50 }]);

    expect(cbs.onStart).not.toHaveBeenCalled();
    expect(cbs.onDrop).not.toHaveBeenCalled();
    expect(cbs.onCancel).not.toHaveBeenCalled();
  });

  it('ignores multi-touch (pinch/zoom) and fires no callbacks', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }, { x: 150, y: 150 }]);
    act(() => { vi.advanceTimersByTime(300); });

    expect(cbs.onStart).not.toHaveBeenCalled();
    expect(cbs.onCancel).not.toHaveBeenCalled();
  });

  it('cancels cleanly on touchcancel', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    act(() => { vi.advanceTimersByTime(300); });
    fireTouch('touchcancel', window, []);

    expect(cbs.onCancel).toHaveBeenCalled();
    expect(cbs.onDrop).not.toHaveBeenCalled();
  });

  it('tap (release before timer) fires onCancel, not onDrop', () => {
    const cbs = { onStart: vi.fn(), onOver: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { getByTestId } = render(<Harness cbs={cbs} />);

    fireTouch('touchstart', getByTestId('src'), [{ x: 50, y: 50 }]);
    act(() => { vi.advanceTimersByTime(100); });
    fireTouch('touchend', window, [{ x: 52, y: 51 }]);

    expect(cbs.onStart).not.toHaveBeenCalled();
    expect(cbs.onDrop).not.toHaveBeenCalled();
    expect(cbs.onCancel).toHaveBeenCalled();
  });
});
