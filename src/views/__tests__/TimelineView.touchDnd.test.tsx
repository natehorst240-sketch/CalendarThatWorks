import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import TimelineView from '../TimelineView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1);
const shiftStart  = new Date(2026, 3, 5, 9);
const shiftEnd    = new Date(2026, 3, 5, 17);

const employees = [
  { id: 'nurse-1', name: 'Alice Chen', role: 'Nurse'  },
  { id: 'nurse-2', name: 'Bob Smith',  role: 'Nurse'  },
  { id: 'doc-1',   name: 'Carol Jones', role: 'Doctor' },
];

const evts = [
  { id: 'shift-1', title: 'Alice Shift', start: shiftStart, end: shiftEnd, resource: 'nurse-1' },
];

function renderTimeline(props: Record<string, unknown> = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <TimelineView
        currentDate={currentDate}
        events={evts}
        employees={employees}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

function fireTouch(type: string, el: EventTarget, touches: Array<{ x: number; y: number }> = []) {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'touches', {
    value: touches.map(t => ({ clientX: t.x, clientY: t.y, target: el })),
  });
  Object.defineProperty(evt, 'changedTouches', {
    value: touches.map(t => ({ clientX: t.x, clientY: t.y, target: el })),
  });
  el.dispatchEvent(evt);
}

describe('TimelineView touch DnD', () => {
  let origElementFromPoint: typeof document.elementFromPoint;
  let pointTarget: Element | null = null;

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

  it('long-press on event + release on another row calls onEventGroupChange with patch', () => {
    const onEventGroupChange = vi.fn();
    renderTimeline({ onEventGroupChange });

    const source = screen.getByRole('button', { name: /Alice Shift/i });
    fireTouch('touchstart', source, [{ x: 10, y: 10 }]);
    act(() => { vi.advanceTimersByTime(300); });

    // Bob Smith's row is the drop target.
    const bobRow = screen.getByRole('rowheader', { name: 'Bob Smith' }).closest('[data-wc-drop]');
    expect(bobRow).toBeTruthy();
    pointTarget = bobRow;

    fireTouch('touchmove', window, [{ x: 100, y: 200 }]);
    fireTouch('touchend',  window, [{ x: 100, y: 200 }]);

    expect(onEventGroupChange).toHaveBeenCalledTimes(1);
    const [ev, patch] = onEventGroupChange.mock.calls[0];
    expect(ev.id).toBe('shift-1');
    expect(patch).toEqual({ resource: 'nurse-2' });
  });

  it('dropping onto the source row does not fire onEventGroupChange', () => {
    const onEventGroupChange = vi.fn();
    renderTimeline({ onEventGroupChange });

    const source = screen.getByRole('button', { name: /Alice Shift/i });
    fireTouch('touchstart', source, [{ x: 10, y: 10 }]);
    act(() => { vi.advanceTimersByTime(300); });

    const aliceRow = screen.getByRole('rowheader', { name: 'Alice Chen' }).closest('[data-wc-drop]');
    pointTarget = aliceRow;

    fireTouch('touchmove', window, [{ x: 20, y: 30 }]);
    fireTouch('touchend',  window, [{ x: 20, y: 30 }]);

    expect(onEventGroupChange).not.toHaveBeenCalled();
  });

  it('rows lack data-wc-drop when onEventGroupChange is absent', () => {
    renderTimeline();
    const aliceRow = screen.getByRole('rowheader', { name: 'Alice Chen' }).closest('[role="row"]');
    expect(aliceRow.hasAttribute('data-wc-drop')).toBe(false);
  });
});
