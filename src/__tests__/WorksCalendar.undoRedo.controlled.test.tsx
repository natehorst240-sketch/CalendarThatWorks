// @vitest-environment happy-dom
/**
 * Regression test for issue #152 — undo/redo must survive the
 * controlled-events prop round-trip.
 *
 * Before the fix, `onEventSave` updated the host's events array, which
 * flowed back as the `events` prop and caused the allNormalized effect to
 * call `undoManagerRef.clear()` milliseconds after recording the snapshot.
 * Pressing Ctrl+Z then did nothing.
 */
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRef, useState } from 'react';
import '@testing-library/jest-dom';

import { WorksCalendar, type CalendarApi } from '../WorksCalendar.tsx';

beforeEach(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  localStorage.clear();
});

function ControlledHost({ apiRef }: { apiRef: React.RefObject<CalendarApi> }) {
  const [events, setEvents] = useState<any[]>([]);
  return (
    <WorksCalendar
      ref={apiRef}
      calendarId="test-undo-152"
      events={events}
      showAddButton
      onEventSave={(saved) =>
        setEvents((prev) => {
          const idx = prev.findIndex((e) => e.id === saved.id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = saved;
            return next;
          }
          return [...prev, saved];
        })
      }
    />
  );
}

describe('WorksCalendar undo/redo — controlled events (issue #152)', () => {
  it('canUndo stays true after the onEventSave prop round-trip', async () => {
    const apiRef = createRef<CalendarApi>();
    render(<ControlledHost apiRef={apiRef} />);

    // Stack is empty before any mutation.
    expect(apiRef.current?.canUndo).toBe(false);

    // Open the add-event modal.
    fireEvent.click(screen.getByRole('button', { name: 'Add new event' }));
    const titleInput = await screen.findByLabelText(/Title/);
    fireEvent.change(titleInput, { target: { value: 'Undo Smoke Test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));

    // Wait for the event to propagate back through the controlled prop,
    // which is when the allNormalized effect previously wiped the stack.
    await waitFor(() => {
      expect(apiRef.current?.getVisibleEvents().length).toBe(1);
    });

    // Stack must still contain the pre-create snapshot.
    expect(apiRef.current?.canUndo).toBe(true);

    // Undo should revert the engine to the empty pre-create state.
    const did = apiRef.current!.undo();
    expect(did).toBe(true);

    await waitFor(() => {
      expect(apiRef.current?.getVisibleEvents().length).toBe(0);
    });
    expect(apiRef.current?.canUndo).toBe(false);
    expect(apiRef.current?.canRedo).toBe(true);
  });
});
