/**
 * normalizeEvent — lifecycle field (sprint-424 week 1).
 *
 * Lifecycle is opt-in: hosts can pass it on the top-level event, ride it
 * through `meta.lifecycle`, or omit it entirely. Untracked events must
 * normalize to `lifecycle: null` so views don't paint a misleading state.
 */
import { describe, it, expect } from 'vitest';

import { normalizeEvent } from '../eventModel';

const baseStart = new Date('2026-01-01T10:00:00Z');
const baseEnd = new Date('2026-01-01T11:00:00Z');

describe('normalizeEvent — lifecycle', () => {
  it('defaults to null when no lifecycle is supplied', () => {
    const ev = normalizeEvent({ id: 'e1', title: 't', start: baseStart, end: baseEnd });
    expect(ev.lifecycle).toBeNull();
  });

  it('passes through a top-level lifecycle field', () => {
    const ev = normalizeEvent({
      id: 'e2',
      title: 't',
      start: baseStart,
      end: baseEnd,
      lifecycle: 'pending',
    });
    expect(ev.lifecycle).toBe('pending');
  });

  it('falls back to meta.lifecycle when the top-level field is unset', () => {
    const ev = normalizeEvent({
      id: 'e3',
      title: 't',
      start: baseStart,
      end: baseEnd,
      meta: { lifecycle: 'scheduled' },
    });
    expect(ev.lifecycle).toBe('scheduled');
  });

  it('rejects a non-lifecycle value and falls back to null', () => {
    const ev = normalizeEvent({
      id: 'e4',
      title: 't',
      start: baseStart,
      end: baseEnd,
      // intentional cast — host might supply an arbitrary string
      lifecycle: 'wibble' as unknown as 'draft',
    });
    expect(ev.lifecycle).toBeNull();
  });

  it('derives lifecycle from approval stage when none is set', () => {
    const cases: Array<[string, string | null]> = [
      ['requested',      'pending'],
      ['pending_higher', 'pending'],
      ['approved',       'approved'],
      ['finalized',      'scheduled'],
      ['denied',         null],
    ];
    for (const [stage, expected] of cases) {
      const ev = normalizeEvent({
        id: `e-${stage}`,
        title: 't',
        start: baseStart,
        end: baseEnd,
        meta: {
          approvalStage: { stage, updatedAt: '2026-04-29T00:00:00Z', history: [] },
        },
      });
      expect(ev.lifecycle).toBe(expected);
    }
  });

  it('explicit lifecycle wins over derived approval-stage lifecycle', () => {
    const ev = normalizeEvent({
      id: 'e5',
      title: 't',
      start: baseStart,
      end: baseEnd,
      lifecycle: 'completed',
      meta: {
        approvalStage: { stage: 'requested', updatedAt: '2026-04-29T00:00:00Z', history: [] },
      },
    });
    expect(ev.lifecycle).toBe('completed');
  });
});
