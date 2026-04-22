import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { createRef } from 'react';

import { WorksCalendar } from '../WorksCalendar.tsx';
import type { WorksCalendarEvent } from '../types/events';

function getKinds(events: WorksCalendarEvent[]) {
  return events.map((ev: WorksCalendarEvent) => String(ev?.meta?.kind ?? '').toLowerCase());
}

function getByKind(events: WorksCalendarEvent[], kind: string) {
  return events.filter((ev: WorksCalendarEvent) => String(ev?.meta?.kind ?? '').toLowerCase() === kind);
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

  async function assignCoverageTo(nameRegex: string | RegExp) {
    fireEvent.click(await screen.findByRole('button', { name: 'Shift not covered — click to assign coverage' }));
    fireEvent.click(await screen.findByRole('button', { name: nameRegex }));
  }

  it('creates an open-shift record when PTO overlaps a shift', async () => {
    const apiRef = createRef<any>();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents();
      const kinds = getKinds(visible);
      expect(kinds).toContain('open-shift');
    }, { timeout: 10000 });
  }, 30000);

  it('creates a PTO availability event and emits onAvailabilitySave', async () => {
    const apiRef = createRef<any>();
    const onAvailabilitySave = vi.fn();

    render(
      <WorksCalendar
        ref={apiRef}
        employees={employees}
        events={[baseShift]}
        onAvailabilitySave={onAvailabilitySave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();

    await waitFor(() => {
      expect(onAvailabilitySave).toHaveBeenCalledTimes(1);
      const saved = onAvailabilitySave.mock.calls[0][0];
      expect(saved.category).toBe('pto');
      expect(saved.meta?.kind).toBe('pto');
      expect(saved.resource).toBe('emp-1');

      const visible = apiRef.current.getVisibleEvents() as WorksCalendarEvent[];
      const ptoEvents = visible.filter((ev: WorksCalendarEvent) => String(ev?.meta?.kind ?? '') === 'pto');
      expect(ptoEvents.length).toBeGreaterThan(0);
    });
  }, 30000);

  it('does not create duplicate open-shift records when PTO is re-saved', async () => {
    const apiRef = createRef<any>();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();
    await screen.findByRole('button', { name: 'Shift not covered — click to assign coverage' });
    await requestPtoForAlex();

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents() as WorksCalendarEvent[];
      const openShifts = getByKind(visible, 'open-shift').filter(
        (ev: WorksCalendarEvent) => String(ev.meta?.sourceShiftId ?? '') === 'shift-1',
      );
      expect(openShifts).toHaveLength(1);
    });
  }, 30000);

  it('assigns coverage by updating shift/open-shift state and creating one mirror event', async () => {
    const apiRef = createRef<any>();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();
    await screen.findByRole('button', { name: 'Shift not covered — click to assign coverage' });
    await assignCoverageTo(/^Bailey Chen — RN$/);

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents() as WorksCalendarEvent[];
      const shift = visible.find((ev: WorksCalendarEvent) => String(ev.id) === 'shift-1');
      expect(String(shift.meta?.coveredBy ?? '')).toBe('emp-2');

      const openShift = getByKind(visible, 'open-shift')[0];
      expect(openShift).toBeTruthy();
      expect(String(openShift.meta?.coveredBy ?? '')).toBe('emp-2');
      expect(openShift.meta?.status).toBe('covered');

      const mirrored = getByKind(visible, 'covering');
      expect(mirrored).toHaveLength(1);
      expect(String(mirrored[0].meta?.sourceShiftId ?? '')).toBe('shift-1');
      expect(String(mirrored[0].meta?.coveredEmployeeId ?? '')).toBe('emp-1');
    });
  }, 30000);

  it('clears linked schedule metadata and open/covering events when status is cleared', async () => {
    const apiRef = createRef<any>();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();
    await assignCoverageTo(/^Bailey Chen — RN$/);

    fireEvent.click(screen.getByRole('button', { name: 'Set shift availability' }));
    fireEvent.click(screen.getByRole('button', { name: /Clear Status/ }));

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents() as WorksCalendarEvent[];
      const kinds = getKinds(visible);
      expect(kinds).not.toContain('open-shift');
      expect(kinds).not.toContain('covering');
      expect(kinds).not.toContain('covering-shift');

      const shift = visible.find((ev: WorksCalendarEvent) => String(ev.id) === 'shift-1');
      expect(shift.meta?.shiftStatus).toBeUndefined();
      expect(shift.meta?.coveredBy).toBeUndefined();
      expect(shift.meta?.openShiftId).toBeUndefined();
    });
  }, 30000);

  it('emits onEventSave/onEventDelete for linked schedule records during coverage + clear', async () => {
    const apiRef = createRef<any>();
    const onEventSave = vi.fn();
    const onEventDelete = vi.fn();
    render(
      <WorksCalendar
        ref={apiRef}
        employees={employees}
        events={[baseShift]}
        onEventSave={onEventSave}
        onEventDelete={onEventDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();
    await assignCoverageTo(/^Bailey Chen — RN$/);
    fireEvent.click(screen.getByRole('button', { name: 'Set shift availability' }));
    fireEvent.click(screen.getByRole('button', { name: /Clear Status/ }));

    await waitFor(() => {
      expect(onEventSave.mock.calls.length).toBeGreaterThan(0);
      expect(onEventDelete.mock.calls.length).toBeGreaterThan(0);
      const savedShiftWithCoverage = onEventSave.mock.calls
        .map(([payload]) => payload)
        .find(
          (payload) => String(payload?.id ?? '') === 'shift-1'
            && String(payload?.meta?.coveredBy ?? '') === 'emp-2'
            && String(payload?.meta?.shiftStatus ?? '') === 'pto'
            && String(payload?.meta?.openShiftId ?? '') !== '',
        );
      expect(savedShiftWithCoverage).toBeTruthy();
    });
  }, 30000);

  it('keeps exactly one covering record when coverage is reassigned', async () => {
    const apiRef = createRef<any>();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();

    await assignCoverageTo(/^Bailey Chen — RN$/);

    fireEvent.click(screen.getByRole('button', { name: 'Set shift availability' }));
    fireEvent.click(screen.getByRole('button', { name: /Clear Status/ }));
    await requestPtoForAlex();

    await assignCoverageTo(/^Casey Patel — RN$/);

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents() as WorksCalendarEvent[];
      const coveringEvents = visible.filter((ev: WorksCalendarEvent) => {
        const kind = String(ev?.meta?.kind ?? '').toLowerCase();
        return kind === 'covering' || kind === 'covering-shift';
      });
      expect(coveringEvents).toHaveLength(1);

      const shift = visible.find((ev: WorksCalendarEvent) => String(ev.id) === 'shift-1');
      expect(String(shift.meta?.coveredBy ?? '')).toBe('emp-3');
    });
  }, 30000);

  it('allows removing coverage after assignment from the covered status pill', async () => {
    const apiRef = createRef<any>();
    render(<WorksCalendar ref={apiRef} employees={employees} events={[baseShift]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await requestPtoForAlex();
    await assignCoverageTo(/^Bailey Chen — RN$/);

    fireEvent.click(await screen.findByRole('button', { name: /Shift covered by Bailey Chen — click to edit coverage/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Remove coverage/i }));

    await waitFor(() => {
      const visible = apiRef.current.getVisibleEvents() as WorksCalendarEvent[];
      const shift = visible.find((ev: WorksCalendarEvent) => String(ev.id) === 'shift-1');
      expect(shift.meta?.coveredBy).toBeNull();

      const openShift = getByKind(visible, 'open-shift')[0];
      expect(openShift).toBeTruthy();
      expect(openShift.meta?.coveredBy).toBeNull();
      expect(openShift.meta?.status).toBe('open');

      const coveringEvents = getByKind(visible, 'covering');
      expect(coveringEvents).toHaveLength(0);
    });
  }, 30000);
});
