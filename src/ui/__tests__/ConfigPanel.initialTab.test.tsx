// @vitest-environment happy-dom
/**
 * ConfigPanel — initialTab deep-link (ticket #134-10).
 *
 * The Assets view's on-page toolbar opens ConfigPanel focused on the Assets
 * tab via useOwnerConfig.openConfigToTab('assets'). That path is only
 * reliable if ConfigPanel honors a string `initialTab` prop at mount and when
 * the value changes on a subsequent deep-link.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import ConfigPanel from '../ConfigPanel';
import { DEFAULT_CONFIG } from '../../core/configSchema';

function mount(props = {}) {
  return render(
    <ConfigPanel
      config={DEFAULT_CONFIG}
      schema={{ fields: [] }}
      items={[]}
      categories={[]}
      resources={[]}
      onUpdate={vi.fn()}
      onClose={vi.fn()}
      savedViews={[]}
      onUpdateView={vi.fn()}
      onDeleteView={vi.fn()}
      {...props}
    />,
  );
}

describe('ConfigPanel — initialTab', () => {
  it('opens on the Setup tab when initialTab is omitted', () => {
    mount();
    expect(screen.getByRole('tab', { name: 'Setup' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens directly on the requested tab when initialTab is provided', () => {
    mount({ initialTab: 'assets' });
    expect(screen.getByRole('tab', { name: 'Assets' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ignores an unknown initialTab value and falls back to Setup', () => {
    mount({ initialTab: 'does-not-exist' });
    expect(screen.getByRole('tab', { name: 'Setup' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches tabs when initialTab changes on a re-render', () => {
    const { rerender } = mount({ initialTab: 'categories' });
    expect(screen.getByRole('tab', { name: 'Event Colors' })).toHaveAttribute('aria-selected', 'true');
    rerender(
      <ConfigPanel
        config={DEFAULT_CONFIG}
        schema={{ fields: [] }}
        items={[]}
        categories={[]}
        resources={[]}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
        savedViews={[]}
        onUpdateView={vi.fn()}
        onDeleteView={vi.fn()}
        initialTab="assets"
      />,
    );
    expect(screen.getByRole('tab', { name: 'Assets' })).toHaveAttribute('aria-selected', 'true');
  });
});
