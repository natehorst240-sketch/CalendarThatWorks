/**
 * useCalendarEngine — runtime-guard regression tests.
 *
 * Covers:
 * - try/catch around engine construction (issue #599 P0-2)
 * - Undo history preserved across rapid allNormalized updates (issue #599 P1-8)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCalendarEngine } from '../useCalendarEngine';
import type { ResourcePool } from '../../core/pools/resourcePoolSchema';

afterEach(() => cleanup());

// Stable references — `useCalendarEngine` syncs `allNormalized` into the engine
// in an effect keyed on its identity, so a fresh literal each render would loop.
const NO_EVENTS: never[] = [];
const ANNOUNCER_REF = { current: null };
const RANGE = { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) };

const SEED = [{ id: 'e1', title: 'A', start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10), allDay: false }];

describe('useCalendarEngine — undo history race (issue #599 P1-8)', () => {
  it('grace period preserves undo when poll arrives and consumes counter before onEventSave prop re-render', () => {
    // The race: poll fires → counter 1→0 → onEventSave re-render would clear undo.
    // Grace period check should prevent the clear when time < 3 s since last mutation.
    const pollUpdate   = [...SEED, { id: 'poll', title: 'Poll', start: new Date(2026, 0, 2, 9), end: new Date(2026, 0, 2, 10), allDay: false }];
    const saveUpdate   = [...pollUpdate]; // same content, new reference (onEventSave re-render)

    const { result, rerender } = renderHook(
      ({ events }: { events: typeof SEED }) =>
        useCalendarEngine({ allNormalized: events, announcerRef: ANNOUNCER_REF, range: RANGE }),
      { initialProps: { events: SEED } },
    );

    act(() => {
      result.current.applyEngineOp(
        { type: 'update', id: 'e1', patch: { title: 'Edited' }, source: 'form' },
        () => {},
      );
    });

    expect(result.current.undoManager.canUndo).toBe(true);

    // Poll arrives and consumes the counter.
    act(() => { rerender({ events: pollUpdate }); });
    // onEventSave-triggered re-render arrives immediately after (within grace window).
    act(() => { rerender({ events: saveUpdate }); });

    expect(result.current.undoManager.canUndo).toBe(true);
  });

  it('clears undo history when an external update arrives after the grace window expires', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ events }: { events: typeof SEED }) =>
        useCalendarEngine({ allNormalized: events, announcerRef: ANNOUNCER_REF, range: RANGE }),
      { initialProps: { events: SEED } },
    );

    act(() => {
      result.current.applyEngineOp(
        { type: 'update', id: 'e1', patch: { title: 'Edited' }, source: 'form' },
        () => {},
      );
    });

    // First update consumes the counter (simulates the onEventSave-triggered re-render).
    act(() => { rerender({ events: [...SEED] }); });

    // Advance past the 3 s grace window.
    vi.advanceTimersByTime(4_000);

    // External update after grace — undo history should be cleared.
    act(() => { rerender({ events: [...SEED] }); });

    expect(result.current.undoManager.canUndo).toBe(false);
    vi.useRealTimers();
  });
});

describe('useCalendarEngine — engine-init failures', () => {
  it('mounts normally with no init data', () => {
    const { result } = renderHook(() => useCalendarEngine({ allNormalized: NO_EVENTS, announcerRef: ANNOUNCER_REF, range: RANGE }));
    expect(result.current.engine).toBeTruthy();
    expect(result.current.undoManager).toBeTruthy();
  });

  it('rethrows an init failure with a "failed to initialize" message and the underlying cause', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A pool whose `id` getter throws — `createInitialState` reads `p.id`.
    const poisonPool = {
      get id(): string { throw new Error('poison-pool'); },
    } as unknown as ResourcePool;

    expect(() =>
      renderHook(() => useCalendarEngine({ allNormalized: NO_EVENTS, rawPools: [poisonPool], announcerRef: ANNOUNCER_REF, range: RANGE })),
    ).toThrow(/failed to initialize.*poison-pool/i);

    errSpy.mockRestore();
  });
});
