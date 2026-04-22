// @vitest-environment happy-dom
/**
 * Phase B integration matrix — ticket #134-16.
 *
 * End-to-end glue test across the three owner-configurable systems landed
 * in Phase B: RequestForm (schema-driven input), conflictEngine (data-
 * driven rules), and the approvals policy (config.approvals.rules). All
 * three read from the same `config` blob, so the test harness mutates the
 * blob directly and asserts the observable end-state — no mocks.
 *
 * Pipeline:
 *   RequestForm.onSubmit → evaluateConflicts → ConflictModal
 *                     ↓ (allowed)
 *                   persist event with meta.approvalStage = 'requested'
 *                     ↓
 *                   pill caret reveals the owner-configured approve/deny
 *                   actions via ApprovalActionMenu.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import '@testing-library/jest-dom';

import RequestForm from '../ui/RequestForm';
import ConflictModal from '../ui/ConflictModal';
import ApprovalActionMenu, { allowedActionsFor } from '../ui/ApprovalActionMenu';
import { evaluateConflicts } from '../core/conflictEngine.ts';
import { DEFAULT_CONFIG } from '../core/configSchema';

type RequestValues = {
  title: string;
  start: string;
  end: string;
  resource: string;
  category?: string;
};

type EventLike = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: string;
  category?: string;
  meta?: {
    approvalStage?: {
      stage: string;
      updatedAt: string;
      history: unknown[];
    };
  };
};

// ─── Test fixtures ────────────────────────────────────────────────────────────

/** Cross-cutting config the three systems all read. */
const fullConfig = {
  requestForm: {
    fields: [
      { key: 'title',    label: 'Title',    type: 'text',     required: true },
      { key: 'start',    label: 'Starts',   type: 'datetime', required: true },
      { key: 'end',      label: 'Ends',     type: 'datetime', required: true },
      { key: 'resource', label: 'Resource', type: 'text',     required: true },
      { key: 'category', label: 'Category', type: 'select',   options: 'training, maintenance, pr' },
    ],
  },
  conflicts: {
    enabled: true,
    rules: [
      { id: 'ro-1', type: 'resource-overlap', severity: 'hard' },
    ],
  },
  approvals: {
    enabled: true,
    rules: {
      requested: { allow: ['approve', 'deny'], prefix: 'Req' },
      approved:  { allow: ['finalize', 'revoke'], prefix: '' },
      finalized: { allow: ['revoke'], prefix: 'Final' },
      denied:    { allow: ['revoke'], prefix: 'Denied' },
      pending_higher: { allow: ['approve', 'deny'], prefix: 'Pend' },
    },
    labels: {
      approve: 'Approve',
      deny:    'Reject',
      finalize: 'Lock',
      revoke:  'Undo',
    },
  },
};

/** Seed event that will overlap with some request-form submissions. */
const seededEvent = {
  id: 'seed-1',
  title: 'Existing block',
  start: new Date('2026-04-20T09:00:00'),
  end:   new Date('2026-04-20T11:00:00'),
  resource: 'N121AB',
  category: 'training',
};

/**
 * Small orchestrator that wires the three systems the way a host app would.
 * Not production code — exists only for the test pipeline.
 */
