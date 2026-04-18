// @vitest-environment happy-dom
/**
 * AssetsTab — ticket #134-9.
 *
 * Verifies the owner-editable asset registry. The tab mutates config.assets
 * via onUpdate; WorksCalendar merges `props.assets ?? config.assets` before
 * handing the list to AssetsView so a calendar owner can add, rename,
 * reorder, or remove a fleet entry without any host-app redeploy.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { AssetsTab } from '../ConfigPanel.jsx';

function renderTab({ initialConfig = {}, onUpdate } = {}) {
  let currentConfig = { ...initialConfig };
  const update = onUpdate ?? vi.fn(updater => {
    currentConfig = typeof updater === 'function'
      ? updater(currentConfig)
      : { ...currentConfig, ...updater };
  });
  const utils = render(<AssetsTab config={currentConfig} onUpdate={update} />);
  const rerender = () =>
    utils.rerender(<AssetsTab config={currentConfig} onUpdate={update} />);
  return { ...utils, update, getConfig: () => currentConfig, rerender };
}

describe('AssetsTab — defaults', () => {
  it('renders no rows when config.assets is unset', () => {
    renderTab();
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  it('shows the "Add asset" button out of the box', () => {
    renderTab();
    expect(screen.getByRole('button', { name: /Add asset/i })).toBeInTheDocument();
  });
});

describe('AssetsTab — mutations', () => {
  it('Add asset appends a new row with a unique id', () => {
    const { getConfig, rerender } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add asset/i }));
    rerender();
    const assets = getConfig().assets;
    expect(assets).toHaveLength(1);
    expect(assets[0].id).toBe('asset-1');
    expect(assets[0].label).toBe('Asset 1');

    fireEvent.click(screen.getByRole('button', { name: /Add asset/i }));
    rerender();
    expect(getConfig().assets).toHaveLength(2);
    expect(getConfig().assets[1].id).toBe('asset-2');
  });

  it('editing a label writes config.assets[i].label', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: { assets: [{ id: 'n100aa', label: 'N100AA', meta: {} }] },
    });
    const input = screen.getByLabelText('Label for n100aa');
    fireEvent.change(input, { target: { value: 'Alpha 1' } });
    rerender();
    expect(getConfig().assets[0].label).toBe('Alpha 1');
  });

  it('editing an id keeps the trimmed value', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: { assets: [{ id: 'old', label: 'Old', meta: {} }] },
    });
    const input = screen.getByLabelText('Id for Old');
    fireEvent.change(input, { target: { value: '  new-id  ' } });
    rerender();
    expect(getConfig().assets[0].id).toBe('new-id');
  });

  it('editing a group persists', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: { assets: [{ id: 'a', label: 'A', meta: {} }] },
    });
    const input = screen.getByLabelText('Group for A');
    fireEvent.change(input, { target: { value: 'West' } });
    rerender();
    expect(getConfig().assets[0].group).toBe('West');
  });

  it('editing the sublabel writes to meta.sublabel', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: { assets: [{ id: 'a', label: 'A', meta: {} }] },
    });
    const input = screen.getByLabelText('Sublabel for A');
    fireEvent.change(input, { target: { value: 'CJ3' } });
    rerender();
    expect(getConfig().assets[0].meta.sublabel).toBe('CJ3');
  });

  it('Remove button drops the asset at the expected index', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: {
        assets: [
          { id: 'a', label: 'Alpha', meta: {} },
          { id: 'b', label: 'Bravo', meta: {} },
          { id: 'c', label: 'Charlie', meta: {} },
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bravo' }));
    rerender();
    const ids = getConfig().assets.map(a => a.id);
    expect(ids).toEqual(['a', 'c']);
  });
});

describe('AssetsTab — reorder', () => {
  const initialConfig = {
    assets: [
      { id: 'a', label: 'Alpha', meta: {} },
      { id: 'b', label: 'Bravo', meta: {} },
      { id: 'c', label: 'Charlie', meta: {} },
    ],
  };

  it('Move down swaps with the next entry', () => {
    const { getConfig, rerender } = renderTab({ initialConfig });
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    rerender();
    expect(getConfig().assets.map(a => a.id)).toEqual(['b', 'a', 'c']);
  });

  it('Move up swaps with the previous entry', () => {
    const { getConfig, rerender } = renderTab({ initialConfig });
    fireEvent.click(screen.getByRole('button', { name: 'Move Charlie up' }));
    rerender();
    expect(getConfig().assets.map(a => a.id)).toEqual(['a', 'c', 'b']);
  });

  it('Move up is disabled on the first row', () => {
    renderTab({ initialConfig });
    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
  });

  it('Move down is disabled on the last row', () => {
    renderTab({ initialConfig });
    expect(screen.getByRole('button', { name: 'Move Charlie down' })).toBeDisabled();
  });
});
