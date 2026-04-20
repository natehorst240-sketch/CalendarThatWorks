// @vitest-environment happy-dom
/**
 * TimelineView — base-filter recovery (issue #192).
 *
 * Verifies that when a location filter yields zero rows, the filter bar
 * remains mounted and the user can clear the filter to recover from the
 * otherwise-empty view.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import TimelineView from '../TimelineView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1); // April 2026

const employees = [
  { id: 'e1', name: 'Alice Chen', base: 'east' },
  { id: 'e2', name: 'Bob Smith',  base: 'east' },
];

const bases = [
  { id: 'east', name: 'East' },
  { id: 'west', name: 'West' },
];

function renderTimeline(props: any = {}) {
  return render(
    <CalendarContext.Provider value={null as any}>
      <TimelineView
        currentDate={currentDate}
        events={[]}
        employees={employees}
        bases={bases}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('TimelineView — base filter recovery (#192)', () => {
  it('keeps the filter toolbar mounted when a filter yields zero rows', () => {
    renderTimeline();

    // Initial state: both employees render.
    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();

    // Filter to West — no employees are assigned there.
    fireEvent.click(screen.getByRole('button', { name: 'West' }));

    // Filter toolbar must remain so the user can recover.
    const toolbar = screen.getByRole('toolbar', { name: /filter by base/i });
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'East' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'West' })).toBeInTheDocument();

    // Empty-state message names the active filter.
    const emptyMsg = screen.getByRole('status');
    expect(emptyMsg).toHaveTextContent(/no employees assigned to/i);
    expect(emptyMsg.querySelector('strong')).toHaveTextContent('West');
  });

  it('exposes a Show all locations button that clears the filter', () => {
    renderTimeline();

    fireEvent.click(screen.getByRole('button', { name: 'West' }));

    const clearBtn = screen.getByRole('button', { name: /show all locations/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);

    // Employees are visible again after clearing the filter.
    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();
    // Empty-state message is gone.
    expect(screen.queryByText(/no employees assigned to/i)).not.toBeInTheDocument();
  });

  it('switching the filter to a populated location restores rows', () => {
    renderTimeline();

    fireEvent.click(screen.getByRole('button', { name: 'West' }));
    expect(screen.queryByRole('rowheader', { name: 'Alice Chen' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'East' }));
    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();
  });

  it('still renders the plain empty state when there is no data at all', () => {
    renderTimeline({ employees: [], bases: [] });
    // With no employees, TimelineView falls back to the resource-derived
    // empty message; either variant is an acceptable terminal empty state.
    expect(screen.getByText(/No (employees|events) to display/i)).toBeInTheDocument();
  });
});