function Pipeline({ config, initialEvents = [seededEvent], onCommit }: { config: Record<string, any>; initialEvents?: EventLike[]; onCommit?: (evt: EventLike) => void }) {
  const [events, setEvents]     = useState<EventLike[]>(initialEvents);
  const [proposed, setProposed] = useState<EventLike | null>(null);
  const [conflict, setConflict] = useState<{ allowed?: boolean; severity?: string } | null>(null);
  const [committed, setCommitted] = useState<EventLike | null>(null);

  const handleSubmit = ({ values }: { values: RequestValues }) => {
    const evt = {
      id: `new-${events.length + 1}`,
      title: values.title,
      start: new Date(values.start),
      end:   new Date(values.end),
      resource: values.resource,
      category: values.category,
    };
    const result = evaluateConflicts({
      proposed: evt,
      events,
      rules: config.conflicts.rules,
      enabled: config.conflicts.enabled,
    });
    setProposed(evt);
    if (result.severity === 'none') {
      persist(evt);
    } else {
      setConflict(result);
    }
  };

  const persist = (evt: EventLike) => {
    const withStage = {
      ...evt,
      meta: { approvalStage: { stage: 'requested', updatedAt: '', history: [] as unknown[] } },
    };
    setEvents((prev: EventLike[]) => [...prev, withStage]);
    setCommitted(withStage);
    onCommit?.(withStage);
  };

  const proceed = () => {
    if (proposed && conflict?.allowed) persist(proposed);
    setConflict(null);
  };

  return (
    <div>
      <RequestForm
        schema={config.requestForm}
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
      <ConflictModal result={conflict} onProceed={proceed} onCancel={() => setConflict(null)} />
      {committed && (
        <div data-testid="committed-pill">
          <span>{committed.title}</span>
          <ApprovalActionMenu
            stage={committed.meta.approvalStage.stage}
            approvalsConfig={config.approvals}
            onAction={vi.fn()}
            variant="inline"
          />
        </div>
      )}
    </div>
  );
}

function fillRequestForm({ title, start, end, resource, category }: RequestValues) {
  fireEvent.change(screen.getByLabelText('Title'),    { target: { value: title } });
  fireEvent.change(screen.getByLabelText('Starts'),   { target: { value: start } });
  fireEvent.change(screen.getByLabelText('Ends'),     { target: { value: end } });
  fireEvent.change(screen.getByLabelText('Resource'), { target: { value: resource } });
  if (category !== undefined) {
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: category } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Submit request/ }));
}

// ─── Specs ────────────────────────────────────────────────────────────────────

