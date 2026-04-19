import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileBar from '../ProfileBar';

const BASE_VIEW = {
  id: 'view-1',
  name: 'Sarah\'s Week',
  filters: {},
  color: '#3b82f6',
};

function renderBar(extraProps: any = {}) {
  const onApply = vi.fn();
  const onAdd = vi.fn();
  const onResave = vi.fn();
  const onUpdate = vi.fn();
  const onDelete = vi.fn();

  render(
    <ProfileBar
      views={[BASE_VIEW]}
      activeId={BASE_VIEW.id}
      isDirty={false}
      onApply={onApply}
      onAdd={onAdd}
      onResave={onResave}
      onUpdate={onUpdate}
      onDelete={onDelete}
      {...extraProps}
    />
  );

  return { onApply, onAdd, onResave, onUpdate, onDelete };
}

describe('ProfileBar manage pencil behavior', () => {
  it('opens manage menu when no edit handler is provided', () => {
    renderBar();

    fireEvent.click(screen.getByLabelText('Manage saved view'));

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Update with current filters')).toBeInTheDocument();
  });

  it('opens Smart View editor directly when edit handler is provided', () => {
    const onEditConditions = vi.fn();
    renderBar({ onEditConditions });

    fireEvent.click(screen.getByLabelText('Edit saved view'));

    expect(onEditConditions).toHaveBeenCalledTimes(1);
    expect(onEditConditions).toHaveBeenCalledWith(BASE_VIEW.id);
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });
});
