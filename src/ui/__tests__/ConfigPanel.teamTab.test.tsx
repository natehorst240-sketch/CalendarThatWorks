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

import { TeamTab } from '../ConfigPanel';

function renderTab({
  initialMembers = [],
  initialRoles = [],
  initialBases = [],
  onUpdate,
  onEmployeeAdd,
  onEmployeeDelete,
}: any = {}) {
  let currentConfig = { team: { members: initialMembers, roles: initialRoles, bases: initialBases } };
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
  it('committing a new employee (with name) patches config.team.members', () => {
    const { update, getConfig } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    const input = screen.getByPlaceholderText('Employee name');
    fireEvent.change(input, { target: { value: 'Nora' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(getConfig().team.members).toHaveLength(1);
    expect(getConfig().team.members[0]).toMatchObject({ id: 1, name: 'Nora' });
  });

  it('committing a new employee emits onEmployeeAdd upstream', () => {
    const { add } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    const input = screen.getByPlaceholderText('Employee name');
    fireEvent.change(input, { target: { value: 'Nora' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toMatchObject({ id: 1, name: 'Nora' });
  });

  it('blank name does not add a member (prevents ghost rows in schedule)', () => {
    const { update, add, getConfig } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    const input = screen.getByPlaceholderText('Employee name');
    // Submitting without typing should cancel — no add.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(getConfig().team.members).toHaveLength(0);
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

  it('does not throw when onEmployeeAdd is omitted', () => {
    render(<TeamTab config={{ team: { members: [] } }} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    const input = screen.getByPlaceholderText('Employee name');
    fireEvent.change(input, { target: { value: 'Nora' } });
    fireEvent.keyDown(input, { key: 'Enter' });
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
    const { getConfig } = renderTab({
      initialMembers: [{ id: 5, name: 'Existing', color: '#111', avatar: null }],
    });
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    // The pending input is the newly-added one (empty value); filter it out.
    const inputs = screen.getAllByPlaceholderText('Employee name');
    const pending = inputs.find(el => (el as HTMLInputElement).value === '');
    expect(pending).toBeDefined();
    if (!pending) {
      throw new Error('Expected a pending employee input to exist');
    }
    fireEvent.change(pending, { target: { value: 'Nora' } });
    fireEvent.keyDown(pending, { key: 'Enter' });
    expect(getConfig().team.members.map((m: { id: number }) => m.id)).toEqual([5, 6]);
  });

  it('keeps role/base optional when roles and bases exist', () => {
    const { add, getConfig } = renderTab({
      initialRoles: ['Nurse'],
      initialBases: [{ id: 'b-1', name: 'Main' }],
    });
    fireEvent.click(screen.getByRole('button', { name: /Add employee/ }));
    const input = screen.getByPlaceholderText('Employee name');
    fireEvent.change(input, { target: { value: 'Jamie' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(add).toHaveBeenCalledTimes(1);
    expect(getConfig().team.members[0]).toMatchObject({ id: 1, name: 'Jamie' });
    expect(getConfig().team.members[0]).not.toHaveProperty('role');
    expect(getConfig().team.members[0]).not.toHaveProperty('base');
  });
});
