// @vitest-environment happy-dom
/**
 * Integration test for issue #101 — bidirectional employees ↔ TeamTab sync.
 *
 * Verifies that when an employee is added from the Timeline view's "+" button,
 * (a) the consumer's onEmployeeAdd callback is invoked, AND (b) the owner
 * config's team.members array is updated, so the Team tab in ConfigPanel
 * shows the new member on next open.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

import { WorksCalendar } from '../WorksCalendar.tsx';

type TeamMemberLike = { name?: string };

beforeEach(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  // Clean up any persisted config from previous runs.
  localStorage.clear();
});

describe('WorksCalendar employees ↔ TeamTab bidirectional sync (issue #101)', () => {
  it('adding an employee from TimelineView updates owner config and calls consumer callback', async () => {
    const onEmployeeAdd = vi.fn();
    const onConfigSave  = vi.fn();

    render(
      <WorksCalendar
        calendarId="test-sync-101"
        devMode
        events={[]}
        employees={[{ id: 'seed', name: 'Seed' }]}
        onEmployeeAdd={onEmployeeAdd}
        onConfigSave={onConfigSave}
      />,
    );

    // Switch to schedule/timeline view.
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));

    // Open the add-person form from the timeline header.
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }));
    const nameInput = await screen.findByPlaceholderText('Name');
    fireEvent.change(nameInput, { target: { value: 'Dana Morgan' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    // Consumer callback fired.
    await waitFor(() => expect(onEmployeeAdd).toHaveBeenCalledTimes(1));
    expect(onEmployeeAdd.mock.calls[0][0]).toMatchObject({ name: 'Dana Morgan' });

    // Owner config was patched with the new member as well.
    await waitFor(() => expect(onConfigSave).toHaveBeenCalled());
    const lastConfig = onConfigSave.mock.calls.at(-1)[0];
    expect(lastConfig.team?.members ?? []).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Dana Morgan' })]),
    );
  });

  it('adds duplicate-safe: re-adding an existing id does not double-insert in config', async () => {
    const onEmployeeAdd = vi.fn();
    const onConfigSave  = vi.fn();

    render(
      <WorksCalendar
        calendarId="test-sync-101-dup"
        devMode
        events={[]}
        employees={[{ id: 'seed', name: 'Seed' }]}
        onEmployeeAdd={onEmployeeAdd}
        onConfigSave={onConfigSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }));

    const nameInput = await screen.findByPlaceholderText('Name');
    fireEvent.change(nameInput, { target: { value: 'Echo' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    await waitFor(() => expect(onEmployeeAdd).toHaveBeenCalled());
    const lastConfig = onConfigSave.mock.calls.at(-1)[0];
    const echoCount = (lastConfig.team?.members ?? []).filter((m: TeamMemberLike) => m.name === 'Echo').length;
    expect(echoCount).toBe(1);
  });
});
