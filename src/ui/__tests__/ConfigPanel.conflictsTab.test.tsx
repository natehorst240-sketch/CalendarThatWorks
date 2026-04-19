// @vitest-environment happy-dom
/**
 * ConflictsTab — ticket #134-13.
 *
 * Owner-editable conflict rules. Every mutation flows through `onUpdate`
 * into `config.conflicts`; src/core/conflictEngine.ts consumes the same
 * block at evaluation time. These specs pin the CRUD contract so the
 * downstream integration matrix (#134-16) can depend on a stable shape.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { ConflictsTab } from '../ConfigPanel';

function renderTab({ initialConfig = {}, onUpdate }: any = {}) {
  let currentConfig = { ...initialConfig };
  const update = onUpdate ?? vi.fn(updater => {
    currentConfig = typeof updater === 'function'
      ? updater(currentConfig)
      : { ...currentConfig, ...updater };
  });
  const utils = render(<ConflictsTab config={currentConfig} onUpdate={update} />);
  const rerender = () =>
    utils.rerender(<ConflictsTab config={currentConfig} onUpdate={update} />);
  return { ...utils, update, getConfig: () => currentConfig, rerender };
}

describe('ConflictsTab — enable toggle', () => {
  it('defaults to disabled when config.conflicts is absent', () => {
    renderTab();
    expect(screen.getByLabelText('Enable conflict checks')).not.toBeChecked();
  });

  it('flips conflicts.enabled on click', () => {
    const { getConfig, rerender } = renderTab();
    fireEvent.click(screen.getByLabelText('Enable conflict checks'));
    rerender();
    expect(getConfig().conflicts.enabled).toBe(true);
  });
});

describe('ConflictsTab — rule CRUD', () => {
  it('Add rule appends a resource-overlap rule by default', () => {
    const { getConfig, rerender } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add rule/i }));
    rerender();
    const rules = getConfig().conflicts.rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      id: 'rule-1',
      type: 'resource-overlap',
      severity: 'hard',
    });
  });

  it('changing rule type swaps the param inputs', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: {
        conflicts: { enabled: true, rules: [{ id: 'r1', type: 'resource-overlap', severity: 'hard' }] },
      },
    });
    fireEvent.change(screen.getByLabelText('Type for rule r1'), {
      target: { value: 'min-rest' },
    });
    rerender();
    expect(getConfig().conflicts.rules[0].type).toBe('min-rest');
    // min-rest row exposes a minutes input.
    expect(screen.getByLabelText('Minutes for rule r1')).toBeInTheDocument();
  });

  it('category-mutex edit persists comma-separated categories as an array', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: {
        conflicts: {
          enabled: true,
          rules: [{ id: 'r1', type: 'category-mutex', severity: 'hard', categories: [] }],
        },
      },
    });
    fireEvent.change(screen.getByLabelText('Categories for rule r1'), {
      target: { value: 'pto, shift, on-call' },
    });
    rerender();
    expect(getConfig().conflicts.rules[0].categories).toEqual(['pto', 'shift', 'on-call']);
  });

  it('min-rest edit persists minutes as a number', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: {
        conflicts: {
          enabled: true,
          rules: [{ id: 'r1', type: 'min-rest', severity: 'soft', minutes: 0 }],
        },
      },
    });
    fireEvent.change(screen.getByLabelText('Minutes for rule r1'), {
      target: { value: '45' },
    });
    rerender();
    expect(getConfig().conflicts.rules[0].minutes).toBe(45);
  });

  it('resource-overlap edit persists ignoreCategories', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: {
        conflicts: {
          enabled: true,
          rules: [{ id: 'r1', type: 'resource-overlap', severity: 'hard' }],
        },
      },
    });
    fireEvent.change(screen.getByLabelText('Ignore categories for rule r1'), {
      target: { value: 'meeting, training' },
    });
    rerender();
    expect(getConfig().conflicts.rules[0].ignoreCategories).toEqual(['meeting', 'training']);
  });

  it('severity dropdown flips soft ↔ hard', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: {
        conflicts: {
          enabled: true,
          rules: [{ id: 'r1', type: 'resource-overlap', severity: 'hard' }],
        },
      },
    });
    fireEvent.change(screen.getByLabelText('Severity for rule r1'), {
      target: { value: 'soft' },
    });
    rerender();
    expect(getConfig().conflicts.rules[0].severity).toBe('soft');
  });

  it('Remove rule drops the row from config', () => {
    const { getConfig, rerender } = renderTab({
      initialConfig: {
        conflicts: {
          enabled: true,
          rules: [{ id: 'r1', type: 'resource-overlap', severity: 'hard' }],
        },
      },
    });
    fireEvent.click(screen.getByLabelText('Remove rule r1'));
    rerender();
    expect(getConfig().conflicts.rules).toHaveLength(0);
  });
});
