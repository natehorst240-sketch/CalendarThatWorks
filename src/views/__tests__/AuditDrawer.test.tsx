// @vitest-environment happy-dom
/**
 * AuditDrawer — Assets Tab Phase 1 Sprint 4 PR B.
 *
 * Renders the approval-stage history for a single event. Opens from a
 * denied / pending_higher pill click in AssetsView. Read-only; calendar
 * never mutates history.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import AuditDrawer from '../AuditDrawer';

const deniedEvent = {
  id: 'ev-1',
  title: 'Maintenance window',
  meta: {
    approvalStage: {
      stage: 'denied',
      updatedAt: '2026-04-14T10:00:00Z',
      history: [
        { action: 'submit',  at: '2026-04-10T09:00:00Z', actor: 'alice' },
        { action: 'approve', at: '2026-04-11T11:30:00Z', actor: 'bob', tier: 1 },
        { action: 'deny',    at: '2026-04-14T10:00:00Z', actor: 'carol', tier: 2, reason: 'Conflicts with dispatch priority' },
      ],
    },
  },
};

describe('AuditDrawer — render', () => {
  it('renders nothing when event is null', () => {
    const { container } = render(<AuditDrawer event={null} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="audit-drawer-overlay"]')).toBeNull();
  });

  it('renders the event title and stage tag', () => {
    render(<AuditDrawer event={deniedEvent} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /Audit history for Maintenance window/ })).toBeInTheDocument();
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  it('renders each history entry with action label, actor, and reason', () => {
    render(<AuditDrawer event={deniedEvent} onClose={vi.fn()} />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
    expect(screen.getByText(/carol/)).toBeInTheDocument();
    expect(screen.getByText('Conflicts with dispatch priority')).toBeInTheDocument();
  });

  it('renders a tier badge when entry.tier is present', () => {
    render(<AuditDrawer event={deniedEvent} onClose={vi.fn()} />);
    expect(screen.getByText('Tier 1')).toBeInTheDocument();
    expect(screen.getByText('Tier 2')).toBeInTheDocument();
  });

  it('tags entries with data-action for CSS hooks', () => {
    render(<AuditDrawer event={deniedEvent} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('listitem')[0]).toHaveAttribute('data-action', 'submit');
    expect(within(dialog).getAllByRole('listitem')[2]).toHaveAttribute('data-action', 'deny');
  });

  it('shows an empty-state message when history is absent', () => {
    const eventNoHistory = {
      id: 'ev-x',
      title: 'Plain',
      meta: { approvalStage: { stage: 'denied', updatedAt: '', history: [] as unknown[] } },
    };
    render(<AuditDrawer event={eventNoHistory} onClose={vi.fn()} />);
    expect(screen.getByText(/No history recorded/i)).toBeInTheDocument();
  });
});

describe('AuditDrawer — close behaviour', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<AuditDrawer event={deniedEvent} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close audit history/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<AuditDrawer event={deniedEvent} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<AuditDrawer event={deniedEvent} onClose={onClose} />);
    const overlay = screen.getByTestId('audit-drawer-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the drawer body', () => {
    const onClose = vi.fn();
    render(<AuditDrawer event={deniedEvent} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * Inline approval actions (ticket #134-15): the drawer hosts the same
 * ApprovalActionMenu as the pill caret, driven by config.approvals.rules.
 */
describe('AuditDrawer — inline approval actions', () => {
  const approvalsConfig = {
    enabled: true,
    rules: {
      denied: { allow: ['revoke'], prefix: 'Denied' },
    },
    labels: { revoke: 'Undo' },
  };

  it('renders action buttons when approvalsConfig + onAction are wired', () => {
    render(
      <AuditDrawer
        event={deniedEvent}
        onClose={vi.fn()}
        approvalsConfig={approvalsConfig}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('menuitem', { name: 'Undo' })).toBeInTheDocument();
  });

  it('omits actions when approvals.enabled=false', () => {
    render(
      <AuditDrawer
        event={deniedEvent}
        onClose={vi.fn()}
        approvalsConfig={{ ...approvalsConfig, enabled: false }}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('omits actions when onAction is missing', () => {
    render(
      <AuditDrawer
        event={deniedEvent}
        onClose={vi.fn()}
        approvalsConfig={approvalsConfig}
      />,
    );
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('clicking an action fires onAction with the action id', () => {
    const onAction = vi.fn();
    render(
      <AuditDrawer
        event={deniedEvent}
        onClose={vi.fn()}
        approvalsConfig={approvalsConfig}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledWith('revoke');
  });
});

describe('AuditDrawer — SLA countdown pill (#222)', () => {
  const workflow = {
    id: 'sla-esc',
    version: 1,
    trigger: 'on_submit',
    startNodeId: 'm',
    nodes: [
      { id: 'm', type: 'approval', assignTo: 'role:manager', slaMinutes: 60, onTimeout: 'escalate' },
      { id: 'ok', type: 'terminal', outcome: 'finalized' },
      { id: 'no', type: 'terminal', outcome: 'denied' },
    ],
    edges: [
      { from: 'm', to: 'ok', when: 'approved' },
      { from: 'm', to: 'no', when: 'denied' },
    ],
  };

  function makeEvent(enteredAt: string, status = 'awaiting') {
    return {
      id: 'ev-sla',
      title: 'SLA test',
      meta: {
        workflowInstance: {
          workflowId: 'sla-esc',
          workflowVersion: 1,
          status,
          currentNodeId: 'm',
          history: [{ nodeId: 'm', enteredAt }],
        },
      },
    };
  }

  it('shows countdown pill when SLA has not elapsed', () => {
    vi.setSystemTime(new Date('2026-04-20T10:30:00.000Z'));
    render(<AuditDrawer event={makeEvent('2026-04-20T10:00:00.000Z')} onClose={vi.fn()} workflow={workflow} />);
    const pill = screen.getByTestId('audit-sla-pill');
    expect(pill).toBeInTheDocument();
    expect(pill.getAttribute('data-sla-expired')).toBe('false');
    expect(pill.textContent).toMatch(/SLA.*left/i);
    vi.useRealTimers();
  });

  it('shows expired pill when SLA has elapsed', () => {
    vi.setSystemTime(new Date('2026-04-20T11:30:00.000Z'));
    render(<AuditDrawer event={makeEvent('2026-04-20T10:00:00.000Z')} onClose={vi.fn()} workflow={workflow} />);
    const pill = screen.getByTestId('audit-sla-pill');
    expect(pill.getAttribute('data-sla-expired')).toBe('true');
    expect(pill.textContent).toMatch(/elapsed/i);
    vi.useRealTimers();
  });

  it('omits the pill when no workflow prop is passed', () => {
    render(<AuditDrawer event={makeEvent('2026-04-20T10:00:00.000Z')} onClose={vi.fn()} />);
    expect(screen.queryByTestId('audit-sla-pill')).toBeNull();
  });

  it('omits the pill when instance is not awaiting', () => {
    render(<AuditDrawer event={makeEvent('2026-04-20T10:00:00.000Z', 'completed')} onClose={vi.fn()} workflow={workflow} />);
    expect(screen.queryByTestId('audit-sla-pill')).toBeNull();
  });
});
