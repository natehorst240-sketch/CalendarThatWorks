import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { WorksCalendar } from '../WorksCalendar.tsx';

describe('WorksCalendar schedule workflow entry points', () => {
  const employees = [
    { id: 'emp-1', name: 'Alex Rivera', role: 'RN' },
  ];

  it('opens employee action card when employee name is clicked', async () => {
    render(<WorksCalendar events={[]} employees={employees} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Alex Rivera' }));

    expect(await screen.findByRole('menu', { name: 'Actions for Alex Rivera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Schedule' })).toBeInTheDocument();
  });

  it('routes empty schedule-cell click to ScheduleEditorForm instead of EventForm', async () => {
    render(<WorksCalendar events={[]} employees={employees} showAddButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('gridcell', { name: /^Alex Rivera, April 1, empty/ }));

    expect(await screen.findByRole('dialog', { name: 'Edit schedule for Alex Rivera' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add event' })).not.toBeInTheDocument();
  });
});
