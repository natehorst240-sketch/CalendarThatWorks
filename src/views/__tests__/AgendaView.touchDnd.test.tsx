import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import AgendaView from '../AgendaView';
import { CalendarContext } from '../../core/CalendarContext';

const sameDay = new Date(2026, 3, 5);
const currentDate = new Date(2026, 3, 1);

const events = [
  { id: 'e1', title: 'Morning Run',  category: 'Exercise', start: sameDay, end: sameDay, allDay: true },
  { id: 'e2', title: 'Team Meeting', category: 'Work',     start: sameDay, end: sameDay, allDay: true },
];

function renderAgenda(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AgendaView
        currentDate={currentDate}
        events={events}
        onEventClick={vi.fn()}
        groupBy="category"
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

function fireTouch(type, el, touches = []) {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'touches', {
    value: touches.map(t => ({ clientX: t.x, clientY: t.y, target: el })),
  });
  Object.defineProperty(evt, 'changedTouches', {
    value: touches.map(t => ({ clientX: t.x, clientY: t.y, target: el })),
  });
  el.dispatchEvent(evt);
}

describe('AgendaView touch DnD', () => {
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

  it('long-press + move + release onto a different leaf group calls onEventGroupChange', () => {
    const onEventGroupChange = vi.fn();
    renderAgenda({ onEventGroupChange });

    const source = screen.getByRole('button', { name: /Morning Run/i });
    fireTouch('touchstart', source, [{ x: 10, y: 10 }]);
    act(() => { vi.advanceTimersByTime(300); });

    // Hit-test resolves to the "Work" leaf group (drop target).
    const workLeaf = document.querySelector('[data-wc-drop$="/Work"]');
    expect(workLeaf).toBeTruthy();
    pointTarget = workLeaf;

    fireTouch('touchmove', window, [{ x: 200, y: 200 }]);
    fireTouch('touchend',  window, [{ x: 200, y: 200 }]);

    expect(onEventGroupChange).toHaveBeenCalledTimes(1);
    const [ev, patch] = onEventGroupChange.mock.calls[0];
    expect(ev.id).toBe('e1');
    expect(patch).toEqual({ category: 'Work' });
  });

  it('dropping onto the source leaf group does not fire the callback', () => {
    const onEventGroupChange = vi.fn();
    renderAgenda({ onEventGroupChange });

    const source = screen.getByRole('button', { name: /Morning Run/i });
    fireTouch('touchstart', source, [{ x: 10, y: 10 }]);
    act(() => { vi.advanceTimersByTime(300); });

    const exerciseLeaf = document.querySelector('[data-wc-drop$="/Exercise"]');
    pointTarget = exerciseLeaf;

    fireTouch('touchmove', window, [{ x: 40, y: 40 }]);
    fireTouch('touchend',  window, [{ x: 40, y: 40 }]);

    expect(onEventGroupChange).not.toHaveBeenCalled();
  });

  it('movement before long-press cancels the gesture (scroll intent)', () => {
    const onEventGroupChange = vi.fn();
    renderAgenda({ onEventGroupChange });

    const source = screen.getByRole('button', { name: /Morning Run/i });
    fireTouch('touchstart', source, [{ x: 10, y: 10 }]);
    fireTouch('touchmove',  window, [{ x: 10, y: 120 }]); // vertical scroll

    act(() => { vi.advanceTimersByTime(300); });

    const workLeaf = document.querySelector('[data-wc-drop$="/Work"]');
    pointTarget = workLeaf;
    fireTouch('touchend', window, [{ x: 10, y: 120 }]);

    expect(onEventGroupChange).not.toHaveBeenCalled();
  });

  it('events are not draggable on touch when onEventGroupChange is absent', () => {
    renderAgenda();
    const source = screen.getByRole('button', { name: /Morning Run/i });
    fireTouch('touchstart', source, [{ x: 10, y: 10 }]);
    act(() => { vi.advanceTimersByTime(300); });

    // No drop targets in DOM → no callback possible, no state to assert —
    // the test is that no error is thrown and the gesture is inert.
    const leaves = document.querySelectorAll('[data-wc-drop]');
    expect(leaves.length).toBe(0);
  });
});
