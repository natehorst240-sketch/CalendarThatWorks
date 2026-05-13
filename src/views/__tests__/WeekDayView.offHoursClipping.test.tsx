/**
 * Regression: events that fall entirely outside the visible [dayStart, dayEnd]
 * hour window must not render in the timed grid. Previously, an event at
 * 2am–5am with dayStart=6 would render as a 3-hour block at the top of the
 * grid (visually appearing at 6am–9am), misleading users about when the
 * event actually occurred.
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import WeekView from '../WeekView';
import DayView from '../DayView';
import { CalendarContext } from '../../core/CalendarContext';

function d(y: number, mo: number, day: number, h = 0, m = 0) {
  return new Date(y, mo - 1, day, h, m, 0, 0);
}

function Wrap({ children }: { children?: React.ReactNode }) {
  return (
    <CalendarContext.Provider value={null}>{children}</CalendarContext.Provider>
  );
}

function makeEvent(id: string, start: Date, end: Date) {
  return { id, title: `Event ${id}`, start, end, allDay: false, color: '#3b82f6' };
}

describe('WeekView off-hours event clipping', () => {
  const monday = d(2026, 4, 6);

  function renderWeek(events: Array<Record<string, unknown>>, display = { dayStart: 6, dayEnd: 22 }) {
    return render(
      <Wrap>
        <WeekView
          currentDate={monday}
          events={events}
          weekStartDay={0}
          onEventClick={vi.fn()}
          onDateSelect={vi.fn()}
          onEventMove={vi.fn()}
          onEventResize={vi.fn()}
          config={{ display }}
        />
      </Wrap>,
    );
  }

  it('renders early-morning event as a pill (week view has no time window)', () => {
    // Week view is a day-column layout with no time grid, so all events
    // for the week are shown as pills regardless of their time of day.
    const ev = makeEvent('early', d(2026, 4, 6, 2), d(2026, 4, 6, 5));
    renderWeek([ev]);
    expect(screen.getByRole('button', { name: /Event early/i })).toBeInTheDocument();
  });

  it('renders late-night event as a pill (week view has no time window)', () => {
    const ev = makeEvent('late', d(2026, 4, 6, 22, 30), d(2026, 4, 6, 23, 45));
    renderWeek([ev]);
    expect(screen.getByRole('button', { name: /Event late/i })).toBeInTheDocument();
  });

  it('renders event fully inside the visible window', () => {
    const ev = makeEvent('normal', d(2026, 4, 6, 10), d(2026, 4, 6, 11));
    renderWeek([ev]);
    expect(screen.getByRole('button', { name: /Event normal/i })).toBeInTheDocument();
  });

  it('keeps short-event titles readable without verbose prefixes', () => {
    const ev = {
      ...makeEvent('short', d(2026, 4, 6, 10), d(2026, 4, 6, 11)),
      title: 'Type rating',
    };
    renderWeek([ev]);
    const btn = screen.getByRole('button', { name: /Type rating/i });
    expect(btn).toBeInTheDocument();
    expect(screen.queryByText('Title: Type rating')).not.toBeInTheDocument();
    expect(screen.getByText('Type rating')).toBeInTheDocument();
    // Pill height + grid position encode start/end visually, so we no longer
    // duplicate the time range as text — it just stole space from the title.
    // The aria-label retains the hours for screen readers (asserted via the
    // role="button" name match above).
    expect(screen.queryByText(/10:00 AM - 11:00 AM/)).not.toBeInTheDocument();
  });

  it('renders overnight event as a pill with visible time label', () => {
    // Week view shows all events as pills, no time-based clipping.
    const ev = makeEvent('overlap', d(2026, 4, 6, 4), d(2026, 4, 6, 9));
    renderWeek([ev]);
    expect(screen.getByRole('button', { name: /Event overlap/i })).toBeInTheDocument();
  });

  it('renders late event as a pill (no time window in week view)', () => {
    const ev = makeEvent('tail', d(2026, 4, 6, 20), d(2026, 4, 6, 23, 30));
    renderWeek([ev], { dayStart: 6, dayEnd: 22 });
    expect(screen.getByRole('button', { name: /Event tail/i })).toBeInTheDocument();
  });
});

describe('DayView off-hours event clipping', () => {
  const currentDate = d(2026, 4, 10);

  function renderDay(events: Array<Record<string, unknown>>, display = { dayStart: 6, dayEnd: 22 }) {
    return render(
      <Wrap>
        <DayView
          currentDate={currentDate}
          events={events}
          onEventClick={vi.fn()}
          onDateSelect={vi.fn()}
          onEventMove={vi.fn()}
          onEventResize={vi.fn()}
          config={{ display }}
        />
      </Wrap>,
    );
  }

  it('does not render event entirely before dayStart', () => {
    const ev = makeEvent('early', d(2026, 4, 10, 2), d(2026, 4, 10, 5));
    renderDay([ev]);
    expect(screen.queryByRole('button', { name: /Event early/i })).toBeNull();
  });

  it('does not render event entirely after dayEnd', () => {
    const ev = makeEvent('late', d(2026, 4, 10, 22, 30), d(2026, 4, 10, 23, 45));
    renderDay([ev]);
    expect(screen.queryByRole('button', { name: /Event late/i })).toBeNull();
  });

  it('renders event fully inside the visible window', () => {
    const ev = makeEvent('normal', d(2026, 4, 10, 10), d(2026, 4, 10, 11));
    renderDay([ev]);
    expect(screen.getByRole('button', { name: /Event normal/i })).toBeInTheDocument();
  });
});
