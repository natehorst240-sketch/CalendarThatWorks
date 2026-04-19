/**
 * Regression: AgendaView should render the resource display name (e.g.
 * "Sarah Chen") rather than the raw resource ID (e.g. "emp-sarah") when an
 * `employees` list is provided. When no list is provided, or the resource
 * is not found in the list (e.g. fleet/asset tail numbers), the raw
 * identifier is rendered unchanged.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AgendaView from '../AgendaView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1);
const day = new Date(2026, 3, 5);

const employees = [
  { id: 'emp-sarah', name: 'Sarah Chen', role: 'Senior Engineer', color: '#3b82f6' },
  { id: 'emp-marcus', name: 'Marcus Webb' },
];

const events = [
  { id: 'e1', title: 'On Call', category: 'on-call', resource: 'emp-sarah', start: day, end: day, allDay: true },
  { id: 'e2', title: 'Fleet check', category: 'maintenance', resource: 'N121AB', start: day, end: day, allDay: true },
];

function renderAgenda(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AgendaView currentDate={currentDate} events={events} onEventClick={vi.fn()} {...props} />
    </CalendarContext.Provider>,
  );
}

describe('AgendaView resource label resolution', () => {
  it('renders the employee display name when the resource matches an id', () => {
    renderAgenda({ employees });
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.queryByText('emp-sarah')).toBeNull();
  });

  it('falls back to the raw resource id when no match is found', () => {
    renderAgenda({ employees });
    // Fleet asset ID is not in the employees list — render as-is
    expect(screen.getByText('N121AB')).toBeInTheDocument();
  });

  it('falls back to the raw resource id when no employees prop is passed', () => {
    renderAgenda();
    expect(screen.getByText('emp-sarah')).toBeInTheDocument();
  });
});
