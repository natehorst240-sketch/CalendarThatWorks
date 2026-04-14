import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { createRef } from 'react';

import { WorksCalendar } from '../WorksCalendar.tsx';

function getKinds(events) {
  return events.map((ev) => String(ev?.meta?.kind ?? ev?.kind ?? '').toLowerCase());
}

describe('WorksCalendar schedule model integration', () => {
  const employees = [
    { id: 'emp-1', name: 'Alex Rivera', role: 'RN' },
    { id: 'emp-2', name: 'Bailey Chen', role: 'RN' },
    { id: 'emp-3', name: 'Casey Patel', role: 'RN' },
  ];

  const baseShift = {
    id: 'shift-1',
    title: 'Night Shift',
    category: 'on-call',
    resource: 'emp-1',
    start: new Date('2026-04-01T00:00:00.000Z'),
    end: new Date('2026-04-01T08:00:00.000Z'),
    meta: { kind: 'shift', employeeId: 'emp-1' },
  };

  async function requestPtoForAlex() {
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Alex Rivera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Request PTO' }));
    fireEvent.change(screen.getByLabelText('Start *'), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText('End *'), { target: { value: '2026-04-02' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save PTO Request' }));
  }

  it('creates an open-shift record when PTO overlaps a shift', async () => {
    const apiRef = createRef();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents();
      const kinds = getKinds(visible);
      expect(kinds).toContain('open-shift');
    });
  });

  it('clears linked schedule metadata and open/covering events when status is cleared', async () => {
    const apiRef = createRef();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();

    fireEvent.click(await screen.findByRole('button', { name: 'Shift not covered — click to assign coverage' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Bailey Chen — RN$/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Set shift availability' }));
    fireEvent.click(screen.getByRole('button', { name: /Clear Status/ }));

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents();
      const kinds = getKinds(visible);
      expect(kinds).not.toContain('open-shift');
      expect(kinds).not.toContain('covering');
      expect(kinds).not.toContain('covering-shift');

      const shift = visible.find((ev) => String(ev.id) === 'shift-1');
      expect(shift.meta?.shiftStatus).toBeUndefined();
      expect(shift.meta?.coveredBy).toBeUndefined();
      expect(shift.meta?.openShiftId).toBeUndefined();
    });
  });

  it('keeps exactly one covering record when coverage is reassigned', async () => {
    const apiRef = createRef();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();

    fireEvent.click(await screen.findByRole('button', { name: 'Shift not covered — click to assign coverage' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Bailey Chen — RN$/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Set shift availability' }));
    fireEvent.click(screen.getByRole('button', { name: /Clear Status/ }));
    await requestPtoForAlex();

    fireEvent.click(await screen.findByRole('button', { name: 'Shift not covered — click to assign coverage' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Casey Patel — RN$/ }));

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents();
      const coveringEvents = visible.filter((ev) => {
        const kind = String(ev?.meta?.kind ?? '').toLowerCase();
        return kind === 'covering' || kind === 'covering-shift';
      });
      expect(coveringEvents).toHaveLength(1);

      const shift = visible.find((ev) => String(ev.id) === 'shift-1');
      expect(String(shift.meta?.coveredBy ?? '')).toBe('emp-3');
    });
  }, 15000);
});
