// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WorksCalendar } from '../WorksCalendar.tsx';

const scheduleTemplates = [
  {
    id: 'sched-ops',
    name: 'Ops Coverage',
    visibility: 'org',
    entries: [
      {
        title: 'Morning coverage',
        startOffsetMinutes: 0,
        durationMinutes: 120,
        rrule: 'FREQ=DAILY;COUNT=2',
      },
    ],
  },
];

describe('WorksCalendar schedule template flow', () => {
  it('shows Add Schedule button only when templates are available', () => {
    const { rerender } = render(
      <WorksCalendar
        events={[]}
        showAddButton
        scheduleTemplates={[]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Add schedule from template' })).not.toBeInTheDocument();

    rerender(
      <WorksCalendar
        events={[]}
        showAddButton
        scheduleTemplates={scheduleTemplates}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add schedule from template' })).toBeInTheDocument();
  });

  it('instantiates a schedule and fires onEventSave for generated masters', async () => {
    const onEventSave = vi.fn();

    render(
      <WorksCalendar
        events={[]}
        showAddButton
        scheduleTemplates={scheduleTemplates}
        onEventSave={onEventSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add schedule from template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => expect(onEventSave).toHaveBeenCalledTimes(1));
    expect(onEventSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Morning coverage',
        rrule: 'FREQ=DAILY;COUNT=2',
      }),
    );
  });
});