describe('Phase B pipeline — RequestForm → conflictEngine → approval pill', () => {
  it('owner config defaults include all three Phase B blocks', () => {
    // Guards against someone removing a block from the default — every host
    // app relies on the union being present for the integration to compose.
    expect(DEFAULT_CONFIG.requestForm?.fields?.length).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.conflicts).toMatchObject({ enabled: expect.any(Boolean), rules: expect.any(Array) });
    expect(DEFAULT_CONFIG.approvals).toMatchObject({ enabled: expect.any(Boolean), rules: expect.any(Object) });
  });

  it('commits the event unchanged when no rules trigger', () => {
    const onCommit = vi.fn();
    render(<Pipeline config={fullConfig} onCommit={onCommit} />);
    fillRequestForm({
      title: 'PR shoot',
      start: '2026-04-21T09:00',
      end:   '2026-04-21T11:00',
      resource: 'N121AB',
      category: 'pr',
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].title).toBe('PR shoot');
    expect(onCommit.mock.calls[0][0].meta.approvalStage.stage).toBe('requested');
    // No conflict modal rendered.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('blocks a submission that hits a hard resource-overlap rule', () => {
    const onCommit = vi.fn();
    render(<Pipeline config={fullConfig} onCommit={onCommit} />);
    fillRequestForm({
      title: 'Overlap',
      start: '2026-04-20T10:00',
      end:   '2026-04-20T12:00',
      resource: 'N121AB',
      category: 'training',
    });
    // Modal appears and proceed is disabled (hard).
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Resolve to continue/ })).toBeDisabled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('allows a submission past a soft rule once the user confirms', () => {
    const softConfig = {
      ...fullConfig,
      conflicts: {
        enabled: true,
        rules: [{ id: 'ro-soft', type: 'resource-overlap', severity: 'soft' }],
      },
    };
    const onCommit = vi.fn();
    render(<Pipeline config={softConfig} onCommit={onCommit} />);
    fillRequestForm({
      title: 'Soft overlap',
      start: '2026-04-20T10:00',
      end:   '2026-04-20T12:00',
      resource: 'N121AB',
      category: 'training',
    });
    const dialog = screen.getByRole('alertdialog');
    const proceed = within(dialog).getByRole('button', { name: /Proceed anyway/ });
    expect(proceed).not.toBeDisabled();
    fireEvent.click(proceed);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].meta.approvalStage.stage).toBe('requested');
  });

  it('bypasses the conflict engine entirely when conflicts.enabled is false', () => {
    const disabled = { ...fullConfig, conflicts: { enabled: false, rules: fullConfig.conflicts.rules } };
    const onCommit = vi.fn();
    render(<Pipeline config={disabled} onCommit={onCommit} />);
    fillRequestForm({
      title: 'Would overlap',
      start: '2026-04-20T10:00',
      end:   '2026-04-20T12:00',
      resource: 'N121AB',
      category: 'training',
    });
    // No modal; committed directly.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('blocks submit when a required request-form field is empty', () => {
    const onCommit = vi.fn();
    render(<Pipeline config={fullConfig} onCommit={onCommit} />);
    // Title is required but left blank.
    fireEvent.change(screen.getByLabelText('Starts'),   { target: { value: '2026-04-21T09:00' } });
    fireEvent.change(screen.getByLabelText('Ends'),     { target: { value: '2026-04-21T11:00' } });
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'N121AB' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit request/ }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Phase B pipeline — committed event exposes approval actions', () => {
  it('pill menu exposes the configured approve/deny buttons', () => {
    render(<Pipeline config={fullConfig} onCommit={vi.fn()} />);
    fillRequestForm({
      title: 'Auto-approve flow',
      start: '2026-04-22T09:00',
      end:   '2026-04-22T11:00',
      resource: 'N121AB',
      category: 'pr',
    });
    const pill = screen.getByTestId('committed-pill');
    expect(within(pill).getByRole('menuitem', { name: 'Approve' })).toBeInTheDocument();
    expect(within(pill).getByRole('menuitem', { name: 'Reject' })).toBeInTheDocument();
  });

  it('owner can strip all actions off a stage and the pill menu disappears', () => {
    const locked = {
      ...fullConfig,
      approvals: {
        ...fullConfig.approvals,
        rules: {
          ...fullConfig.approvals.rules,
          requested: { allow: [] as string[], prefix: 'Req' },
        },
      },
    };
    render(<Pipeline config={locked} onCommit={vi.fn()} />);
    fillRequestForm({
      title: 'Locked',
      start: '2026-04-23T09:00',
      end:   '2026-04-23T11:00',
      resource: 'N121AB',
      category: 'pr',
    });
    const pill = screen.getByTestId('committed-pill');
    expect(within(pill).queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('disabling approvals globally silences all pill actions', () => {
    const silent = { ...fullConfig, approvals: { ...fullConfig.approvals, enabled: false } };
    render(<Pipeline config={silent} onCommit={vi.fn()} />);
    fillRequestForm({
      title: 'Silent flow',
      start: '2026-04-24T09:00',
      end:   '2026-04-24T11:00',
      resource: 'N121AB',
      category: 'pr',
    });
    const pill = screen.getByTestId('committed-pill');
    expect(within(pill).queryByRole('menuitem')).not.toBeInTheDocument();
  });
});

describe('Phase B pipeline — policy helper invariants', () => {
  it('allowedActionsFor derives the same list the pill menu renders', () => {
    // Single source of truth: the pill menu + audit drawer + inline tests
    // all use the same resolver, so the policy helper is the
    // canonical checkpoint.
    expect(allowedActionsFor('requested', fullConfig.approvals)).toEqual(['approve', 'deny']);
    expect(allowedActionsFor('approved',  fullConfig.approvals)).toEqual(['finalize', 'revoke']);
    expect(allowedActionsFor('finalized', fullConfig.approvals)).toEqual(['revoke']);
  });

  it('evaluateConflicts returns { allowed: false } for hard + true for soft', () => {
    const proposed = {
      id: 'p', title: 'x', resource: 'N121AB',
      start: new Date('2026-04-20T10:00:00'), end: new Date('2026-04-20T12:00:00'),
    };
    const hardResult = evaluateConflicts({
      proposed, events: [seededEvent],
      rules: [{ id: 'r', type: 'resource-overlap', severity: 'hard' }],
    });
    expect(hardResult.allowed).toBe(false);
    expect(hardResult.severity).toBe('hard');

    const softResult = evaluateConflicts({
      proposed, events: [seededEvent],
      rules: [{ id: 'r', type: 'resource-overlap', severity: 'soft' }],
    });
    expect(softResult.allowed).toBe(true);
    expect(softResult.severity).toBe('soft');
  });
});
