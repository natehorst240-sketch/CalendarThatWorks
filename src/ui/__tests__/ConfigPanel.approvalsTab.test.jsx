// @vitest-environment happy-dom
/**
 * ApprovalsTab — ticket #134-14.
 *
 * The Approvals tab is the owner-configurable policy surface for the
 * approvals workflow. Every mutation flows through `onUpdate` into
 * `config.approvals`; runtime surfaces (AssetsView pill prefixes, AuditDrawer
 * menus, #134-15 inline actions) read from the same block. These specs pin
 * the contract so subsequent phases can depend on a stable shape.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { ApprovalsTab } from '../ConfigPanel.jsx';

function renderTab({ initialConfig = {}, onUpdate } = {}) {
  let currentConfig = { ...initialConfig };
  const update = onUpdate ?? vi.fn(updater => {
    currentConfig = typeof updater === 'function'
      ? updater(currentConfig)
      : { ...currentConfig, ...updater };
  });
  const utils = render(<ApprovalsTab config={currentConfig} onUpdate={update} />);
  const rerender = () =>
    utils.rerender(<ApprovalsTab config={currentConfig} onUpdate={update} />);
  return { ...utils, update, getConfig: () => currentConfig, rerender };
}

const seededConfig = {
  approvals: {
    enabled: false,
    tiers: [
      { id: 'tier-1', label: 'Supervisor', requires: 'any', roles: [] },
      { id: 'tier-2', label: 'Director',   requires: 'any', roles: [] },
    ],
    rules: {
      requested:      { allow: ['approve', 'deny'], prefix: 'Req' },
      pending_higher: { allow: ['approve', 'deny'], prefix: 'Pend' },
      approved:       { allow: ['finalize', 'revoke'], prefix: '' },
      finalized:      { allow: ['revoke'], prefix: 'Final' },
      denied:         { allow: ['revoke'], prefix: 'Denied' },
    },
    labels: { approve: 'Approve', deny: 'Deny', finalize: 'Finalize', revoke: 'Revoke' },
  },
};

describe('ApprovalsTab — enable toggle', () => {
  it('renders with enabled=false by default when config.approvals is empty', () => {
    renderTab();
    const toggle = screen.getByLabelText('Enable approvals workflow');
    expect(toggle).not.toBeChecked();
  });

  it('flips approvals.enabled when toggled', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.click(screen.getByLabelText('Enable approvals workflow'));
    rerender();
    expect(getConfig().approvals.enabled).toBe(true);
  });
});

describe('ApprovalsTab — tiers', () => {
  it('renders seeded tiers in order', () => {
    renderTab({ initialConfig: seededConfig });
    const supervisor = screen.getByLabelText('Label for tier-1');
    const director   = screen.getByLabelText('Label for tier-2');
    expect(supervisor).toHaveValue('Supervisor');
    expect(director).toHaveValue('Director');
  });

  it('Add tier appends a new row with a fresh id', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.click(screen.getByRole('button', { name: /Add tier/i }));
    rerender();
    const { tiers } = getConfig().approvals;
    expect(tiers).toHaveLength(3);
    expect(tiers[2].id).toBe('tier-3');
    expect(tiers[2].label).toBe('Tier 3');
  });

  it('renaming a tier writes through to config', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.change(screen.getByLabelText('Label for tier-1'), {
      target: { value: 'Shift Lead' },
    });
    rerender();
    expect(getConfig().approvals.tiers[0].label).toBe('Shift Lead');
  });

  it('changing quorum (any → all) writes through', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.change(screen.getByLabelText('Quorum for Supervisor'), {
      target: { value: 'all' },
    });
    rerender();
    expect(getConfig().approvals.tiers[0].requires).toBe('all');
  });

  it('editing roles as comma-separated list splits into an array', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.change(screen.getByLabelText('Roles for Supervisor'), {
      target: { value: 'pilot, dispatcher, ops' },
    });
    rerender();
    expect(getConfig().approvals.tiers[0].roles).toEqual(['pilot', 'dispatcher', 'ops']);
  });

  it('Move tier down swaps order', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.click(screen.getByLabelText('Move Supervisor down'));
    rerender();
    expect(getConfig().approvals.tiers.map(t => t.id)).toEqual(['tier-2', 'tier-1']);
  });

  it('Move tier up on the topmost row is a no-op (button disabled)', () => {
    renderTab({ initialConfig: seededConfig });
    expect(screen.getByLabelText('Move Supervisor up')).toBeDisabled();
  });

  it('Remove tier drops the row from config', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.click(screen.getByLabelText('Remove Director'));
    rerender();
    const { tiers } = getConfig().approvals;
    expect(tiers).toHaveLength(1);
    expect(tiers[0].id).toBe('tier-1');
  });
});

describe('ApprovalsTab — stage rules', () => {
  it('renders one row per stage with a label, prefix input, and four action checkboxes', () => {
    renderTab({ initialConfig: seededConfig });
    // Five stage rows; each exposes `allow <action> on <stage>` checkboxes.
    const stages = ['requested', 'approved', 'finalized', 'pending_higher', 'denied'];
    for (const stage of stages) {
      expect(screen.getByLabelText(`Prefix for ${stage}`)).toBeInTheDocument();
      for (const action of ['approve', 'deny', 'finalize', 'revoke']) {
        expect(screen.getByLabelText(`Allow ${action} on ${stage}`)).toBeInTheDocument();
      }
    }
  });

  it('toggling an action off removes it from the stage.allow list', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    // Seeded requested.allow = ['approve', 'deny']; un-check approve.
    fireEvent.click(screen.getByLabelText('Allow approve on requested'));
    rerender();
    expect(getConfig().approvals.rules.requested.allow).toEqual(['deny']);
  });

  it('toggling an action on appends it to the stage.allow list', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    // Seeded finalized.allow = ['revoke']; add approve.
    fireEvent.click(screen.getByLabelText('Allow approve on finalized'));
    rerender();
    expect(getConfig().approvals.rules.finalized.allow).toContain('approve');
    expect(getConfig().approvals.rules.finalized.allow).toContain('revoke');
  });

  it('editing the prefix writes through to the stage rule', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.change(screen.getByLabelText('Prefix for requested'), {
      target: { value: 'Pending' },
    });
    rerender();
    expect(getConfig().approvals.rules.requested.prefix).toBe('Pending');
  });
});

describe('ApprovalsTab — labels', () => {
  it('renders a row per action with its current label', () => {
    renderTab({ initialConfig: seededConfig });
    expect(screen.getByLabelText('approve button label')).toHaveValue('Approve');
    expect(screen.getByLabelText('deny button label')).toHaveValue('Deny');
    expect(screen.getByLabelText('finalize button label')).toHaveValue('Finalize');
    expect(screen.getByLabelText('revoke button label')).toHaveValue('Revoke');
  });

  it('renaming a label writes through', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.change(screen.getByLabelText('approve button label'), {
      target: { value: 'Sign off' },
    });
    rerender();
    expect(getConfig().approvals.labels.approve).toBe('Sign off');
  });
});

describe('ApprovalsTab — robustness', () => {
  it('treats missing approvals block as an empty policy (no crash, no tier rows)', () => {
    renderTab({ initialConfig: {} });
    expect(screen.queryByLabelText(/Remove Supervisor/)).not.toBeInTheDocument();
    // Add-tier button is still present and functional.
    expect(screen.getByRole('button', { name: /Add tier/i })).toBeInTheDocument();
  });

  it('Add tier from an empty policy starts at tier-1', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: {} });
    fireEvent.click(screen.getByRole('button', { name: /Add tier/i }));
    rerender();
    const { tiers } = getConfig().approvals;
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({ id: 'tier-1', label: 'Tier 1', requires: 'any' });
  });
});
