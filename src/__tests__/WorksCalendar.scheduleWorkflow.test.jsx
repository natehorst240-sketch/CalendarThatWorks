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
    expect(screen.getByRole('button', { name: 'Add Schedule' })).toBeInTheDocument();
  });

  it('routes empty schedule-cell click to ScheduleEditorForm instead of EventForm', async () => {
    render(<WorksCalendar events={[]} employees={employees} showAddButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('gridcell', { name: /^Alex Rivera, April 1, empty/ }));

    expect(await screen.findByRole('dialog', { name: 'Add schedule for Alex Rivera' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add event' })).not.toBeInTheDocument();
  });

  it('opens PTO-focused form when Request PTO is selected', async () => {
    render(<WorksCalendar events={[]} employees={employees} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Alex Rivera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Request PTO' }));

    expect(await screen.findByRole('dialog', { name: 'Request PTO for Alex Rivera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save PTO Request' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Type' })).not.toBeInTheDocument();
  });

  it('opens unavailable-focused form when Mark Unavailable is selected', async () => {
    render(<WorksCalendar events={[]} employees={employees} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Alex Rivera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Unavailable' }));

    expect(await screen.findByRole('dialog', { name: 'Mark Unavailable for Alex Rivera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Unavailable Time' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Type' })).not.toBeInTheDocument();
  });

  it('opens availability-focused edit form when Edit Availability is selected', async () => {
    render(
      <WorksCalendar
        employees={employees}
        events={[
          {
            id: 'avail-1',
            title: 'Clinic Hours',
            category: 'availability',
            resource: 'emp-1',
            start: new Date('2026-04-01T09:00:00.000Z'),
            end: new Date('2026-04-01T17:00:00.000Z'),
            meta: { kind: 'availability' },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Alex Rivera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Availability' }));

    expect(await screen.findByRole('dialog', { name: 'Edit Availability for Alex Rivera' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Clinic Hours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Availability Changes' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Type' })).not.toBeInTheDocument();
  });
});
