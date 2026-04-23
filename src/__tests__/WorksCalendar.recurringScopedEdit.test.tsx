// @vitest-environment happy-dom
/**
 * Regression coverage for the recurring-event cluster: #149, #146, #150.
 *
 * - #150: editing a recurring instance must preopen the EventForm with the
 *   master series' RRULE so users can see the cadence and not accidentally
 *   strip it on save.
 * - #149/#146: a "This event only" edit produces two EventChanges from the
 *   engine (master update with EXDATE + detached occurrence) and both must
 *   reach the host's onEventSave callback so the controlled events array
 *   stays in sync.
 */
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRef, useState } from 'react';
import '@testing-library/jest-dom';

import { WorksCalendar, type CalendarApi } from '../WorksCalendar.tsx';

const RECURRING_MASTER = {
  id: 'rec-master-1',
  title: 'Daily Standup',
  start: new Date('2026-04-15T09:00:00.000Z'),
  end:   new Date('2026-04-15T09:30:00.000Z'),
  category: 'Meeting',
  rrule: 'FREQ=DAILY',
};

function ControlledHost({
  apiRef,
  onEventSave,
  initialEvents,
}: {
  apiRef: React.RefObject<CalendarApi>;
  onEventSave: (ev: any) => void;
  initialEvents: any[];
}) {
  const [events, setEvents] = useState<any[]>(initialEvents);
  return (
    <WorksCalendar
      ref={apiRef}
      calendarId="test-recurring-cluster"
      events={events}
      initialView="month"
      onEventSave={(saved) => {
        onEventSave(saved);
        setEvents((prev) => {
          const idx = prev.findIndex((e) => e.id === saved.id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = saved;
            return next;
          }
          return [...prev, saved];
        });
      }}
    />
  );
}

beforeEach(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-04-20T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function firstOccurrenceId(api: CalendarApi, masterId: string): string {
  const occ = api
    .getVisibleEvents()
    .find((e: any) => (e as any)._eventId === masterId || String(e.id ?? '').startsWith(masterId));
  if (!occ) throw new Error('No expanded occurrence found for master ' + masterId);
  return String(occ.id);
}

describe('WorksCalendar recurring-event cluster (issues #149, #146, #150)', () => {
  it('#150: Edit from HoverCard pre-fills Repeat with the master series RRULE', async () => {
    const apiRef = createRef<CalendarApi>();
    render(
      <ControlledHost
        apiRef={apiRef}
        onEventSave={() => {}}
        initialEvents={[RECURRING_MASTER]}
      />,
    );

    // Open the HoverCard for the first expanded occurrence.
    const occId = firstOccurrenceId(apiRef.current!, 'rec-master-1');
    act(() => apiRef.current!.openEvent(occId));

    const hoverCard = await screen.findByRole('dialog', {
      name: /Event details: Daily Standup/,
    });
    fireEvent.click(within(hoverCard).getByRole('button', { name: 'Edit event' }));

    // EventForm should now be open and Repeat should reflect FREQ=DAILY.
    const repeatSelect = await screen.findByLabelText(/^Repeat$/);
    expect((repeatSelect as HTMLSelectElement).value).toBe('daily');
  });

  it('#149 + #146: "This event only" emits onEventSave for both the master and the detached occurrence', async () => {

    const onEventSave = vi.fn();
    const apiRef = createRef<CalendarApi>();
    render(
      <ControlledHost
        apiRef={apiRef}
        onEventSave={onEventSave}
        initialEvents={[RECURRING_MASTER]}
      />,
    );

    const occId = firstOccurrenceId(apiRef.current!, 'rec-master-1');
    act(() => apiRef.current!.openEvent(occId));

    const hoverCard = await screen.findByRole('dialog', {
      name: /Event details: Daily Standup/,
    });
    fireEvent.click(within(hoverCard).getByRole('button', { name: 'Edit event' }));

    // Change the title and save — this fires the 3-scope picker.
    const titleInput = await screen.findByLabelText(/Title/);
    fireEvent.change(titleInput, { target: { value: 'Daily Standup (edited only this)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    // Scope dialog appears. Default selection is "This event only".
    const scopeDialog = await screen.findByRole('dialog', { name: /recurring/i });
    fireEvent.click(within(scopeDialog).getByRole('button', { name: /^Edit$/ }));

    // Two events must reach the host: updated master (with exdate) AND the
    // new detached occurrence carrying the edited title. Without the fix
    // from commit a5ffbc2 only the master update would be emitted.
    await waitFor(() => {
      expect(onEventSave.mock.calls.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 10000 });

    const savedPayloads = onEventSave.mock.calls.map(([p]) => p);
    const masterUpdate = savedPayloads.find((p) => p.id === 'rec-master-1');
    const detached     = savedPayloads.find((p) => p.id !== 'rec-master-1');

    expect(masterUpdate).toBeDefined();
    expect(masterUpdate.rrule).toBe('FREQ=DAILY');
    expect(Array.isArray(masterUpdate.exdates) ? masterUpdate.exdates.length : 0).toBeGreaterThan(0);

    expect(detached).toBeDefined();
    expect(detached.title).toBe('Daily Standup (edited only this)');
    expect(detached.rrule ?? null).toBeNull();
  }, 15000);
});
