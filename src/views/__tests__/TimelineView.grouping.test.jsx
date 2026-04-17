import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import TimelineView from '../TimelineView.jsx';
import { CalendarContext } from '../../core/CalendarContext.js';

const currentDate = new Date(2026, 3, 1); // April 2026

const employees = [
  { id: 'nurse-1', name: 'Alice Chen',  role: 'Nurse'  },
  { id: 'nurse-2', name: 'Bob Smith',   role: 'Nurse'  },
  { id: 'doc-1',   name: 'Carol Jones', role: 'Doctor' },
];

function renderTimeline(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <TimelineView
        currentDate={currentDate}
        events={[]}
        employees={employees}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('TimelineView grouping', () => {
  it('renders group headers with expand/collapse buttons when groupBy is set', () => {
    renderTimeline({ groupBy: 'role' });
    expect(
      screen.getByRole('button', { name: /Collapse group Nurse/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Collapse group Doctor/i }),
    ).toBeInTheDocument();
  });

  it('shows correct member count badges (2 Nurses, 1 Doctor)', () => {
    renderTimeline({ groupBy: 'role' });
    const nurseBtn = screen.getByRole('button', { name: /Collapse group Nurse/i });
    expect(nurseBtn).toHaveTextContent('2');
    const doctorBtn = screen.getByRole('button', { name: /Collapse group Doctor/i });
    expect(doctorBtn).toHaveTextContent('1');
  });

  it('collapse hides member rows while keeping the header visible', () => {
    renderTimeline({ groupBy: 'role' });
    // All employees visible initially
    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Collapse group Nurse/i }));

    // Nurse members hidden
    expect(screen.queryByRole('rowheader', { name: 'Alice Chen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Bob Smith' })).not.toBeInTheDocument();
    // Group header still present
    expect(screen.getByText('Nurse')).toBeInTheDocument();
    // Doctor member unaffected
    expect(screen.getByRole('rowheader', { name: 'Carol Jones' })).toBeInTheDocument();
  });

  it('expand restores member rows after collapse', () => {
    renderTimeline({ groupBy: 'role' });
    fireEvent.click(screen.getByRole('button', { name: /Collapse group Nurse/i }));
    fireEvent.click(screen.getByRole('button', { name: /Expand group Nurse/i }));

    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();
  });

  it('renders no group headers when groupBy is not set (backward compat)', () => {
    renderTimeline();
    expect(
      screen.queryByRole('button', { name: /Collapse group/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Expand group/i }),
    ).not.toBeInTheDocument();
    // All employees still shown as plain rows
    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Carol Jones' })).toBeInTheDocument();
  });
});
