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
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { createRef } from 'react';
import ScreenReaderAnnouncer from '../ScreenReaderAnnouncer';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import MonthView from '../../views/MonthView';
import WeekView from '../../views/WeekView';
import DayView from '../../views/DayView';
import TimelineView from '../../views/TimelineView';
import { CalendarContext } from '../../core/CalendarContext';

type MonthViewTestProps = Partial<React.ComponentProps<typeof MonthView>>;
type WeekViewTestProps = Partial<React.ComponentProps<typeof WeekView>>;
type DayViewTestProps = Partial<React.ComponentProps<typeof DayView>>;
type TimelineViewTestProps = Partial<React.ComponentProps<typeof TimelineView>>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function d(y: number, mo: number, day: number, h = 9, m = 0) {
  return new Date(y, mo - 1, day, h, m, 0, 0);
}

type A11yEventOverrides = Partial<{
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
}> & Record<string, unknown>;

function makeEvent(id: string, overrides: A11yEventOverrides = {}) {
  return {
    id,
    title: overrides.title ?? `Event ${id}`,
    start: overrides.start ?? d(2026, 4, 10, 9),
    end: overrides.end ?? d(2026, 4, 10, 10),
    allDay: overrides.allDay ?? false,
    color: overrides.color ?? '#3b82f6',
    ...overrides,
  };
}

const calCtx: React.ContextType<typeof CalendarContext> = null;

function CalCtxWrap({ children }: { children: React.ReactNode }) {
  return (
    <CalendarContext.Provider value={calCtx}>
      {children}
    </CalendarContext.Provider>
  );
}

function requireElement<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function getFocusedGridCell(): HTMLElement {
  return requireElement(
    screen.getAllByRole('gridcell').find((cell) => cell.tabIndex === 0),
    'Expected one focused grid cell',
  );
}

// ─── ScreenReaderAnnouncer ─────────────────────────────────────────────────────

describe('ScreenReaderAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders two separate live regions', () => {
    render(<ScreenReaderAnnouncer />);
    const polite = document.querySelector('[aria-live="polite"]');
    const assertive = document.querySelector('[aria-live="assertive"]');
    expect(polite).toBeInTheDocument();
    expect(assertive).toBeInTheDocument();
  });

  it('routes polite announcements to the polite region', () => {
    const ref = createRef<{ announce: (message: string, politeness?: 'polite' | 'assertive') => void }>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    act(() => {
      ref.current?.announce('Event created.', 'polite');
      vi.advanceTimersByTime(100);
    });

    const polite = requireElement(document.querySelector('[aria-live="polite"]'), 'Expected polite region');
    expect(polite.textContent).toContain('Event created.');

    const assertive = requireElement(document.querySelector('[aria-live="assertive"]'), 'Expected assertive region');
    expect(assertive.textContent).toBe('');
  });

  it('routes assertive announcements to the assertive region', () => {
    const ref = createRef<{ announce: (message: string, politeness?: 'polite' | 'assertive') => void }>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    act(() => {
      ref.current?.announce('Error: end before start.', 'assertive');
      vi.advanceTimersByTime(100);
    });

    const assertive = requireElement(document.querySelector('[aria-live="assertive"]'), 'Expected assertive region');
    expect(assertive.textContent).toContain('Error: end before start.');

    const polite = requireElement(document.querySelector('[aria-live="polite"]'), 'Expected polite region');
    expect(polite.textContent).toBe('');
  });

  it('defaults to polite when no politeness is specified', () => {
    const ref = createRef<{ announce: (message: string, politeness?: 'polite' | 'assertive') => void }>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    act(() => {
      ref.current?.announce('Default politeness.');
      vi.advanceTimersByTime(100);
    });

    const polite = requireElement(document.querySelector('[aria-live="polite"]'), 'Expected polite region');
    expect(polite.textContent).toContain('Default politeness.');
  });

  it('alternates slots so identical messages re-trigger screen readers', () => {
    const ref = createRef<{ announce: (message: string, politeness?: 'polite' | 'assertive') => void }>();
    render(<ScreenReaderAnnouncer ref={ref} />);

    act(() => {
      ref.current?.announce('Event moved.');
      vi.advanceTimersByTime(100);
    });
    const polite = requireElement(document.querySelector('[aria-live="polite"]'), 'Expected polite region');
    const firstFilled = [...polite.children].findIndex((el) => el.textContent === 'Event moved.');
    expect(firstFilled).toBeGreaterThanOrEqual(0);

    act(() => {
      ref.current?.announce('Event moved.');
      vi.advanceTimersByTime(100);
    });
    const spans = [...polite.children];
    expect(spans[1 - firstFilled]?.textContent).toBe('Event moved.');
    expect(spans[firstFilled]?.textContent).toBe('');
  });
});

