/**
 * useDrag regression tests.
 *
 * We test the pure logic of yToMinutes (via startCreate / onPointerMove)
 * without a real DOM by mocking getBoundingClientRect.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDrag } from '../useDrag';

const PX_PER_HOUR = 60; // 60 px = 1 hour  →  1 px = 1 minute
const DAY_START   = 6;
const DAY_END     = 22;
const SNAP_MIN    = 15;

/** Minimal fake grid element whose getBoundingClientRect returns a fixed rect. */
function fakeGrid(top = 0, width = 200, gutterWidth = 0) {
  return {
    getBoundingClientRect: () => ({ top, left: 0, width }),
    setPointerCapture:     () => {},
    releasePointerCapture: () => {},
  };
}

function fakePointer(clientX = 10, clientY) {
  return { clientX, clientY, button: 0, pointerId: 1,
    preventDefault: () => {}, stopPropagation: () => {} };
}

// ── yToMinutes boundary tests ─────────────────────────────────────────────────

describe('useDrag — yToMinutes clamp boundary', () => {
  it('clamps to dayStart * 60 at the top of the grid', () => {
    const { result } = renderHook(() =>
      useDrag({ pxPerHour: PX_PER_HOUR, dayStart: DAY_START, dayEnd: DAY_END }),
    );
    const grid = fakeGrid(0);
    const days = [new Date('2026-04-10')];

    act(() => result.current.startCreate(fakePointer(10, 0), grid, days, 0));
    expect(result.current.ghost?.start.getHours()).toBe(DAY_START);
    expect(result.current.ghost?.start.getMinutes()).toBe(0);
  });

  it('allows the last snapped interval before dayEnd (regression: was truncated to dayEnd-1)', () => {
    const { result } = renderHook(() =>
      useDrag({ pxPerHour: PX_PER_HOUR, dayStart: DAY_START, dayEnd: DAY_END }),
    );
    const grid = fakeGrid(0);
    const days = [new Date('2026-04-10')];

    // Position pointer at the very bottom of the visible grid.
    // With pxPerHour=60 and dayEnd=22, total height = (22-6)*60 = 960 px.
    // Dragging to 960px should reach 21:45 (last SNAP_MIN slot before 22:00),
    // NOT 21:00 (dayEnd-1) as the old clamp produced.
    const gridBottomY = (DAY_END - DAY_START) * PX_PER_HOUR; // 960
    act(() => result.current.startCreate(fakePointer(10, gridBottomY), grid, days, 0));

    const start = result.current.ghost?.start;
    expect(start).toBeDefined();
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    expect(startMinutes).toBe(DAY_END * 60 - SNAP_MIN); // 22*60 - 15 = 1305 = 21:45
  });

  it('snaps intermediate positions to SNAP_MIN boundaries', () => {
    const { result } = renderHook(() =>
      useDrag({ pxPerHour: PX_PER_HOUR, dayStart: DAY_START, dayEnd: DAY_END }),
    );
    const grid = fakeGrid(0);
    const days = [new Date('2026-04-10')];

    // 3 hours past dayStart = 9:00 → relY = 3 * 60 = 180px → snaps to 9:00
    act(() => result.current.startCreate(fakePointer(10, 180), grid, days, 0));
    const start = result.current.ghost?.start;
    expect(start?.getHours()).toBe(9);
    expect(start?.getMinutes()).toBe(0);
  });
});
