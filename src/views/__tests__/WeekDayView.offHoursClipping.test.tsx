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

function d(y, mo, day, h = 0, m = 0) {
  return new Date(y, mo - 1, day, h, m, 0, 0);
}

function Wrap({ children }: any) {
  return (
    <CalendarContext.Provider value={null}>{children}</CalendarContext.Provider>
  );
}

function makeEvent(id, start, end) {
  return { id, title: `Event ${id}`, start, end, allDay: false, color: '#3b82f6' };
}

describe('WeekView off-hours event clipping', () => {
  const monday = d(2026, 4, 6);

  function renderWeek(events, display = { dayStart: 6, dayEnd: 22 }) {
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

  it('does not render event entirely before dayStart', () => {
    const ev = makeEvent('early', d(2026, 4, 6, 2), d(2026, 4, 6, 5));
    renderWeek([ev]);
    expect(screen.queryByRole('button', { name: /Event early/i })).toBeNull();
  });

  it('does not render event entirely after dayEnd', () => {
    // dayEnd defaults to 22; event at 22:30–23:45 on same day is after the window.
    const ev = makeEvent('late', d(2026, 4, 6, 22, 30), d(2026, 4, 6, 23, 45));
    renderWeek([ev]);
    expect(screen.queryByRole('button', { name: /Event late/i })).toBeNull();
  });

  it('renders event fully inside the visible window', () => {
    const ev = makeEvent('normal', d(2026, 4, 6, 10), d(2026, 4, 6, 11));
    renderWeek([ev]);
    expect(screen.getByRole('button', { name: /Event normal/i })).toBeInTheDocument();
  });

  it('clips event that starts before dayStart but ends inside the window', () => {
    const ev = makeEvent('overlap', d(2026, 4, 6, 4), d(2026, 4, 6, 9));
    renderWeek([ev]);
    const btn = screen.getByRole('button', { name: /Event overlap/i });
    // Visible portion is 6 AM–9 AM = 3 hours; at pxPerHour=64 that's 192px.
    // top should be 0 (clipped to dayStart).
    expect(btn.style.top).toBe('0px');
    expect(parseFloat(btn.style.height)).toBeCloseTo(192, 0);
  });

  it('clips event that starts inside the window but ends after dayEnd', () => {
    // dayEnd=22; event from 20:00–23:30 should render only the 20:00–22:00 visible portion.
    const ev = makeEvent('tail', d(2026, 4, 6, 20), d(2026, 4, 6, 23, 30));
    renderWeek([ev], { dayStart: 6, dayEnd: 22 });
    const btn = screen.getByRole('button', { name: /Event tail/i });
    // top = (20-6)*64 = 896; visible height = 2h * 64 = 128
    expect(parseFloat(btn.style.top)).toBeCloseTo(896, 0);
    expect(parseFloat(btn.style.height)).toBeCloseTo(128, 0);
  });
});

describe('DayView off-hours event clipping', () => {
  const currentDate = d(2026, 4, 10);

  function renderDay(events, display = { dayStart: 6, dayEnd: 22 }) {
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
