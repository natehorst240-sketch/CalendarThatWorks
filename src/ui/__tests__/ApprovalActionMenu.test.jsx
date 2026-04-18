// @vitest-environment happy-dom
/**
 * ApprovalActionMenu — ticket #134-15.
 *
 * Inline action surface driven by `config.approvals.rules[stage].allow` and
 * `config.approvals.labels`. These specs pin the "data-in → buttons-out"
 * contract so the AssetsView + AuditDrawer integrations stay thin.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import ApprovalActionMenu, { allowedActionsFor } from '../ApprovalActionMenu.jsx';

const baseConfig = {
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

describe('allowedActionsFor', () => {
  it('returns [] when approvals.enabled is false', () => {
    expect(allowedActionsFor('requested', { ...baseConfig, enabled: false })).toEqual([]);
  });

  it('returns [] when the config is missing', () => {
    expect(allowedActionsFor('requested', null)).toEqual([]);
    expect(allowedActionsFor('requested', undefined)).toEqual([]);
  });

  it('returns [] when the stage is unknown', () => {
    expect(allowedActionsFor('no-such-stage', baseConfig)).toEqual([]);
  });

  it('returns the declared allow[] for a configured stage', () => {
    expect(allowedActionsFor('requested', baseConfig)).toEqual(['approve', 'deny']);
    expect(allowedActionsFor('denied',    baseConfig)).toEqual(['revoke']);
  });
});

describe('ApprovalActionMenu — rendering', () => {
  it('renders a menuitem per allowed action with the configured label', () => {
    render(
      <ApprovalActionMenu
        stage="requested"
        approvalsConfig={baseConfig}
        onAction={vi.fn()}
      />,
    );
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Approve');
    expect(items[1]).toHaveTextContent('Reject');
  });

  it('renders nothing when approvals.enabled is false', () => {
    const { container } = render(
      <ApprovalActionMenu
        stage="requested"
        approvalsConfig={{ ...baseConfig, enabled: false }}
        onAction={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the stage has no allow[]', () => {
    const { container } = render(
      <ApprovalActionMenu
        stage="denied"
        approvalsConfig={{ ...baseConfig, rules: { ...baseConfig.rules, denied: { allow: [] } } }}
        onAction={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to built-in labels when config.labels is missing for an action', () => {
    render(
      <ApprovalActionMenu
        stage="approved"
        approvalsConfig={{ ...baseConfig, labels: {} }}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('menuitem', { name: 'Finalize' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Revoke' })).toBeInTheDocument();
  });

  it('applies anchorRect as fixed positioning in popover variant', () => {
    render(
      <ApprovalActionMenu
        stage="requested"
        approvalsConfig={baseConfig}
        anchorRect={{ top: 10, bottom: 36, left: 120, right: 220 }}
        onAction={vi.fn()}
      />,
    );
    const menu = screen.getByTestId('approval-action-menu');
    expect(menu).toHaveStyle({ position: 'fixed', top: '40px', left: '120px' });
    expect(menu).toHaveAttribute('data-variant', 'popover');
  });

  it('inline variant skips absolute positioning', () => {
    render(
      <ApprovalActionMenu
        stage="requested"
        approvalsConfig={baseConfig}
        anchorRect={{ top: 10, bottom: 36, left: 120, right: 220 }}
        variant="inline"
        onAction={vi.fn()}
      />,
    );
    const menu = screen.getByTestId('approval-action-menu');
    expect(menu).toHaveAttribute('data-variant', 'inline');
    // No inline style when inline variant.
    expect(menu.getAttribute('style')).toBeFalsy();
  });
});

describe('ApprovalActionMenu — interaction', () => {
  it('calls onAction with the action id and then onClose', () => {
    const onAction = vi.fn();
    const onClose  = vi.fn();
    render(
      <ApprovalActionMenu
        stage="requested"
        approvalsConfig={baseConfig}
        onAction={onAction}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reject' }));
    expect(onAction).toHaveBeenCalledWith('deny');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the popover variant', () => {
    const onClose = vi.fn();
    render(
      <ApprovalActionMenu
        stage="requested"
        approvalsConfig={baseConfig}
        onAction={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mousedown outside the popover closes it', () => {
    const onClose = vi.fn();
    render(
      <div>
        <ApprovalActionMenu
          stage="requested"
          approvalsConfig={baseConfig}
          onAction={vi.fn()}
          onClose={onClose}
        />
        <button>outside</button>
      </div>,
    );
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('inline variant does NOT auto-dismiss on Escape', () => {
    const onClose = vi.fn();
    render(
      <ApprovalActionMenu
        stage="requested"
        approvalsConfig={baseConfig}
        variant="inline"
        onAction={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
