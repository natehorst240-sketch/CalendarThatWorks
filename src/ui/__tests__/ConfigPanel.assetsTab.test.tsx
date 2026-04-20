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

import { AssetsTab } from '../ConfigPanel';
import { getAssetStatus } from '../assetStatus';

function renderTab({ initialConfig = {}, onUpdate, items = [] }: any = {}) {
  let currentConfig = { ...initialConfig };
  const update = onUpdate ?? vi.fn(updater => {
    currentConfig = typeof updater === 'function'
      ? updater(currentConfig)
      : { ...currentConfig, ...updater };
  });
  const utils = render(<AssetsTab config={currentConfig} onUpdate={update} items={items} />);
  const rerender = () =>
    utils.rerender(<AssetsTab config={currentConfig} onUpdate={update} items={items} />);
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

describe('getAssetStatus', () => {
  const now = new Date('2026-04-20T12:00:00Z');
  const overlapStart = new Date('2026-04-20T11:00:00Z');
  const overlapEnd = new Date('2026-04-20T13:00:00Z');
  const futureEnd = new Date('2026-04-20T18:00:00Z');

  it('returns assigned for active overlapping bookings', () => {
    const status = getAssetStatus('asset-1', [{
      resource: 'asset-1',
      start: overlapStart,
      end: overlapEnd,
      status: 'confirmed',
    }], now);
    expect(status).toBe('assigned');
  });

  it('does not treat cancelled overlapping bookings as assigned', () => {
    const status = getAssetStatus('asset-1', [{
      resource: 'asset-1',
      start: overlapStart,
      end: overlapEnd,
      status: 'cancelled',
    }], now);
    expect(status).toBe('available');
  });

  it('does not treat requested overlapping bookings as assigned', () => {
    const status = getAssetStatus('asset-1', [{
      resource: 'asset-1',
      start: overlapStart,
      end: overlapEnd,
      status: 'confirmed',
      meta: { approvalStage: { stage: 'requested' } },
    }], now);
    expect(status).toBe('requested');
  });

  it('prefers assigned over requested when both are present', () => {
    const status = getAssetStatus('asset-1', [
      {
        resource: 'asset-1',
        start: overlapStart,
        end: overlapEnd,
        status: 'confirmed',
        meta: { approvalStage: { stage: 'requested' } },
      },
      {
        resource: 'asset-1',
        start: overlapStart,
        end: overlapEnd,
        status: 'confirmed',
        meta: { approvalStage: { stage: 'approved' } },
      },
      {
        resource: 'asset-1',
        start: new Date('2026-04-20T17:00:00Z'),
        end: futureEnd,
        status: 'confirmed',
        meta: { approvalStage: { stage: 'requested' } },
      },
    ], now);
    expect(status).toBe('assigned');
  });
});

describe('AssetsTab — status badge rendering', () => {
  it('shows a requested status badge when only requested bookings exist', () => {
    renderTab({
      initialConfig: { assets: [{ id: 'n100', label: 'N100', meta: {} }] },
      items: [{
        resource: 'n100',
        start: new Date('2020-01-01T00:00:00Z'),
        end: new Date('2100-01-01T00:00:00Z'),
        status: 'confirmed',
        meta: { approvalStage: { stage: 'requested' } },
      }],
    });
    expect(screen.getByLabelText('Status: requested')).toBeInTheDocument();
  });
});
