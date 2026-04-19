import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useResourceLocations } from '../useResourceLocations';
import type { LocationData, LocationProvider } from '../../types/assets';

function makeProvider(opts: {
  refreshIntervalMs?: number;
  data?: Record<string, LocationData>;
  init?: LocationProvider['init'];
  dispose?: LocationProvider['dispose'];
  subscribe?: LocationProvider['subscribe'];
} = {}) {
  const fetchLocation = vi.fn(async (id: string) => {
    return opts.data?.[id] ?? {
      text:   `loc-${id}`,
      status: 'live',
      asOf:   new Date().toISOString(),
    } satisfies LocationData;
  });
  const provider: LocationProvider = {
    id: 'test',
    refreshIntervalMs: opts.refreshIntervalMs ?? 0,
    fetchLocation,
    init: opts.init,
    dispose: opts.dispose,
    subscribe: opts.subscribe,
  };
  return { provider, fetchLocation };
}

describe('useResourceLocations', () => {
  it('returns an empty map when provider is null', () => {
    const { result } = renderHook(() => useResourceLocations(['A'], null));
    expect(result.current.size).toBe(0);
  });

  it('fetches each resource once on mount for a non-polling provider', async () => {
    const { provider, fetchLocation } = makeProvider();
    const { result } = renderHook(() => useResourceLocations(['A', 'B'], provider));

    await waitFor(() => {
      expect(result.current.get('A')?.text).toBe('loc-A');
      expect(result.current.get('B')?.text).toBe('loc-B');
    });
    expect(fetchLocation).toHaveBeenCalledTimes(2);
  });

  it('polls at refreshIntervalMs when subscribe is absent (fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const { provider, fetchLocation } = makeProvider({ refreshIntervalMs: 5000 });
      const { unmount } = renderHook(() => useResourceLocations(['A'], provider));

      // Drain microtasks so initial fetch resolves.
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(fetchLocation).toHaveBeenCalledTimes(1);

      // One interval tick → second fetch.
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });
      expect(fetchLocation.mock.calls.length).toBeGreaterThanOrEqual(2);

      unmount();
      const afterUnmount = fetchLocation.mock.calls.length;
      vi.advanceTimersByTime(20000);
      expect(fetchLocation.mock.calls.length).toBe(afterUnmount);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps refreshIntervalMs below 5000ms to 5000ms (fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const { provider, fetchLocation } = makeProvider({ refreshIntervalMs: 100 });
      renderHook(() => useResourceLocations(['A'], provider));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      const before = fetchLocation.mock.calls.length;
      // 1s passes — if clamping works, no new fetch fires.
      vi.advanceTimersByTime(1000);
      expect(fetchLocation.mock.calls.length).toBe(before);

      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });
      expect(fetchLocation.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses subscribe when provided and skips polling', async () => {
    const updaters: Record<string, (d: LocationData) => void> = {};
    const subUnsub = vi.fn();
    const { provider, fetchLocation } = makeProvider({
      refreshIntervalMs: 1000, // intentionally high; subscribe must win
      subscribe: (id, cb) => {
        updaters[id] = cb;
        return subUnsub;
      },
    });

    const { result } = renderHook(() => useResourceLocations(['A'], provider));

    // Push a live update and assert it lands.
    act(() => {
      updaters.A({ text: 'pushed', status: 'live', asOf: '2026-04-17T00:00:00Z' });
    });
    expect(result.current.get('A')?.text).toBe('pushed');

    // No additional fetches should fire on a timer when subscribe is in use.
    vi.useFakeTimers();
    try {
      const before = fetchLocation.mock.calls.length;
      vi.advanceTimersByTime(30000);
      expect(fetchLocation.mock.calls.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls init() once on mount and dispose() on unmount', async () => {
    const init = vi.fn(async () => {});
    const dispose = vi.fn();
    const { provider } = makeProvider({ init, dispose });

    const { unmount } = renderHook(() => useResourceLocations(['A'], provider));
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    expect(dispose).not.toHaveBeenCalled();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('reports status=error when fetchLocation rejects', async () => {
    const provider: LocationProvider = {
      id: 'broken',
      refreshIntervalMs: 0,
      fetchLocation: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const { result } = renderHook(() => useResourceLocations(['A'], provider));
    await waitFor(() => expect(result.current.get('A')?.status).toBe('error'));
  });
});
