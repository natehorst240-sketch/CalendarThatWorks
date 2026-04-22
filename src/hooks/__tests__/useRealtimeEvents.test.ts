/**
 * useRealtimeEvents regression tests.
 *
 * Uses a minimal Supabase client stub whose .channel().on().subscribe() chain
 * matches the real Supabase fluent API (each method returns the same channel).
 *
 * Key regression: realtime INSERTs that arrive BEFORE the initial select()
 * resolves must not be discarded when the fetch finally sets state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useRealtimeEvents } from '../useRealtimeEvents';

afterEach(() => cleanup());

// ── Stub helpers ──────────────────────────────────────────────────────────────

/**
 * Builds a minimal Supabase client stub that matches the fluent chain:
 *   client.channel(name).on(event, filter, cb).subscribe(statusCb) → channel
 *
 * Returns { client, fireRealtime, resolveSelect }.
 */
function makeClient() {
  type RealtimePayload = { eventType: string; new: unknown; old: unknown };
  let realtimeCallback: ((payload: RealtimePayload) => void) | null = null;
  let selectResolve:    ((value: { data: unknown[]; error: null }) => void) | null = null;
  const selectPromise  = new Promise<{ data: unknown[]; error: null }>(res => { selectResolve = res; });

  // The channel is a single object that .on() and .subscribe() both return
  // so that channelRef.current gets the object with .unsubscribe on it.
  const channel = {
    on(_event: string, _filter: unknown, cb: (payload: RealtimePayload) => void) {
      realtimeCallback = cb;
      return this;                          // fluent — same channel
    },
    subscribe(statusCb: (status: string) => void) {
      statusCb('SUBSCRIBED');
      return this;                          // fluent — same channel
    },
    unsubscribe: vi.fn(),
  };

  const client = {
    channel: () => channel,
    from:    () => ({ select: () => selectPromise }),
  };

  return {
    client,
    fireRealtime: (eventType: string, row: unknown) =>
      realtimeCallback?.({ eventType, new: row, old: row }),
    resolveSelect: (rows: unknown[]) =>
      selectResolve?.({ data: rows, error: null }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useRealtimeEvents', () => {
  it('applies realtime INSERT before initial fetch resolves', async () => {
    const { client, fireRealtime, resolveSelect } = makeClient();

    const { result } = renderHook(() =>
      useRealtimeEvents({ supabaseClient: client, table: 'events' }),
    );

    // Realtime INSERT arrives BEFORE initial select resolves
    act(() => fireRealtime('INSERT', { id: 'rt-1', title: 'Realtime event' }));
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe('rt-1');

    // Now the initial fetch resolves with a different row
    await act(async () => resolveSelect([{ id: 'init-1', title: 'Initial event' }]));

    // Both rows must be present — realtime INSERT must not be discarded
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    const ids = result.current.events.map(e => e.id);
    expect(ids).toContain('rt-1');
    expect(ids).toContain('init-1');
  });

  it('initial data wins for rows already known to both fetch and realtime', async () => {
    const { client, fireRealtime, resolveSelect } = makeClient();

    const { result } = renderHook(() =>
      useRealtimeEvents({ supabaseClient: client, table: 'events' }),
    );

    // Realtime INSERT with version A
    act(() => fireRealtime('INSERT', { id: 'shared', title: 'Realtime version' }));

    // Initial fetch resolves with canonical version of the same row
    await act(async () =>
      resolveSelect([{ id: 'shared', title: 'Initial version' }]),
    );

    await waitFor(() =>
      expect(result.current.events.find(e => e.id === 'shared')?.title)
        .toBe('Initial version'),
    );
    expect(result.current.events).toHaveLength(1);
  });

  it('does not call setState after unmount (cancellation guard)', async () => {
    const { client, resolveSelect } = makeClient();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() =>
      useRealtimeEvents({ supabaseClient: client, table: 'events' }),
    );

    unmount();

    // Resolving the select after unmount must be a no-op
    await act(async () => resolveSelect([{ id: 'late', title: 'Late row' }]));

    // React warns "Can't perform a React state update on an unmounted component"
    // if the cancellation guard is missing — verify it is NOT called
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('unmounted'),
    );
    errorSpy.mockRestore();
  });
});
