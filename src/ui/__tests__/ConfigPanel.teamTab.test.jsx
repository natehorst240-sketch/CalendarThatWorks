// @vitest-environment happy-dom
/**
 * TeamTab — regression tests for issue #101.
 *
 * Verifies that adding/removing employees in the Team tab writes to the
 * owner config AND emits onEmployeeAdd / onEmployeeDelete so the parent's
 * employees-prop state can stay in sync with config-side edits.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { TeamTab } from '../ConfigPanel.jsx';

function renderTab({ initialMembers = [], onUpdate, onEmployeeAdd, onEmployeeDelete } = {}) {
  let currentConfig = { team: { members: initialMembers } };
  const update = onUpdate ?? vi.fn(updater => {
    currentConfig = typeof updater === 'function' ? updater(currentConfig) : { ...currentConfig, ...updater };
  });
  const add = onEmployeeAdd ?? vi.fn();
  const del = onEmployeeDelete ?? vi.fn();

  const utils = render(
    <TeamTab
      config={currentConfig}
      onUpdate={update}
      onEmployeeAdd={add}
      onEmployeeDelete={del}
    />,
  );
  return { ...utils, update, add, del, getConfig: () => currentConfig };
}

describe('TeamTab bidirectional sync (issue #101)', () => {
  it('clicking "Add employee" patches config.team.members', () => {
    const { update, getConfig } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(getConfig().team.members).toHaveLength(1);
    expect(getConfig().team.members[0]).toMatchObject({ id: 1, name: '' });
  });

  it('clicking "Add employee" also emits onEmployeeAdd upstream', () => {
    const { add } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toMatchObject({ id: 1 });
  });

  it('removing an employee patches config AND emits onEmployeeDelete', () => {
    const { update, del, getConfig } = renderTab({
      initialMembers: [
        { id: 1, name: 'Alice', color: '#111', avatar: null },
        { id: 2, name: 'Bob',   color: '#222', avatar: null },
      ],
    });
    fireEvent.click(screen.getByLabelText('Remove Alice'));
    expect(update).toHaveBeenCalledTimes(1);
    expect(getConfig().team.members).toHaveLength(1);
    expect(getConfig().team.members[0].name).toBe('Bob');
    expect(del).toHaveBeenCalledWith(1);
  });

  it('does not emit onEmployeeAdd when callback is omitted', () => {
    // No onEmployeeAdd supplied → should not throw.
    render(<TeamTab config={{ team: { members: [] } }} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    // If we got here without throwing, the test passes.
    expect(true).toBe(true);
  });

  it('rename (updateMember) patches config without emitting add/delete', () => {
    const { update, add, del } = renderTab({
      initialMembers: [{ id: 1, name: 'Alice', color: '#111', avatar: null }],
    });
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Alicia' } });
    expect(update).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('auto-assigns incrementing ids when adding multiple employees', () => {
    const { update, getConfig } = renderTab({
      initialMembers: [{ id: 5, name: 'Existing', color: '#111', avatar: null }],
    });
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    expect(getConfig().team.members.map(m => m.id)).toEqual([5, 6]);
  });
});
