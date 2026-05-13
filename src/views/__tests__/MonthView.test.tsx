import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import MonthView from '../MonthView';
import { CalendarContext } from '../../core/CalendarContext';

// April 2026 — pinned so grid layout is deterministic
const currentDate = new Date(2026, 3, 15); // April 15, 2026

function d(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

function wrap(props: Record<string, unknown> = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <MonthView currentDate={currentDate} events={[]} {...props} />
    </CalendarContext.Provider>,
  );
}

// ─── Structure ────────────────────────────────────────────────────────────────

describe('MonthView — grid structure', () => {
  it('renders a grid with an aria-label containing the month and year', () => {
    wrap();
    expect(screen.getByRole('grid', { name: /April 2026/i })).toBeInTheDocument();
  });

  it('renders seven day-name column headers', () => {
    wrap();
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(7);
  });

  it('renders gridcell elements for each day in the month grid', () => {
    wrap();
    // April 2026 grid: Apr 1 starts on Wed → grid starts Mar 29 (Sun)
    // 5 complete weeks = 35 cells; some months need 6 = 42 cells
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBeGreaterThanOrEqual(35);
  });

  it('renders a gridcell with aria-label containing the date', () => {
    wrap();
    expect(screen.getByRole('gridcell', { name: /April 15/i })).toBeInTheDocument();
  });
});

// ─── Event rendering ──────────────────────────────────────────────────────────

