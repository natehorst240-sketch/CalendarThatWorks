// @vitest-environment happy-dom
/**
 * RequestQueueView — sprint #424 week 3.
 *
 * Acceptance: a user can see what's waiting on them, click Approve, and
 * the host's `onApprovalAction` fires with the right action id. Hidden
 * stages stay hidden behind the filter; switching filters reveals them.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import RequestQueueView from '../RequestQueueView';

const APPROVALS_CONFIG = {
  enabled: true,
  rules: {
    requested:      { allow: ['approve', 'deny'] },
    pending_higher: { allow: ['approve', 'deny'] },
    approved:       { allow: ['finalize', 'revoke'] },
    finalized:      { allow: ['revoke'] },
    denied:         { allow: ['revoke'] },
  },
};

const events = [
  {
    id: 'r1', title: 'Request A',
    start: new Date('2026-05-01T09:00:00Z'),
    end:   new Date('2026-05-01T10:00:00Z'),
    resource: 'tail-1',
    meta: {
      requestedBy: 'alice',
      approvalStage: { stage: 'requested', updatedAt: '2026-04-28T00:00:00Z', history: [] },
    },
  },
  {
    id: 'r2', title: 'Request B',
    start: new Date('2026-05-02T09:00:00Z'),
    end:   new Date('2026-05-02T10:00:00Z'),
    meta: {
      requestedBy: 'bob',
      approvalStage: { stage: 'finalized', updatedAt: '2026-04-29T00:00:00Z', history: [] },
    },
  },
  {
    id: 'r3', title: 'Plain event',
    start: new Date('2026-05-03T09:00:00Z'),
    end:   new Date('2026-05-03T10:00:00Z'),
  },
];

describe('RequestQueueView', () => {
  it('shows only open requests by default and hides finalized + non-approval events', () => {
    render(
      <RequestQueueView events={events} approvalsConfig={APPROVALS_CONFIG} />,
    );
    expect(screen.getByText('Request A')).toBeInTheDocument();
    expect(screen.queryByText('Request B')).not.toBeInTheDocument();
    expect(screen.queryByText('Plain event')).not.toBeInTheDocument();
  });

  it('approve button fires onApprovalAction with the raw event + action', () => {
    const onApprovalAction = vi.fn();
    render(
      <RequestQueueView
        events={events}
        approvalsConfig={APPROVALS_CONFIG}
        onApprovalAction={onApprovalAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(onApprovalAction).toHaveBeenCalledTimes(1);
    expect(onApprovalAction.mock.calls[0]?.[0]).toMatchObject({ id: 'r1' });
    expect(onApprovalAction.mock.calls[0]?.[1]).toBe('approve');
  });

  it('switching the stage filter reveals finalized rows', () => {
    render(
      <RequestQueueView events={events} approvalsConfig={APPROVALS_CONFIG} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Finalized/i }));
    expect(screen.getByText('Request B')).toBeInTheDocument();
    expect(screen.queryByText('Request A')).not.toBeInTheDocument();
  });

  it('renders empty state when no requests exist', () => {
    render(
      <RequestQueueView events={[events[2]!]} approvalsConfig={APPROVALS_CONFIG} />,
    );
    expect(screen.getByText(/No open requests/i)).toBeInTheDocument();
  });
});
