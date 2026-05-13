// @vitest-environment happy-dom
/**
 * EventForm — live conflict feedback (sprint #424 week 2).
 *
 * The form runs `onCheckConflicts` against a live draft payload and
 * surfaces violations inline. Hard violations disable Save without
 * routing through the modal; soft violations leave Save enabled so the
 * existing modal-based "Proceed anyway" path still gates the override.
 * Conflicting event ids feed back to the host via
 * `onLiveConflictsChange` so the calendar can paint highlights.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import EventForm from '../EventForm';

const START = new Date('2026-04-14T09:00:00.000Z');
const END   = new Date('2026-04-14T10:00:00.000Z');

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    title: 'Flight',
    start: START,
    end:   END,
    category: 'Ops',
    ...overrides,
  };
}

describe('EventForm — live conflict feedback', () => {
  it('renders an inline banner and disables Save on hard violations', () => {
    const onCheckConflicts = vi.fn().mockReturnValue({
      severity: 'hard',
      allowed: false,
      violations: [{
        rule: 'resource-overlap',
        severity: 'hard',
        message: 'Overlaps with "Other"',
        conflictingEventId: 'evt-other',
      }],
    });
    const onLiveConflictsChange = vi.fn();

    render(
      <EventForm
        event={baseEvent()}
        config={{}}
        categories={['Ops']}
        onSave={vi.fn()}
        onDelete={null}
        onClose={vi.fn()}
        permissions={{}}
        onCheckConflicts={onCheckConflicts}
        onLiveConflictsChange={onLiveConflictsChange}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Cannot save/i);
    expect(alert).toHaveTextContent('Overlaps with "Other"');

    const save = screen.getByRole('button', { name: 'Save Changes' });
    expect(save).toBeDisabled();

    expect(onLiveConflictsChange).toHaveBeenCalledWith(['evt-other']);
  });

  it('renders a soft warning without disabling Save', () => {
    const onCheckConflicts = vi.fn().mockReturnValue({
      severity: 'soft',
      allowed: true,
      violations: [{
        rule: 'min-rest',
        severity: 'soft',
        message: 'Only 30 min between shifts',
        conflictingEventId: 'evt-prev',
      }],
    });

    render(
      <EventForm
        event={baseEvent()}
        config={{}}
        categories={['Ops']}
        onSave={vi.fn()}
        onDelete={null}
        onClose={vi.fn()}
        permissions={{}}
        onCheckConflicts={onCheckConflicts}
      />,
    );

    expect(screen.getByText(/Conflict warning/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled();
  });

  it('clears the inline banner when the host returns a clean verdict', () => {
    let proposed: Record<string, unknown> | null = null;
    const onCheckConflicts = vi.fn().mockImplementation((p: Record<string, unknown>) => {
      proposed = p;
      return { severity: 'none', allowed: true, violations: [] };
    });

    render(
      <EventForm
        event={baseEvent()}
        config={{}}
        categories={['Ops']}
        onSave={vi.fn()}
        onDelete={null}
        onClose={vi.fn()}
        permissions={{}}
        onCheckConflicts={onCheckConflicts}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Conflict warning/i)).not.toBeInTheDocument();
    expect(proposed?.title).toBe('Flight');
  });
});
