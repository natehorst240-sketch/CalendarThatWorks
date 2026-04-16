// @vitest-environment happy-dom
/**
 * SmartViewsTab — regression tests for issue #100.
 *
 * Verifies the pencil/manage button reliably opens the edit UI for saved
 * views, switches between views cleanly, and does not toggle the editor
 * closed on repeated clicks.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

import { SmartViewsTab } from '../ConfigPanel.jsx';

const savedViews = [
  { id: 'v1', name: 'Alpha',   color: '#111', conditions: [{ field: 'category', operator: 'is', value: 'Cat-A', logic: 'AND' }] },
  { id: 'v2', name: 'Bravo',   color: '#222', conditions: [{ field: 'category', operator: 'is', value: 'Cat-B', logic: 'AND' }] },
  { id: 'v3', name: 'Charlie', color: '#333', conditions: [{ field: 'title',    operator: 'contains', value: 'zzz', logic: 'AND' }] },
];

function renderTab(overrides = {}) {
  return render(
    <SmartViewsTab
      categories={['Cat-A', 'Cat-B']}
      resources={['alice', 'bob']}
      savedViews={savedViews}
      onSaveView={overrides.onSaveView ?? vi.fn()}
      onUpdateView={overrides.onUpdateView ?? vi.fn()}
      onDeleteView={overrides.onDeleteView ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  // happy-dom doesn't implement scrollIntoView; stub it.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
});

describe('SmartViewsTab edit UI (issue #100)', () => {
  it('renders a pencil button for each saved view', () => {
    renderTab();
    expect(screen.getByLabelText('Edit Alpha')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit Bravo')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit Charlie')).toBeInTheDocument();
  });

  it('clicking pencil opens the editor with that view pre-filled', () => {
    renderTab();
    fireEvent.click(screen.getByLabelText('Edit Bravo'));
    expect(screen.getByText(/Editing conditions for "Bravo"/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bravo')).toBeInTheDocument();
  });

  it('clicking pencil a second time on the same view does NOT close the editor', () => {
    renderTab();
    const pencil = screen.getByLabelText('Edit Bravo');
    fireEvent.click(pencil);
    fireEvent.click(pencil);
    // Editor must still be open and hydrated with Bravo.
    expect(screen.getByText(/Editing conditions for "Bravo"/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bravo')).toBeInTheDocument();
  });

  it('switching pencil from one view to another re-hydrates the editor', () => {
    renderTab();
    fireEvent.click(screen.getByLabelText('Edit Alpha'));
    expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Edit Charlie'));
    expect(screen.getByDisplayValue('Charlie')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Alpha')).not.toBeInTheDocument();
  });

  it('scrolls the editor into view when a pencil is clicked', () => {
    renderTab();
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    fireEvent.click(screen.getByLabelText('Edit Bravo'));
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('focuses the view-name input when editing opens', () => {
    renderTab();
    fireEvent.click(screen.getByLabelText('Edit Bravo'));
    expect(document.activeElement).toBe(screen.getByDisplayValue('Bravo'));
  });

  it('Cancel button clears edit mode and returns to create-new state', () => {
    renderTab();
    fireEvent.click(screen.getByLabelText('Edit Alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Editing conditions for/)).not.toBeInTheDocument();
    expect(screen.getByText(/Create Smart Views once categories/)).toBeInTheDocument();
  });

  it('Update Smart View button calls onUpdateView with the view id', () => {
    const onUpdateView = vi.fn();
    renderTab({ onUpdateView });
    fireEvent.click(screen.getByLabelText('Edit Alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'Update Smart View' }));
    expect(onUpdateView).toHaveBeenCalledTimes(1);
    expect(onUpdateView.mock.calls[0][0]).toBe('v1');
    expect(onUpdateView.mock.calls[0][1]).toMatchObject({ name: 'Alpha' });
  });
});
