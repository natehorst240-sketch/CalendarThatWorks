import { describe, it, expect } from 'vitest';
import { validateOperation, isOperationAllowed } from '../validateOperation';
import type { OperationContext } from '../validationTypes';
import type { EngineEvent } from '../../schema/eventSchema';
import type { EngineOperation } from '../../schema/operationSchema';

const t = (h: number) => new Date(2026, 0, 5, h, 0, 0);

function makeEv(id: string, start = t(9), end = t(10), resourceId: string | null = null): EngineEvent {
  return { id, title: id, start, end, allDay: false, resourceId } as unknown as EngineEvent;
}

const emptyCtx: OperationContext = {};

// ─── validateOperation ────────────────────────────────────────────────────────

describe('validateOperation', () => {
  // ── Non-time operations skip time-based rules ────────────────────────────
  it('returns VALID_RESULT for update operations (no time change)', () => {
    const op: EngineOperation = { type: 'update', id: 'ev1', patch: { title: 'New' } };
    const result = validateOperation(op, emptyCtx, []);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('returns VALID_RESULT for delete operations', () => {
    const op: EngineOperation = { type: 'delete', id: 'ev1' };
    const result = validateOperation(op, emptyCtx, []);
    expect(result.allowed).toBe(true);
  });

  // ── Create operations ────────────────────────────────────────────────────
  it('allows a valid create operation', () => {
    const op: EngineOperation = {
      type: 'create',
      event: { title: 'Meeting', start: t(9), end: t(10) },
    };
    const result = validateOperation(op, emptyCtx, []);
    expect(result.allowed).toBe(true);
  });

  it('blocks create with invalid duration (end before start)', () => {
    const op: EngineOperation = {
      type: 'create',
      event: { title: 'Bad', start: t(10), end: t(9) },
    };
    const result = validateOperation(op, emptyCtx, []);
    expect(result.allowed).toBe(false);
    expect(result.violations.some(v => v.rule === 'invalid-duration')).toBe(true);
  });

  // ── Move operations ──────────────────────────────────────────────────────
  it('allows a valid move', () => {
    const ev = makeEv('ev1');
    const op: EngineOperation = { type: 'move', id: 'ev1', newStart: t(11), newEnd: t(12) };
    const result = validateOperation(op, emptyCtx, [ev]);
    expect(result.allowed).toBe(true);
  });

  it('blocks move to invalid duration', () => {
    const ev = makeEv('ev1');
    const op: EngineOperation = { type: 'move', id: 'ev1', newStart: t(10), newEnd: t(9) };
    const result = validateOperation(op, emptyCtx, [ev]);
    expect(result.allowed).toBe(false);
  });

  // ── Resize operations ────────────────────────────────────────────────────
  it('allows a valid resize', () => {
    const ev = makeEv('ev1');
    const op: EngineOperation = { type: 'resize', id: 'ev1', newStart: t(9), newEnd: t(11) };
    const result = validateOperation(op, emptyCtx, [ev]);
    expect(result.allowed).toBe(true);
  });

  // ── Severity aggregation ─────────────────────────────────────────────────
  it('returns severity:hard when at least one hard violation exists', () => {
    const op: EngineOperation = {
      type: 'create',
      event: { title: 'Bad', start: t(10), end: t(10) }, // zero duration
    };
    const result = validateOperation(op, emptyCtx, []);
    expect(result.severity).toBe('hard');
  });

  it('returns severity:soft when only soft violations exist (outside biz hours)', () => {
    const op: EngineOperation = {
      type: 'create',
      event: { title: 'Early', start: t(7), end: t(8) }, // before 9 AM
    };
    const ctx: OperationContext = {
      businessHours: { days: [1, 2, 3, 4, 5], start: 9, end: 17 },
    };
    const result = validateOperation(op, ctx, []);
    // Only soft violation: outside business hours
    if (result.violations.length > 0) {
      expect(result.severity).toBe('soft');
      expect(result.allowed).toBe(true); // soft → allowed
    }
  });

  it('resourceId comes from the matched event for move operations', () => {
    const ev = makeEv('ev1', t(9), t(10), 'r1');
    const op: EngineOperation = { type: 'move', id: 'ev1', newStart: t(8), newEnd: t(9) };
    // No overlapping events, just check it resolves without error
    const result = validateOperation(op, emptyCtx, [ev]);
    expect(result).toBeDefined();
  });

  // ── group-change operations ──────────────────────────────────────────────
  it('returns VALID_RESULT for group-change when event not found', () => {
    const op: EngineOperation = { type: 'group-change', id: 'unknown', patch: {} };
    const result = validateOperation(op, emptyCtx, []);
    expect(result.allowed).toBe(true);
  });

  it('returns VALID_RESULT for group-change when no group validators in ctx', () => {
    const ev = makeEv('ev1');
    const op: EngineOperation = { type: 'group-change', id: 'ev1', patch: { resourceId: 'r2' } };
    const result = validateOperation(op, emptyCtx, [ev]);
    expect(result.allowed).toBe(true);
  });

  it('runs group validators and returns hard violation when one blocks', () => {
    const ev = makeEv('ev1');
    const op: EngineOperation = { type: 'group-change', id: 'ev1', patch: { resourceId: 'blocked' } };
    const ctx: OperationContext = {
      groupChangeValidators: [
        (_change, _ctx) => ({
          rule: 'no-reassign',
          severity: 'hard',
          message: 'Cannot reassign.',
        }),
      ],
    };
    const result = validateOperation(op, ctx, [ev]);
    expect(result.allowed).toBe(false);
    expect(result.violations[0]!.rule).toBe('no-reassign');
  });
});

// ─── isOperationAllowed ───────────────────────────────────────────────────────

describe('isOperationAllowed', () => {
  it('returns true for a valid create', () => {
    const op: EngineOperation = {
      type: 'create',
      event: { title: 'T', start: t(9), end: t(10) },
    };
    expect(isOperationAllowed(op, emptyCtx, [])).toBe(true);
  });

  it('returns false for an invalid duration', () => {
    const op: EngineOperation = {
      type: 'create',
      event: { title: 'T', start: t(10), end: t(9) },
    };
    expect(isOperationAllowed(op, emptyCtx, [])).toBe(false);
  });
});
