// @vitest-environment happy-dom
/**
 * AssetsView — inline approval actions (ticket #134-15).
 *
 * Pills get a caret trigger when the owner has enabled approvals AND the
 * current stage has declared `allow[]` actions AND `onApprovalAction` is
 * wired. Clicking the caret opens an ApprovalActionMenu; clicking an item
 * fires `onApprovalAction(event, action)`. Pill-click itself is unchanged
 * (audit drawer for denied/pending_higher, otherwise edit).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import AssetsView from '../AssetsView.jsx';
import { CalendarContext } from '../../core/CalendarContext.js';

const currentDate = new Date(2026, 3, 1);

const sampleEvents = [
  {
    id: 'ev-approved',
    title: 'Training block',
    start: new Date(2026, 3, 3),
    end:   new Date(2026, 3, 5),
    resource: 'N121AB',
    category: 'training',
    meta: { approvalStage: { stage: 'approved', updatedAt: '', history: [] } },
  },
  {
    id: 'ev-requested',
    title: 'PR flight',
    start: new Date(2026, 3, 6),
    end:   new Date(2026, 3, 9),
    resource: 'N121AB',
    category: 'pr',
    meta: { approvalStage: { stage: 'requested', updatedAt: '', history: [] } },
  },
  {
    id: 'ev-denied',
    title: 'Maintenance (denied)',
    start: new Date(2026, 3, 10),
    end:   new Date(2026, 3, 13),
    resource: 'N505CD',
    category: 'maintenance',
    meta: { approvalStage: { stage: 'denied', updatedAt: '', history: [] } },
  },
];

const approvalsConfig = {
  enabled: true,
  rules: {
    requested:      { allow: ['approve', 'deny'], prefix: 'Req' },
    pending_higher: { allow: ['approve', 'deny'], prefix: 'Pend' },
    approved:       { allow: ['finalize', 'revoke'], prefix: '' },
    finalized:      { allow: ['revoke'], prefix: 'Final' },
    denied:         { allow: ['revoke'], prefix: 'Denied' },
  },
  labels: {
    approve:  'Approve',
    deny:     'Reject',
    finalize: 'Lock',
    revoke:   'Undo',
  },
};

function renderAssets(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AssetsView
        currentDate={currentDate}
        events={sampleEvents}
        onEventClick={vi.fn()}
        approvalsConfig={approvalsConfig}
        onApprovalAction={props.onApprovalAction ?? vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('AssetsView approval caret — visibility gating', () => {
  it('renders a caret when the stage has allow[] and onApprovalAction is wired', () => {
    renderAssets();
    expect(
      screen.getByRole('button', { name: 'Approval actions for PR flight' }),
    ).toBeInTheDocument();
  });

  it('does NOT render a caret when onApprovalAction is omitted', () => {
    renderAssets({ onApprovalAction: undefined });
    expect(
      screen.queryByRole('button', { name: /Approval actions for/ }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render a caret when approvals.enabled is false', () => {
    renderAssets({ approvalsConfig: { ...approvalsConfig, enabled: false } });
    expect(
      screen.queryByRole('button', { name: /Approval actions for/ }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render a caret for a stage whose allow[] is empty', () => {
    renderAssets({
      approvalsConfig: {
        ...approvalsConfig,
        rules: {
          ...approvalsConfig.rules,
          denied: { allow: [], prefix: 'Denied' },
        },
      },
    });
    // 'denied' event: no caret.
    expect(
      screen.queryByRole('button', { name: 'Approval actions for Maintenance (denied)' }),
    ).not.toBeInTheDocument();
    // 'requested' + 'approved' events still show carets.
    expect(
      screen.getByRole('button', { name: 'Approval actions for PR flight' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approval actions for Training block' }),
    ).toBeInTheDocument();
  });
});

describe('AssetsView approval caret — opens + fires action', () => {
  it('clicking the caret opens the action menu with configured labels', () => {
    renderAssets();
    fireEvent.click(screen.getByRole('button', { name: 'Approval actions for PR flight' }));
    const menu = screen.getByTestId('approval-action-menu');
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reject' })).toBeInTheDocument();
  });

  it('clicking a menu item fires onApprovalAction(event, actionId)', () => {
    const onApprovalAction = vi.fn();
    renderAssets({ onApprovalAction });
    fireEvent.click(screen.getByRole('button', { name: 'Approval actions for PR flight' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));
    expect(onApprovalAction).toHaveBeenCalledTimes(1);
    expect(onApprovalAction.mock.calls[0][0].id).toBe('ev-requested');
    expect(onApprovalAction.mock.calls[0][1]).toBe('approve');
  });

  it('caret click does not fire the pill onEventClick (stopPropagation)', () => {
    const onEventClick = vi.fn();
    renderAssets({ onEventClick });
    fireEvent.click(screen.getByRole('button', { name: 'Approval actions for PR flight' }));
    expect(onEventClick).not.toHaveBeenCalled();
  });

  it('closes the menu after an action is taken', () => {
    renderAssets();
    fireEvent.click(screen.getByRole('button', { name: 'Approval actions for PR flight' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));
    expect(screen.queryByTestId('approval-action-menu')).not.toBeInTheDocument();
  });

  it('Escape closes the menu without firing an action', () => {
    const onApprovalAction = vi.fn();
    renderAssets({ onApprovalAction });
    fireEvent.click(screen.getByRole('button', { name: 'Approval actions for PR flight' }));
    expect(screen.getByTestId('approval-action-menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('approval-action-menu')).not.toBeInTheDocument();
    expect(onApprovalAction).not.toHaveBeenCalled();
  });
});
