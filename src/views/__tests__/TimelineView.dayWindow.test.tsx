// @vitest-environment happy-dom
/**
 * TimelineView dayWindow — pin the range-derivation contract that wires
 * the AppShell sub-toolbar's 7/14/30/90 pills into the Schedule view grid.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

import TimelineView from '../TimelineView';
import { CalendarContext } from '../../core/CalendarContext';

const employees = [
  { id: 'nurse-1', name: 'Alice Chen', role: 'Nurse' },
];

function renderTimeline(props: Record<string, unknown> = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <TimelineView
        currentDate={new Date(2026, 3, 10) /* April 10 2026, mid-month */}
        events={[]}
        employees={employees}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

function rangeLabel(container: HTMLElement): string {
  const grid = container.querySelector('[role="grid"]');
  return grid?.getAttribute('aria-label') ?? '';
}

/** Count visible day-cell columnheaders (excludes the leading corner cell). */
function dayCellCount(container: HTMLElement): number {
  const headers = container.querySelectorAll('[role="columnheader"]');
  // Subtract 1 for the leading "name" corner cell.
  return Math.max(0, headers.length - 1);
}

describe('TimelineView dayWindow', () => {
  it('falls back to the full calendar month when dayWindow is absent', () => {
    const { container } = renderTimeline();
    expect(rangeLabel(container)).toBe('Timeline for April 2026');
    // April has 30 days.
    expect(dayCellCount(container)).toBe(30);
  });

  it('falls back to the full calendar month when dayWindow is null', () => {
    const { container } = renderTimeline({ dayWindow: null });
    expect(rangeLabel(container)).toBe('Timeline for April 2026');
  });

  it('renders exactly N days starting from currentDate when dayWindow is N', () => {
    const { container } = renderTimeline({ dayWindow: 7 });
    expect(rangeLabel(container)).toBe('Timeline for Apr 10 – Apr 16, 2026');
    expect(dayCellCount(container)).toBe(7);
    // First and last visible day labels.
    const dayHeaders = Array.from(container.querySelectorAll('[role="columnheader"]')).slice(1);
    expect(dayHeaders[0]?.getAttribute('aria-label')).toContain('April 10');
    expect(dayHeaders[6]?.getAttribute('aria-label')).toContain('April 16');
  });

  it('crosses month boundaries when the window extends past month-end', () => {
    const { container } = renderTimeline({
      currentDate: new Date(2026, 3, 28),  // April 28 → window crosses into May
      dayWindow: 7,
    });
    expect(rangeLabel(container)).toBe('Timeline for Apr 28 – May 4, 2026');
  });

  it('crosses year boundaries when the window extends past year-end', () => {
    const { container } = renderTimeline({
      currentDate: new Date(2025, 11, 28),  // Dec 28 2025 → into 2026
      dayWindow: 14,
    });
    expect(rangeLabel(container)).toBe('Timeline for Dec 28 – Jan 10, 2026');
  });

  it('treats dayWindow=0 as "no window" (legacy month behaviour)', () => {
    const { container } = renderTimeline({ dayWindow: 0 });
    expect(rangeLabel(container)).toBe('Timeline for April 2026');
  });
});
