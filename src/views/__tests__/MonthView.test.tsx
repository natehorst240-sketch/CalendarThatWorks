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

function wrap(props: Record<string, any> = {}) {
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