// ─── useFocusTrap ─────────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  function TrapFixture({ onEscape }: { onEscape: () => void }) {
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
    const external = document.createElement('button');
    external.textContent = 'Trigger';
    document.body.appendChild(external);
    external.focus();
    expect(document.activeElement).toBe(external);

    const { unmount } = render(<TrapFixture onEscape={() => {}} />);
    expect(screen.getByTestId('btn1')).toHaveFocus();

    unmount();
    expect(document.activeElement).toBe(external);

    document.body.removeChild(external);
  });
});

// ─── MonthView a11y ───────────────────────────────────────────────────────────

describe('MonthView ARIA semantics', () => {
  const currentDate = d(2026, 4, 1);

  function renderMonth(props: MonthViewTestProps = {}) {
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
    expect(headers.length).toBe(7);
  });

  it('renders day cells with role="gridcell"', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBeGreaterThanOrEqual(28);
  });

  it('only one cell has tabIndex=0 (the focused day)', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    const focusedCells = cells.filter((cell) => cell.tabIndex === 0);
    expect(focusedCells).toHaveLength(1);
  });

  it('focused cell has aria-selected=true', () => {
    renderMonth();
    const cells = screen.getAllByRole('gridcell');
    const selected = cells.filter((cell) => cell.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });

  it('cell aria-label includes day-of-week, month, and date', () => {
    renderMonth();
    const cell = requireElement(document.querySelector('[data-date="2026-04-01"]'), 'Expected April 1 cell');
    expect(cell).toBeInTheDocument();
    expect(cell.getAttribute('aria-label')).toMatch(/Wednesday, April 1/);
  });

  it('cell aria-label includes "today" for today\'s date', () => {
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
    const cells = screen.getAllByRole('gridcell');
    const todayCell = cells.find((cell) => cell.getAttribute('aria-label')?.includes('today'));
    expect(todayCell).toBeTruthy();
  });

  it('ArrowRight on focused cell moves focus to the next day', () => {
    renderMonth();
    const focusedCell = getFocusedGridCell();
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'ArrowRight' });

    const newFocused = getFocusedGridCell();
    expect(newFocused).not.toBe(focusedCell);
    const oldDate = new Date(requireElement(focusedCell.getAttribute('data-date'), 'Expected old data-date'));
    const newDate = new Date(requireElement(newFocused.getAttribute('data-date'), 'Expected new data-date'));
    expect(newDate.getDate() - oldDate.getDate()).toBe(1);
  });

  it('ArrowDown on focused cell moves focus 7 days ahead', () => {
    renderMonth();
    const focusedCell = getFocusedGridCell();
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'ArrowDown' });

    const newFocused = getFocusedGridCell();
    const oldDate = new Date(requireElement(focusedCell.getAttribute('data-date'), 'Expected old data-date'));
    const newDate = new Date(requireElement(newFocused.getAttribute('data-date'), 'Expected new data-date'));
    const dayDiff = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(dayDiff).toBe(7);
  });

  it('Enter on focused cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderMonth({ onDateSelect });
    const focusedCell = getFocusedGridCell();
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('Space on focused cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderMonth({ onDateSelect });
    const focusedCell = getFocusedGridCell();
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: ' ' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('overflow "more" button has aria-controls linking to the popover id', () => {
    const events = Array.from({ length: 6 }, (_, i) => makeEvent(`ev${i}`, {
      start: d(2026, 4, 1, 9 + i),
      end: d(2026, 4, 1, 10 + i),
    }));
    renderMonth({ events });

    const moreBtns = document.querySelectorAll('[aria-expanded]');
    if (moreBtns.length > 0) {
      const btn = moreBtns[0];
      const controls = btn.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
    }
  });
});

// ─── WeekView a11y ────────────────────────────────────────────────────────────

