// @vitest-environment happy-dom
/**
 * WorksCalendar — pool booking end-to-end (issue #212).
 *
 * Acceptance criterion from the issue:
 *   "UI test: booking against a pool in the Assets view resolves to a
 *    concrete resource in the saved event."
 *
 * The test mounts the full WorksCalendar in Assets view, seeds a pool
 * with two members, clicks an empty cell on the pool row to open the
 * EventForm, submits with a title, and asserts the onEventSave payload:
 *   - carries a concrete `resource` that is one of the pool members
 *     (not the pool id, not null),
 *   - preserves `meta.resolvedFromPoolId` for audit.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import { WorksCalendar } from '../WorksCalendar.tsx';

describe('WorksCalendar — pool booking (end-to-end, #212)', () => {
  const assets = [
    { id: 'N121AB', label: 'N121AB', meta: {} },
    { id: 'N505CD', label: 'N505CD', meta: {} },
  ];

  const pools = [
    {
      id:        'fleet-west',
      name:      'West Fleet',
      memberIds: ['N121AB', 'N505CD'],
      strategy:  'first-available' as const,
    },
  ];

  it('resolves the pool to a concrete member on save', async () => {
    const onEventSave = vi.fn();

    render(
      <WorksCalendar
        devMode
        initialView="assets"
        assets={assets}
        pools={pools}
        events={[]}
        onEventSave={onEventSave}
      />,
    );

    // Locate the pool row by its rowheader aria-label and click its first
    // empty day cell. Day 0 is guaranteed unoccupied (events: []) so the
    // click opens the EventForm seeded with the pool id.
    const poolHeader = await screen.findByRole('rowheader', { name: 'Pool: West Fleet' });
    const poolRow = poolHeader.closest('[role=row]') as HTMLElement;
    const firstCell = poolRow.querySelector('[role=gridcell]') as HTMLElement;
    expect(firstCell).toBeTruthy();
    fireEvent.click(firstCell);

    // Form should open with an "Add Event" title — empty draft apart from
    // the seeded start/end/resourcePoolId.
    const titleInput = await screen.findByLabelText(/^Title/);
    fireEvent.change(titleInput, { target: { value: 'Charter run' } });

    const saveBtn = screen.getByRole('button', { name: 'Add Event' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onEventSave).toHaveBeenCalledTimes(1);
    });

    const saved = onEventSave.mock.calls[0][0];
    expect(saved.title).toBe('Charter run');
    // Concrete resource in the pool — not the pool id, not null.
    expect(['N121AB', 'N505CD']).toContain(saved.resource);
    // Audit trail preserves which pool the booking was drawn from.
    expect(saved.meta?.resolvedFromPoolId).toBe('fleet-west');
  }, 30000);
});
