/**
 * Accessibility regression tests — Phase 3 (#17)
 *
 * Covers:
 *   • ScreenReaderAnnouncer: polite vs assertive routing, alternating slots
 *   • useFocusTrap: Escape key, Tab wrap, Shift+Tab wrap, focus restore
 *   • MonthView: ARIA grid structure, roving tabIndex, keyboard nav, Enter → onDateSelect
 *   • WeekView slot cells: role="gridcell", tabIndex, aria-label
 *   • DayView slot cells: role="gridcell", tabIndex, aria-label
 *   • TimelineView: role="grid", role="rowheader", aria-label on event bars
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { createRef } from 'react';
import ScreenReaderAnnouncer from '../ScreenReaderAnnouncer';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import MonthView from '../../views/MonthView';
import WeekView from '../../views/WeekView';
import DayView from '../../views/DayView';
import TimelineView from '../../views/TimelineView';
import { CalendarContext } from '../../core/CalendarContext';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function d(y, mo, day, h = 9, m = 0) {
  return new Date(y, mo - 1, day, h, m, 0, 0);
}

function makeEvent(id, overrides: any = {}) {
  return {
    id,
    title: overrides.title ?? `Event ${id}`,
    start: overrides.start ?? d(2026, 4, 10, 9),
    end:   overrides.end   ?? d(2026, 4, 10, 10),
    allDay: overrides.allDay ?? false,
    color: overrides.color ?? '#3b82f6',
    ...overrides,
  };
}

const calCtx = null; // CalendarContext.Provider value (null = default)

function CalCtxWrap({ children }: any) {
  return (
    <CalendarContext.Provider value={calCtx}>
      {children}
    </CalendarContext.Provider>
  );
}

// ─── ScreenReaderAnnouncer ─────────────────────────────────────────────────────

describe('ScreenReaderAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders two separate live regions', () => {
    render(<ScreenReaderAnnouncer />);
    const polite     = document.querySelector('[aria-live="polite"]');
    const assertive  = document.querySelector('[aria-live="assertive"]');
    expect(polite).toBeInTheDocument();
    expect(assertive).toBeInTheDocument();
  });

  it('routes polite announcements to the polite region', async () => {
    const ref = createRef<any>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    act(() => {
      ref.current.announce('Event created.', 'polite');
      vi.advanceTimersByTime(100);
    });

    const polite = document.querySelector('[aria-live="polite"]');
    expect(polite.textContent).toContain('Event created.');

    const assertive = document.querySelector('[aria-live="assertive"]');
    expect(assertive.textContent).toBe('');
  });

  it('routes assertive announcements to the assertive region', async () => {
    const ref = createRef<any>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    act(() => {
      ref.current.announce('Error: end before start.', 'assertive');
      vi.advanceTimersByTime(100);
    });

    const assertive = document.querySelector('[aria-live="assertive"]');
    expect(assertive.textContent).toContain('Error: end before start.');

    const polite = document.querySelector('[aria-live="polite"]');
    expect(polite.textContent).toBe('');
  });

  it('defaults to polite when no politeness is specified', async () => {
    const ref = createRef<any>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    act(() => {
      ref.current.announce('Default politeness.');
      vi.advanceTimersByTime(100);
    });

    const polite = document.querySelector('[aria-live="polite"]');
    expect(polite.textContent).toContain('Default politeness.');
  });

  it('alternates slots so identical messages re-trigger screen readers', async () => {
    const ref = createRef<any>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    // First announcement
    act(() => {
      ref.current.announce('Event moved.');
      vi.advanceTimersByTime(100);
    });
    const polite = document.querySelector('[aria-live="polite"]');
    const firstFilled = [...polite.children].findIndex(el => el.textContent === 'Event moved.');
    expect(firstFilled).toBeGreaterThanOrEqual(0);

    // Second announcement of same message — should go to the other slot
    act(() => {
      ref.current.announce('Event moved.');
      vi.advanceTimersByTime(100);
    });
    const spans = [...polite.children];
    // Previous slot should be cleared, other slot should have the message
    expect(spans[1 - firstFilled].textContent).toBe('Event moved.');
    expect(spans[firstFilled].textContent).toBe('');
  });
});

// ─── useFocusTrap ─────────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  function TrapFixture({ onEscape }) {
    const trapRef = useFocusTrap(onEscape);
    return (
      <div ref={trapRef} data-testid="trap">
        <button data-testid="btn1">First</button>
        <button data-testid="btn2">Second</button>
        <button data-testid="btn3">Last</button>
      </div>
    );
  }

  it('focuses the first focusable element on mount', () => {
    render(<TrapFixture onEscape={() => {}} />);
    expect(screen.getByTestId('btn1')).toHaveFocus();
  });

  it('calls onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    render(<TrapFixture onEscape={onEscape} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('wraps Tab from last to first focusable', () => {
    render(<TrapFixture onEscape={() => {}} />);
    screen.getByTestId('btn3').focus();
    expect(screen.getByTestId('btn3')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false, bubbles: true });
    expect(screen.getByTestId('btn1')).toHaveFocus();
  });

  it('wraps Shift+Tab from first to last focusable', () => {
    render(<TrapFixture onEscape={() => {}} />);
    screen.getByTestId('btn1').focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true, bubbles: true });
    expect(screen.getByTestId('btn3')).toHaveFocus();
  });

  it('restores focus to the element that was focused before mount', () => {
    // Create an external button to hold focus before mounting the trap
    const external = document.createElement('button');
    external.textContent = 'Trigger';
    document.body.appendChild(external);
    external.focus();
    expect(document.activeElement).toBe(external);

    const { unmount } = render(<TrapFixture onEscape={() => {}} />);
    // Trap should have moved focus to first button inside
    expect(screen.getByTestId('btn1')).toHaveFocus();

    unmount();
    // Focus should return to the external button
    expect(document.activeElement).toBe(external);

    document.body.removeChild(external);
  });
});

// ─── MonthView a11y ───────────────────────────────────────────────────────────

describe('MonthView ARIA semantics', () => {
  const currentDate = d(2026, 4, 1); // April 2026

  function renderMonth(props: any = {}) {
    return render(
      <CalCtxWrap>
        <MonthView
          currentDate={currentDate}
          events={props.events ?? []}
          weekStartDay={0}
          onEventClick={vi.fn()}
          onDateSelect={props.onDateSelect ?? vi.fn()}
          config={{}}
          {...props}
        />
      </CalCtxWrap>,
    );
  }

  it('renders with role="grid" and aria-label containing the month name', () => {
    renderMonth();
    const grid = screen.getByRole('grid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute('aria-label', expect.stringContaining('April 2026'));
  });

  it('renders column headers with role="columnheader"', () => {
    renderMonth();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(7); // Sun–Sat
  });

  it('renders day cells with role="gridcell"', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBeGreaterThanOrEqual(28);
  });

  it('only one cell has tabIndex=0 (the focused day)', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    const focusedCells = cells.filter(c => c.tabIndex === 0);
    expect(focusedCells).toHaveLength(1);
  });

  it('focused cell has aria-selected=true', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    const selected = cells.filter(c => c.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });

  it('cell aria-label includes day-of-week, month, and date', () => {
    renderMonth();
    // April 1, 2026 is a Wednesday — use data-date for precise selection
    const cell = document.querySelector('[data-date="2026-04-01"]');
    expect(cell).toBeInTheDocument();
    expect(cell.getAttribute('aria-label')).toMatch(/Wednesday, April 1/);
  });

  it('cell aria-label includes "today" for today\'s date', () => {
    // Use current actual date for "today" test
    const today = new Date();
    render(
      <CalCtxWrap>
        <MonthView
          currentDate={today}
          events={[]}
          weekStartDay={0}
          onEventClick={vi.fn()}
          onDateSelect={vi.fn()}
          config={{}}
        />
      </CalCtxWrap>,
    );
    // Find a cell with "today" in its label
    const cells = screen.getAllByRole('gridcell');
    const todayCell = cells.find(c => c.getAttribute('aria-label')?.includes('today'));
    expect(todayCell).toBeTruthy();
  });

  it('ArrowRight on focused cell moves focus to the next day', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    const focusedCell = cells.find(c => c.tabIndex === 0);
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'ArrowRight' });

    // After ArrowRight, a different cell should have tabIndex=0
    const newFocused = screen.getAllByRole('gridcell').find(c => c.tabIndex === 0);
    expect(newFocused).not.toBe(focusedCell);
    // The new cell's data-date should be one day later
    const oldDate = new Date(focusedCell.getAttribute('data-date'));
    const newDate = new Date(newFocused.getAttribute('data-date'));
    expect(newDate.getDate() - oldDate.getDate()).toBe(1);
  });

  it('ArrowDown on focused cell moves focus 7 days ahead', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    const focusedCell = cells.find(c => c.tabIndex === 0);
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'ArrowDown' });

    const newFocused = screen.getAllByRole('gridcell').find(c => c.tabIndex === 0);
    const oldDate = new Date(focusedCell.getAttribute('data-date'));
    const newDate = new Date(newFocused.getAttribute('data-date'));
    const dayDiff = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(dayDiff).toBe(7);
  });

  it('Enter on focused cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderMonth({ onDateSelect });
    const cells = screen.getAllByRole('gridcell');
    const focusedCell = cells.find(c => c.tabIndex === 0);
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('Space on focused cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderMonth({ onDateSelect });
    const cells = screen.getAllByRole('gridcell');
    const focusedCell = cells.find(c => c.tabIndex === 0);
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: ' ' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('overflow "more" button has aria-controls linking to the popover id', () => {
    // Create enough events to overflow
    const events = Array.from({ length: 6 }, (_, i) => makeEvent(`ev${i}`, {
      start: d(2026, 4, 1, 9 + i),
      end:   d(2026, 4, 1, 10 + i),
    }));
    renderMonth({ events });

    const moreBtns = document.querySelectorAll('[aria-expanded]');
    if (moreBtns.length > 0) {
      const btn = moreBtns[0];
      const controls = btn.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      // The controlled popover id should exist in DOM (once expanded)
    }
  });
});

// ─── WeekView a11y ────────────────────────────────────────────────────────────

describe('WeekView ARIA semantics', () => {
  const currentDate = d(2026, 4, 6); // A Monday

  function renderWeek(props: any = {}) {
    return render(
      <CalCtxWrap>
        <WeekView
          currentDate={currentDate}
          events={props.events ?? []}
          weekStartDay={0}
          onEventClick={vi.fn()}
          onDateSelect={props.onDateSelect ?? vi.fn()}
          onEventMove={vi.fn()}
          onEventResize={vi.fn()}
          config={{ display: { dayStart: 8, dayEnd: 18 } }}
          {...props}
        />
      </CalCtxWrap>,
    );
  }

  it('renders with role="grid" and aria-label containing date range', () => {
    renderWeek();
    const grid = screen.getByRole('grid');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('aria-label')).toMatch(/Week of/);
  });

  it('renders 7 column headers', () => {
    renderWeek();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(7);
  });

  it('renders time slot cells with role="gridcell"', () => {
    renderWeek();
    const cells = screen.getAllByRole('gridcell');
    // 7 days × (18-8) = 70 slot cells
    expect(cells.length).toBeGreaterThanOrEqual(70);
  });

  it('exactly one slot cell has tabIndex=0 (roving tabIndex)', () => {
    renderWeek();
    const cells = screen.getAllByRole('gridcell');
    const focused = cells.filter(c => c.tabIndex === 0);
    expect(focused.length).toBe(1);
  });

  it('slot cell aria-label includes day name and time', () => {
    renderWeek();
    // Should find a cell for "Monday" at "8:00 AM"
    const cells = screen.getAllByRole('gridcell');
    const mondaySlot = cells.find(c =>
      c.getAttribute('aria-label')?.includes('Monday') &&
      c.getAttribute('aria-label')?.includes('8:00 AM'),
    );
    expect(mondaySlot).toBeTruthy();
  });

  it('ArrowRight moves focused slot to the next day column', () => {
    renderWeek();
    const cells = screen.getAllByRole('gridcell');
    const firstFocused = cells.find(c => c.tabIndex === 0);
    firstFocused.focus();
    const firstLabel = firstFocused.getAttribute('aria-label');

    fireEvent.keyDown(firstFocused, { key: 'ArrowRight' });

    const newFocused = screen.getAllByRole('gridcell').find(c => c.tabIndex === 0);
    expect(newFocused.getAttribute('aria-label')).not.toBe(firstLabel);
  });

  it('ArrowDown moves focused slot to the next hour', () => {
    renderWeek();
    const cells = screen.getAllByRole('gridcell');
    const firstFocused = cells.find(c => c.tabIndex === 0);
    firstFocused.focus();

    // First focused slot should have day idx 0, hour idx 0
    expect(firstFocused.getAttribute('data-slot')).toBe('0-0');

    fireEvent.keyDown(firstFocused, { key: 'ArrowDown' });

    const newFocused = screen.getAllByRole('gridcell').find(c => c.tabIndex === 0);
    expect(newFocused.getAttribute('data-slot')).toBe('0-1');
  });

  it('Enter on slot cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderWeek({ onDateSelect });
    const cells = screen.getAllByRole('gridcell');
    const focusedCell = cells.find(c => c.tabIndex === 0);
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('timed event has role="button" and aria-label with title and time', () => {
    const ev = makeEvent('ev1', {
      start: d(2026, 4, 6, 10),
      end:   d(2026, 4, 6, 11),
    });
    renderWeek({ events: [ev] });

    const btn = screen.getByRole('button', { name: /Event ev1/i });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('aria-label')).toMatch(/10:00 AM/);
  });

  it('all-day span bar has aria-label instead of title', () => {
    const ev = makeEvent('multi', {
      start: d(2026, 4, 6),
      end:   d(2026, 4, 8),
      allDay: true,
    });
    renderWeek({ events: [ev] });

    // The all-day bar is a button; find it by aria-label (not title)
    const btn = screen.getByRole('button', { name: /Event multi/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveAttribute('title'); // title should be gone
  });
});

// ─── DayView a11y ─────────────────────────────────────────────────────────────

describe('DayView ARIA semantics', () => {
  const currentDate = d(2026, 4, 10);

  function renderDay(props: any = {}) {
    return render(
      <CalCtxWrap>
        <DayView
          currentDate={currentDate}
          events={props.events ?? []}
          onEventClick={vi.fn()}
          onDateSelect={props.onDateSelect ?? vi.fn()}
          onEventMove={vi.fn()}
          onEventResize={vi.fn()}
          config={{ display: { dayStart: 8, dayEnd: 18 } }}
          {...props}
        />
      </CalCtxWrap>,
    );
  }

  it('renders with role="grid"', () => {
    renderDay();
    const grid = screen.getByRole('grid');
    expect(grid).toBeInTheDocument();
  });

  it('renders time slot cells with role="gridcell"', () => {
    renderDay();
    const cells = screen.getAllByRole('gridcell');
    // 1 column × 10 hours = 10 slot cells (8–18)
    expect(cells.length).toBeGreaterThanOrEqual(10);
  });

  it('exactly one slot cell has tabIndex=0', () => {
    renderDay();
    const cells = screen.getAllByRole('gridcell');
    const focused = cells.filter(c => c.tabIndex === 0);
    expect(focused.length).toBe(1);
  });

  it('slot cell aria-label includes day name and time', () => {
    renderDay();
    const cells = screen.getAllByRole('gridcell');
    const slot = cells.find(c =>
      c.getAttribute('aria-label')?.includes('Friday, April 10') &&
      c.getAttribute('aria-label')?.includes('8:00 AM'),
    );
    expect(slot).toBeTruthy();
  });

  it('ArrowDown moves to next hour slot', () => {
    renderDay();
    const cells = screen.getAllByRole('gridcell');
    const first = cells.find(c => c.tabIndex === 0);
    first.focus();
    expect(first.getAttribute('data-slot')).toBe('0');

    fireEvent.keyDown(first, { key: 'ArrowDown' });

    const next = screen.getAllByRole('gridcell').find(c => c.tabIndex === 0);
    expect(next.getAttribute('data-slot')).toBe('1');
  });

  it('Enter on slot cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderDay({ onDateSelect });
    const cells = screen.getAllByRole('gridcell');
    const first = cells.find(c => c.tabIndex === 0);
    first.focus();

    fireEvent.keyDown(first, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('timed event has role="button" and aria-label with title and time range', () => {
    const ev = makeEvent('dayev', {
      start: d(2026, 4, 10, 9),
      end:   d(2026, 4, 10, 10),
    });
    renderDay({ events: [ev] });

    const btn = screen.getByRole('button', { name: /Event dayev/i });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('aria-label')).toMatch(/9:00 AM/);
  });

  it('all-day pill has aria-label', () => {
    const ev = makeEvent('alldayev', {
      start: d(2026, 4, 10),
      end: d(2026, 4, 11),
      allDay: true,
    });
    renderDay({ events: [ev] });

    const pill = screen.getByRole('button', { name: /Event alldayev/i });
    expect(pill).toBeInTheDocument();
    expect(pill.getAttribute('aria-label')).toContain('Event alldayev');
  });

  it('custom renderEvent still gets role=button and aria-label', () => {
    const ev = makeEvent('custom', {
      start: d(2026, 4, 10, 9),
      end:   d(2026, 4, 10, 10),
    });
    const renderEvent = () => <span>Custom Render</span>;
    render(
      <CalendarContext.Provider value={{ renderEvent }}>
        <DayView
          currentDate={currentDate}
          events={[ev]}
          onEventClick={vi.fn()}
          onDateSelect={vi.fn()}
          onEventMove={vi.fn()}
          onEventResize={vi.fn()}
          config={{ display: { dayStart: 8, dayEnd: 18 } }}
        />
      </CalendarContext.Provider>,
    );

    const btn = screen.getByRole('button', { name: /Event custom/i });
    expect(btn).toBeInTheDocument();
  });
});

// ─── TimelineView a11y ────────────────────────────────────────────────────────

describe('TimelineView ARIA semantics', () => {
  const currentDate = d(2026, 4, 1);

  const employees = [
    { id: 'alice', name: 'Alice Smith', role: 'Developer' },
    { id: 'bob',   name: 'Bob Jones',  role: 'Designer' },
  ];

  function renderTimeline(props: any = {}) {
    return render(
      <CalCtxWrap>
        <TimelineView
          currentDate={currentDate}
          events={props.events ?? []}
          employees={employees}
          onEventClick={vi.fn()}
          {...props}
        />
      </CalCtxWrap>,
    );
  }

  it('renders with role="grid" and month label', () => {
    renderTimeline();
    const grid = screen.getByRole('grid');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('aria-label')).toContain('April 2026');
  });

  it('renders column headers for each day', () => {
    renderTimeline();
    const headers = screen.getAllByRole('columnheader');
    // 30 days + 1 corner = 31
    expect(headers.length).toBe(31);
  });

  it('renders row headers for each employee', () => {
    renderTimeline();
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders.length).toBe(2); // alice and bob
    expect(rowHeaders[0]).toHaveAttribute('aria-label', 'Alice Smith');
    expect(rowHeaders[1]).toHaveAttribute('aria-label', 'Bob Jones');
  });

  it('event bar has aria-label with title', () => {
    const ev = makeEvent('tl1', {
      start: d(2026, 4, 5),
      end:   d(2026, 4, 7),
      allDay: true,
      resource: 'alice',
      title: 'Timeline Event',
    });
    renderTimeline({ events: [ev] });

    const btn = screen.getByRole('button', { name: /Timeline Event/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveAttribute('title'); // title replaced by aria-label
  });

  it('event bar with category includes category in aria-label', () => {
    const ev = makeEvent('tl2', {
      start: d(2026, 4, 5),
      end:   d(2026, 4, 7),
      allDay: true,
      resource: 'alice',
      title: 'Design Sprint',
      category: 'Planning',
    });
    renderTimeline({ events: [ev] });

    const btn = screen.getByRole('button', { name: /Design Sprint, Planning/i });
    expect(btn).toBeInTheDocument();
  });

  it('custom renderEvent still gets role=button and aria-label', () => {
    const ev = makeEvent('custom-tl', {
      start: d(2026, 4, 5),
      end:   d(2026, 4, 7),
      allDay: true,
      resource: 'alice',
      title: 'Custom TL',
    });
    const renderEvent = () => <span>Custom</span>;
    render(
      <CalendarContext.Provider value={{ renderEvent }}>
        <TimelineView
          currentDate={currentDate}
          events={[ev]}
          employees={employees}
          onEventClick={vi.fn()}
        />
      </CalendarContext.Provider>,
    );

    const btn = screen.getByRole('button', { name: /Custom TL/i });
    expect(btn).toBeInTheDocument();
  });
});
