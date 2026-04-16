import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AgendaView from '../AgendaView.jsx';
import { CalendarContext } from '../../core/CalendarContext.js';

const currentDate = new Date(2026, 3, 1); // April 2026

const sameDay = new Date(2026, 3, 5); // April 5

const events = [
  { id: 'e1', title: 'Morning Run',  category: 'Exercise', start: sameDay, end: sameDay, allDay: true },
  { id: 'e2', title: 'Lunch Walk',   category: 'Exercise', start: sameDay, end: sameDay, allDay: true },
  { id: 'e3', title: 'Team Meeting', category: 'Work',     start: sameDay, end: sameDay, allDay: true },
];

function renderAgenda(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AgendaView
        currentDate={currentDate}
        events={events}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('AgendaView grouping', () => {
  it('renders sub-group headers for each category when groupBy is set', () => {
    renderAgenda({ groupBy: 'category' });
    expect(screen.getByRole('heading', { level: 3, name: 'Exercise' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Work' })).toBeInTheDocument();
  });

  it('events appear under their correct sub-group', () => {
    renderAgenda({ groupBy: 'category' });
    const exerciseLabel = screen.getByRole('heading', { level: 3, name: 'Exercise' });
    const workLabel     = screen.getByRole('heading', { level: 3, name: 'Work' });
    // Exercise sub-group comes before Work (insertion order)
    expect(exerciseLabel.compareDocumentPosition(workLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // All event titles present
    expect(screen.getByText('Morning Run')).toBeInTheDocument();
    expect(screen.getByText('Lunch Walk')).toBeInTheDocument();
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
  });

  it('renders no sub-group headers when groupBy is not set', () => {
    renderAgenda();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    // Events still visible
    expect(screen.getByText('Morning Run')).toBeInTheDocument();
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
  });
});