describe('MonthView — single-day event pills', () => {
  it('renders a pill for a single-day event on the correct date', () => {
    const events = [
      { id: 'e1', title: 'Team Standup', start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    wrap({ events });
    expect(screen.getByRole('button', { name: /Team Standup/i })).toBeInTheDocument();
  });

  it('fires onEventClick with the event when a pill is clicked', () => {
    const onEventClick = vi.fn();
    const events = [
      { id: 'e1', title: 'Team Standup', start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    wrap({ events, onEventClick });
    fireEvent.click(screen.getByRole('button', { name: /Team Standup/i }));
    expect(onEventClick).toHaveBeenCalledOnce();
    expect(onEventClick).toHaveBeenCalledWith(events[0]);
  });

  it('renders pills for multiple events on the same day', () => {
    const events = [
      { id: 'e1', title: 'Morning Sync', start: d(2026, 4, 15), end: d(2026, 4, 15) },
      { id: 'e2', title: 'Afternoon Review', start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    wrap({ events });
    expect(screen.getByRole('button', { name: /Morning Sync/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Afternoon Review/i })).toBeInTheDocument();
  });

  it('renders pills for events on different days', () => {
    const events = [
      { id: 'e1', title: 'Monday Event', start: d(2026, 4, 13), end: d(2026, 4, 13) },
      { id: 'e2', title: 'Friday Event', start: d(2026, 4, 17), end: d(2026, 4, 17) },
    ];
    wrap({ events });
    expect(screen.getByRole('button', { name: /Monday Event/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Friday Event/i })).toBeInTheDocument();
  });
});

describe('MonthView — multi-day / allDay event span bars', () => {
  it('renders a span bar for a multi-day allDay event', () => {
    const events = [
      { id: 'span1', title: 'Conference Week', allDay: true,
        start: d(2026, 4, 13), end: d(2026, 4, 17) },
    ];
    wrap({ events });
    // The span bar renders as a button with an aria-label containing the title
    expect(screen.getByRole('button', { name: /Conference Week/i })).toBeInTheDocument();
  });

  it('fires onEventClick when a span bar is clicked', () => {
    const onEventClick = vi.fn();
    const events = [
      { id: 'span1', title: 'Conference Week', allDay: true,
        start: d(2026, 4, 13), end: d(2026, 4, 17) },
    ];
    wrap({ events, onEventClick });
    fireEvent.click(screen.getByRole('button', { name: /Conference Week/i }));
    expect(onEventClick).toHaveBeenCalledOnce();
    expect(onEventClick).toHaveBeenCalledWith(events[0]);
  });

  // Regression: a multi-day timed event (e.g. the demo's São Paulo → Munich
  // 4-day mission) dragged onto an empty date in another week must not
  // throw and must hand newStart/newEnd to onEventMove as valid Dates.
  it('moves a multi-day timed event to an empty cell without throwing', () => {
    const onEventMove = vi.fn();
    const events = [
      { id: 'mission', title: 'São Paulo → Munich Critical Care Transfer',
        // 4-day window with non-midnight times — matches the demo mission.
        start: new Date(2026, 3, 24, 6, 0),
        end:   new Date(2026, 3, 28, 8, 0),
        allDay: false,
        category: 'mission-assignment' },
    ];
    render(
      <CalendarContext.Provider value={{ permissions: { canDrag: true } } as unknown as Record<string, unknown>}>
        <MonthView currentDate={currentDate} events={events as unknown as Record<string, unknown>} onEventMove={onEventMove} />
      </CalendarContext.Provider>,
    );

    const span = screen.getAllByRole('button', { name: /São Paulo → Munich/i })[0]!;
    const target = screen.getByRole('gridcell', { name: /April 1\b/ });
    expect(() => {
      fireEvent.pointerDown(span, { button: 0, pointerId: 1 });
      fireEvent.pointerEnter(target);
      fireEvent.pointerUp(target);
    }).not.toThrow();

    expect(onEventMove).toHaveBeenCalledOnce();
    const [, newStart, newEnd] = onEventMove.mock.calls[0] as [unknown, Date, Date];
    expect(newStart).toBeInstanceOf(Date);
    expect(newEnd).toBeInstanceOf(Date);
    expect(Number.isFinite(newStart.getTime())).toBe(true);
    expect(Number.isFinite(newEnd.getTime())).toBe(true);
    // 4-day duration preserved on the new dates.
    expect(newEnd.getTime() - newStart.getTime())
      .toBe(events[0]!.end.getTime() - events[0]!.start.getTime());
  });
});

// ─── Pill drag-to-reschedule (native pointer drag) ────────────────────────────

describe('MonthView — pill drag-to-reschedule', () => {
  function withDrag(props: Record<string, unknown> = {}) {
    return render(
      <CalendarContext.Provider value={{ permissions: { canDrag: true } } as unknown as Record<string, unknown>}>
        <MonthView currentDate={currentDate} events={[]} {...props} />
      </CalendarContext.Provider>,
    );
  }

  it('moves a single-day event to the day cell where the drag is released', () => {
    const onEventMove = vi.fn();
    const events = [
      { id: 'e1', title: 'Standup', start: new Date(2026, 3, 15, 9, 30), end: new Date(2026, 3, 15, 10, 0) },
    ];
    withDrag({ events, onEventMove });

    const pill = screen.getByRole('button', { name: /Standup/i });
    const target = screen.getByRole('gridcell', { name: /April 20/i });

    fireEvent.pointerDown(pill, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    // A cursor-following clone is spawned on <body> while dragging.
    expect(document.querySelector('[data-wc-drag-ghost]')).not.toBeNull();
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerEnter(target);
    fireEvent.pointerUp(target);

    expect(onEventMove).toHaveBeenCalledOnce();
    const [movedEv, newStart, newEnd] = onEventMove.mock.calls[0] as [unknown, Date, Date];
    expect(movedEv).toBe(events[0]);
    expect(newStart.getFullYear()).toBe(2026);
    expect(newStart.getMonth()).toBe(3);
    expect(newStart.getDate()).toBe(20);
    expect(newStart.getHours()).toBe(9); // time-of-day preserved for timed events
    expect(newStart.getMinutes()).toBe(30);
    expect(newEnd.getTime() - newStart.getTime()).toBe(30 * 60_000);
    // The clone is torn down once the drag ends.
    expect(document.querySelector('[data-wc-drag-ghost]')).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('does not move (or fire onEventClick) when released on the source day', () => {
    const onEventMove = vi.fn();
    const onEventClick = vi.fn();
    const events = [
      { id: 'e1', title: 'Standup', start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    withDrag({ events, onEventMove, onEventClick });

    const pill = screen.getByRole('button', { name: /Standup/i });
    const sameDay = screen.getByRole('gridcell', { name: /April 15/i });

    fireEvent.pointerDown(pill, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerEnter(sameDay);
    fireEvent.pointerUp(sameDay);
    fireEvent.click(pill); // the synthetic click that follows a press-release

    expect(onEventMove).not.toHaveBeenCalled();
    expect(onEventClick).not.toHaveBeenCalled(); // suppressed because a drag just happened
    expect(document.querySelector('[data-wc-drag-ghost]')).toBeNull();
  });

  it('still fires onEventClick for a plain click on a pill', () => {
    const onEventClick = vi.fn();
    const events = [
      { id: 'e1', title: 'Standup', start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    withDrag({ events, onEventClick });
    fireEvent.click(screen.getByRole('button', { name: /Standup/i }));
    expect(onEventClick).toHaveBeenCalledOnce();
    expect(onEventClick).toHaveBeenCalledWith(events[0]);
  });

  it('does not start a drag when canDrag is false', () => {
    const onEventMove = vi.fn();
    const events = [
      { id: 'e1', title: 'Standup', start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    render(
      <CalendarContext.Provider value={{ permissions: { canDrag: false } } as unknown as Record<string, unknown>}>
        <MonthView currentDate={currentDate} events={events as unknown as Record<string, unknown>} onEventMove={onEventMove} />
      </CalendarContext.Provider>,
    );
    const pill = screen.getByRole('button', { name: /Standup/i });
    const target = screen.getByRole('gridcell', { name: /April 20/i });
    fireEvent.pointerDown(pill, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    expect(document.querySelector('[data-wc-drag-ghost]')).toBeNull();
    fireEvent.pointerEnter(target);
    fireEvent.pointerUp(target);
    expect(onEventMove).not.toHaveBeenCalled();
  });
});

// ─── Date selection ───────────────────────────────────────────────────────────

describe('MonthView — date selection', () => {
  it('fires onDateSelect when a day cell is clicked', () => {
    const onDateSelect = vi.fn();
    wrap({ onDateSelect });
    fireEvent.click(screen.getByRole('gridcell', { name: /April 20/i }));
    expect(onDateSelect).toHaveBeenCalledOnce();
    const [start, end] = onDateSelect.mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('does not throw when onDateSelect is not provided and a cell is clicked', () => {
    wrap();
    expect(() =>
      fireEvent.click(screen.getByRole('gridcell', { name: /April 20/i }))
    ).not.toThrow();
  });
});

// ─── Keyboard navigation ─────────────────────────────────────────────────────

describe('MonthView — keyboard navigation', () => {
  it('ArrowRight moves focus to the next day', () => {
    wrap();
    const cell15 = screen.getByRole('gridcell', { name: /April 15/i });
    fireEvent.keyDown(cell15, { key: 'ArrowRight' });
    const cell16 = screen.getByRole('gridcell', { name: /April 16/i });
    expect(cell16).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft moves focus to the previous day', () => {
    wrap();
    const cell15 = screen.getByRole('gridcell', { name: /April 15/i });
    fireEvent.keyDown(cell15, { key: 'ArrowLeft' });
    const cell14 = screen.getByRole('gridcell', { name: /April 14/i });
    expect(cell14).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowDown moves focus one week forward', () => {
    wrap();
    const cell15 = screen.getByRole('gridcell', { name: /April 15/i });
    fireEvent.keyDown(cell15, { key: 'ArrowDown' });
    const cell22 = screen.getByRole('gridcell', { name: /April 22/i });
    expect(cell22).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowUp moves focus one week backward', () => {
    wrap();
    const cell15 = screen.getByRole('gridcell', { name: /April 15/i });
    fireEvent.keyDown(cell15, { key: 'ArrowUp' });
    const cell8 = screen.getByRole('gridcell', { name: /April 8/i });
    expect(cell8).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter key triggers onDateSelect for the focused cell', () => {
    const onDateSelect = vi.fn();
    wrap({ onDateSelect });
    const cell15 = screen.getByRole('gridcell', { name: /April 15/i });
    fireEvent.keyDown(cell15, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });
});

// ─── Overflow "+N more" ───────────────────────────────────────────────────────

describe('MonthView — overflow indicator', () => {
  it('shows a "+N more" button when a day has more events than visible slots', () => {
    // 4 events on the same day — MAX_SPANS_VISIBLE=3 means at most 3 pills per cell;
    // with no spans the cell shows up to 3 pills and overflows the rest.
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      title: `Event ${i}`,
      start: d(2026, 4, 15),
      end: d(2026, 4, 15),
    }));
    wrap({ events });
    expect(screen.getByRole('button', { name: /more event/i })).toBeInTheDocument();
  });
});

// ─── Event status classes ─────────────────────────────────────────────────────

describe('MonthView — event status', () => {
  it('renders a cancelled event pill without crashing', () => {
    const events = [
      { id: 'e1', title: 'Cancelled Meeting', status: 'cancelled',
        start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    wrap({ events });
    expect(screen.getByRole('button', { name: /Cancelled Meeting/i })).toBeInTheDocument();
  });

  it('renders a tentative event pill without crashing', () => {
    const events = [
      { id: 'e1', title: 'Maybe Meeting', status: 'tentative',
        start: d(2026, 4, 15), end: d(2026, 4, 15) },
    ];
    wrap({ events });
    expect(screen.getByRole('button', { name: /Maybe Meeting/i })).toBeInTheDocument();
  });
});

// ─── Optional features ────────────────────────────────────────────────────────

describe('MonthView — optional props', () => {
  it('renders week numbers when config.display.showWeekNumbers is true', () => {
    wrap({ config: { display: { showWeekNumbers: true } } });
    // ISO week 16 contains April 12–18. "16" appears as both the week-number
    // label AND the day-cell for April 16, so there are at least two matches.
    expect(screen.getAllByText('16').length).toBeGreaterThanOrEqual(2);
  });

  it('does not render extra week-number elements by default', () => {
    wrap();
    // Without week numbers, "16" only appears once — as the April 16 day cell.
    expect(screen.getAllByText('16')).toHaveLength(1);
  });
});
