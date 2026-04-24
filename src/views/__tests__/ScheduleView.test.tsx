import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ScheduleView from '../ScheduleView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 21); // April 21, 2026

function d(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

function wrap(props: Record<string, any> = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <ScheduleView currentDate={currentDate} events={[]} {...props} />
    </CalendarContext.Provider>,
  );
}

// ─── Fallback mode (no resource fields) ──────────────────────────────────────

describe('ScheduleView — fallback mode (no resource fields)', () => {
  it('shows the resource hint when no events have a resource field', () => {
    wrap();
    expect(screen.getByText(/Schedule view groups events by resource/i)).toBeInTheDocument();
  });

  it('renders events in a simple list when no resources exist', () => {
    const events = [
      { id: 'e1', title: 'Inspection', start: d(2026, 4, 21), end: d(2026, 4, 21) },
      { id: 'e2', title: 'Oil change',  start: d(2026, 4, 22), end: d(2026, 4, 22) },
    ];
    wrap({ events });
    expect(screen.getByText('Inspection')).toBeInTheDocument();
    expect(screen.getByText('Oil change')).toBeInTheDocument();
  });

  it('fires onEventClick when a simple-list event button is clicked', () => {
    const onEventClick = vi.fn();
    const events = [{ id: 'e1', title: 'Inspection', start: d(2026, 4, 21), end: d(2026, 4, 21) }];
    wrap({ events, onEventClick });
    fireEvent.click(screen.getByText('Inspection'));
    expect(onEventClick).toHaveBeenCalledOnce();
    expect(onEventClick).toHaveBeenCalledWith(events[0]);
  });

  it('does not crash with an empty event list', () => {
    expect(() => wrap({ events: [] })).not.toThrow();
  });

  it('caps the simple list at 40 events', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      id: `e${i}`, title: `Event ${i}`, start: d(2026, 4, 21), end: d(2026, 4, 21),
    }));
    wrap({ events });
    // Events 0–39 rendered; 40–49 clipped
    expect(screen.getByText('Event 0')).toBeInTheDocument();
    expect(screen.getByText('Event 39')).toBeInTheDocument();
    expect(screen.queryByText('Event 40')).toBeNull();
  });
});

// ─── Grid mode (events have resource fields) ─────────────────────────────────

describe('ScheduleView — grid mode (resource fields present)', () => {
  const events = [
    { id: 'e1', title: 'Alpha Monday', resource: 'Alpha', start: d(2026, 4, 21), end: d(2026, 4, 21) },
    { id: 'e2', title: 'Beta Monday',  resource: 'Beta',  start: d(2026, 4, 21), end: d(2026, 4, 21) },
    { id: 'e3', title: 'Alpha Tuesday', resource: 'Alpha', start: d(2026, 4, 22), end: d(2026, 4, 22) },
  ];

  it('renders a resource column header for each unique resource', () => {
    wrap({ events });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders event pills for events with matching resource and date', () => {
    wrap({ events });
    expect(screen.getByText('Alpha Monday')).toBeInTheDocument();
    expect(screen.getByText('Beta Monday')).toBeInTheDocument();
    expect(screen.getByText('Alpha Tuesday')).toBeInTheDocument();
  });

  it('does not show the fallback hint when resources exist', () => {
    wrap({ events });
    expect(screen.queryByText(/Schedule view groups events by resource/i)).toBeNull();
  });

  it('fires onEventClick with the correct event when a pill is clicked', () => {
    const onEventClick = vi.fn();
    wrap({ events, onEventClick });
    fireEvent.click(screen.getByTitle('Alpha Monday'));
    expect(onEventClick).toHaveBeenCalledOnce();
    expect(onEventClick).toHaveBeenCalledWith(events[0]);
  });

  it('resources are sorted alphabetically in the header', () => {
    wrap({ events });
    const headers = screen.getAllByText(/^(Alpha|Beta)$/);
    expect(headers[0]!.textContent).toBe('Alpha');
    expect(headers[1]!.textContent).toBe('Beta');
  });
});

// ─── Event status rendering ───────────────────────────────────────────────────

describe('ScheduleView — event status', () => {
  it('renders a cancelled event without crashing', () => {
    const events = [
      { id: 'e1', title: 'Cancelled Job', resource: 'Alpha', status: 'cancelled',
        start: d(2026, 4, 21), end: d(2026, 4, 21) },
    ];
    wrap({ events });
    expect(screen.getByTitle('Cancelled Job')).toBeInTheDocument();
  });

  it('renders a tentative event without crashing', () => {
    const events = [
      { id: 'e1', title: 'Tentative Job', resource: 'Alpha', status: 'tentative',
        start: d(2026, 4, 21), end: d(2026, 4, 21) },
    ];
    wrap({ events });
    expect(screen.getByTitle('Tentative Job')).toBeInTheDocument();
  });
});

// ─── weekStartDay prop ────────────────────────────────────────────────────────

describe('ScheduleView — weekStartDay prop', () => {
  it('accepts weekStartDay=1 (Monday) without crashing', () => {
    const events = [
      { id: 'e1', title: 'Monday Start', resource: 'Alpha', start: d(2026, 4, 21), end: d(2026, 4, 21) },
    ];
    expect(() => wrap({ events, weekStartDay: 1 })).not.toThrow();
  });
});
