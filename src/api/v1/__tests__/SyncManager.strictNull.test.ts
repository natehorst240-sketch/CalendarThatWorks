// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { SyncManager } from '../sync/SyncManager';
import type { CalendarAdapter } from '../adapters/CalendarAdapter';

function makeAdapter(overrides: Partial<CalendarAdapter> = {}): CalendarAdapter {
  return {
    loadRange: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe('SyncManager strict-null retry guards', () => {
  it('marks a queued update as error when the local event is missing during retry', () => {
    const manager = new SyncManager({ adapter: makeAdapter(), maxRetries: 0 });

    const opId = manager.queue.enqueue('update', 'missing-event', { title: 'patched' }, null);

    manager.retryFailed();

    expect(manager.queue.errorFor('missing-event')).toBeInstanceOf(Error);
    expect(manager.queue.errorFor('missing-event')?.message).toContain('missing local event');
    expect(manager.queue.all.find(op => op.id === opId)?.status).toBe('error');
  });
});