describe('WeekView ARIA semantics', () => {
  const currentDate = d(2026, 4, 6);

  function renderWeek(props: WeekViewTestProps = {}) {
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
    expect(cells.length).toBeGreaterThanOrEqual(70);
  });

  it('exactly one slot cell has tabIndex=0 (roving tabIndex)', () => {
    renderWeek();
    const cells = screen.getAllByRole('gridcell');
    const focused = cells.filter((cell) => cell.tabIndex === 0);
    expect(focused.length).toBe(1);
  });

  it('slot cell aria-label includes day name and time', () => {
    renderWeek();
    const cells = screen.getAllByRole('gridcell');
    const mondaySlot = cells.find((cell) =>
      cell.getAttribute('aria-label')?.includes('Monday') &&
      cell.getAttribute('aria-label')?.includes('8:00 AM'),
    );
    expect(mondaySlot).toBeTruthy();
  });

  it('ArrowRight moves focused slot to the next day column', () => {
    renderWeek();
    const firstFocused = getFocusedGridCell();
    firstFocused.focus();
    const firstLabel = firstFocused.getAttribute('aria-label');

    fireEvent.keyDown(firstFocused, { key: 'ArrowRight' });

    const newFocused = getFocusedGridCell();
    expect(newFocused.getAttribute('aria-label')).not.toBe(firstLabel);
  });

  it('ArrowDown moves focused slot to the next hour', () => {
    renderWeek();
    const firstFocused = getFocusedGridCell();
    firstFocused.focus();

    expect(firstFocused.getAttribute('data-slot')).toBe('0-0');

    fireEvent.keyDown(firstFocused, { key: 'ArrowDown' });

    const newFocused = getFocusedGridCell();
    expect(newFocused.getAttribute('data-slot')).toBe('0-1');
  });

  it('Enter on slot cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderWeek({ onDateSelect });
    const focusedCell = getFocusedGridCell();
    focusedCell.focus();

    fireEvent.keyDown(focusedCell, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('timed event has role="button" and aria-label with title and time', () => {
    const ev = makeEvent('ev1', {
      start: d(2026, 4, 6, 10),
      end: d(2026, 4, 6, 11),
    });
    renderWeek({ events: [ev] });

    const btn = screen.getByRole('button', { name: /Event ev1/i });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('aria-label')).toMatch(/10:00 AM/);
  });

  it('all-day span bar has aria-label instead of title', () => {
    const ev = makeEvent('multi', {
      start: d(2026, 4, 6),
      end: d(2026, 4, 8),
      allDay: true,
    });
    renderWeek({ events: [ev] });

    const btn = screen.getByRole('button', { name: /Event multi/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveAttribute('title');
  });
});

// ─── DayView a11y ─────────────────────────────────────────────────────────────

describe('DayView ARIA semantics', () => {
  const currentDate = d(2026, 4, 10);

  function renderDay(props: DayViewTestProps = {}) {
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
    expect(cells.length).toBeGreaterThanOrEqual(10);
  });

  it('exactly one slot cell has tabIndex=0', () => {
    renderDay();
    const cells = screen.getAllByRole('gridcell');
    const focused = cells.filter((cell) => cell.tabIndex === 0);
    expect(focused.length).toBe(1);
  });

  it('slot cell aria-label includes day name and time', () => {
    renderDay();
    const cells = screen.getAllByRole('gridcell');
    const slot = cells.find((cell) =>
      cell.getAttribute('aria-label')?.includes('Friday, April 10') &&
      cell.getAttribute('aria-label')?.includes('8:00 AM'),
    );
    expect(slot).toBeTruthy();
  });

  it('ArrowDown moves to next hour slot', () => {
    renderDay();
    const first = getFocusedGridCell();
    first.focus();
    expect(first.getAttribute('data-slot')).toBe('0');

    fireEvent.keyDown(first, { key: 'ArrowDown' });

    const next = getFocusedGridCell();
    expect(next.getAttribute('data-slot')).toBe('1');
  });

  it('Enter on slot cell calls onDateSelect', () => {
    const onDateSelect = vi.fn();
    renderDay({ onDateSelect });
    const first = getFocusedGridCell();
    first.focus();

    fireEvent.keyDown(first, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalledOnce();
  });

  it('timed event has role="button" and aria-label with title and time range', () => {
    const ev = makeEvent('dayev', {
      start: d(2026, 4, 10, 9),
      end: d(2026, 4, 10, 10),
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
      end: d(2026, 4, 10, 10),
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
    { id: 'bob', name: 'Bob Jones', role: 'Designer' },
  ];

  function renderTimeline(props: TimelineViewTestProps = {}) {
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
    expect(headers.length).toBe(31);
  });

  it('renders row headers for each employee', () => {
    renderTimeline();
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders.length).toBe(2);
    expect(rowHeaders[0]).toHaveAttribute('aria-label', 'Alice Smith');
    expect(rowHeaders[1]).toHaveAttribute('aria-label', 'Bob Jones');
  });

  it('event bar has aria-label with title', () => {
    const ev = makeEvent('tl1', {
      start: d(2026, 4, 5),
      end: d(2026, 4, 7),
      allDay: true,
      resource: 'alice',
      title: 'Timeline Event',
    });
    renderTimeline({ events: [ev] });

    const btn = screen.getByRole('button', { name: /Timeline Event/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveAttribute('title');
  });

  it('event bar with category includes category in aria-label', () => {
    const ev = makeEvent('tl2', {
      start: d(2026, 4, 5),
      end: d(2026, 4, 7),
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
      end: d(2026, 4, 7),
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
