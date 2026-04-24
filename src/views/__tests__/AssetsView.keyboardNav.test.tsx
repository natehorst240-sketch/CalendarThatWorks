// @vitest-environment happy-dom
/**
 * AssetsView — cross-group keyboard navigation (ticket #134-4).
 *
 * Under the TS engine's tree layout a user now navigates through a mix of
 * GroupHeader rows and data-cell rows. Arrow keys must:
 *   ↑ / ↓  — step across both kinds of rows without skipping headers,
 *   ← / →  — on a header, collapse / expand the group,
 *   →      — on an already-expanded header, descend to the first child,
 *   ←      — on an already-collapsed header, stay put (tree root has no
 *            meaningful "move to parent" target here).
 *
 * These specs exercise the contract end-to-end: they render AssetsView with a
 * 1-level tree, focus a starting point, press arrow keys, and assert the new
 * focused element (or the collapse state after the key).
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import AssetsView from '../AssetsView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1);
const evOn = (day: number) => new Date(2026, 3, day);

const events = [
  { id: 'e1', title: 'T1', start: evOn(3),  end: evOn(3),  resource: 'N100', meta: { region: 'West' } },
  { id: 'e2', title: 'T2', start: evOn(5),  end: evOn(5),  resource: 'N200', meta: { region: 'East' } },
];

function renderView(props: Record<string, unknown> = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AssetsView
        currentDate={currentDate}
        events={events}
        onEventClick={vi.fn()}
        groupBy="region"
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('AssetsView keyboard — header focus + arrow key contract', () => {
  it('ArrowDown from a group header focuses the first data cell in the group', () => {
    renderView();
    // Two headers ("region: East", "region: West") + their data rows.
    const headers = screen.getAllByRole('treeitem');
    // Focus the first header and press ArrowDown.
    headers[0]!.focus();
    fireEvent.keyDown(headers[0], { key: 'ArrowDown' });
    // Focus should have moved onto a gridcell in the row immediately below.
    const active = document.activeElement;
    expect(active?.getAttribute('role')).toBe('gridcell');
  });

  it('ArrowUp from a data cell in the first data row focuses the preceding header', () => {
    renderView();
    const headers = screen.getAllByRole('treeitem');
    const firstHeaderId = headers[0]!.getAttribute('id');
    // Find a gridcell whose row is right after the first header. The
    // rowheader in that row has data-resource; its sibling cells are the
    // day columns. We pick the first day cell (data-cell ends in "-0").
    const firstDataCell = document.querySelector('[data-cell$="-0"]');
    expect(firstDataCell).toBeTruthy();
    if (!firstDataCell) throw new Error('firstDataCell not found');
    (firstDataCell as HTMLElement).focus();
    fireEvent.keyDown(firstDataCell, { key: 'ArrowUp' });
    expect(document.activeElement?.id).toBe(firstHeaderId);
  });

  it('ArrowLeft on an expanded header collapses that group', () => {
    renderView();
    const header = screen.getAllByRole('treeitem')[0];
    expect(header!.getAttribute('aria-expanded')).toBe('true');
    header!.focus();
    fireEvent.keyDown(header, { key: 'ArrowLeft' });
    // Same text but now collapsed (headers re-render with same ARIA label).
    const refreshed = screen.getAllByRole('treeitem')[0];
    expect(refreshed!.getAttribute('aria-expanded')).toBe('false');
  });

  it('ArrowRight on a collapsed header expands it', () => {
    renderView();
    const header = screen.getAllByRole('treeitem')[0];
    fireEvent.keyDown(header, { key: 'ArrowLeft' }); // collapse first
    expect(screen!.getAllByRole!('treeitem')[0].getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(screen.getAllByRole('treeitem')[0], { key: 'ArrowRight' });
    expect(screen!.getAllByRole!('treeitem')[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('ArrowRight on an already-expanded header descends to the first child', () => {
    renderView();
    const header = screen.getAllByRole('treeitem')[0];
    expect(header!.getAttribute('aria-expanded')).toBe('true');
    header!.focus();
    fireEvent.keyDown(header, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('role')).toBe('gridcell');
  });

  it('ArrowLeft on an already-collapsed header is a no-op (focus stays)', () => {
    renderView();
    const header = screen.getAllByRole('treeitem')[0];
    fireEvent.keyDown(header, { key: 'ArrowLeft' }); // first collapse
    const collapsed = screen.getAllByRole('treeitem')[0];
    collapsed!.focus();
    fireEvent.keyDown(collapsed, { key: 'ArrowLeft' });
    // Still collapsed; focus still on the header.
    const after = screen.getAllByRole('treeitem')[0];
    expect(after!.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement?.id).toBe(collapsed!.getAttribute('id'));
  });

  it('ArrowDown steps through consecutive headers when they are adjacent (empty groups collapsed)', () => {
    renderView();
    // Collapse first header so Row 0 (header) is followed directly by Row 1
    // (the next header).
    const headers = screen.getAllByRole('treeitem');
    fireEvent.keyDown(headers[0], { key: 'ArrowLeft' });
    const refreshed = screen.getAllByRole('treeitem');
    refreshed[0]!.focus();
    fireEvent.keyDown(refreshed[0], { key: 'ArrowDown' });
    // Focus should move to the second header (treeitem), not a gridcell.
    expect(document.activeElement?.getAttribute('role')).toBe('treeitem');
    expect(document.activeElement).toBe(refreshed[1]);
  });
});
