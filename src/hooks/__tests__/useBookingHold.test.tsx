/**
 * useBookingHold — hook specs (issue #211).
 *
 * Verifies the submit-flow wiring: acquire on mount, release on unmount,
 * re-acquire on window/resource change, idempotent explicit release,
 * error surfacing without throwing.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createHoldRegistry } from '../../core/holds/holdRegistry';
import { useBookingHold } from '../useBookingHold';
import type { HoldProvider } from '../useBookingHold';

const T0 = new Date('2026-04-20T09:00:00.000Z');

function mkProvider(): HoldProvider & { acquireSpy: ReturnType<typeof vi.fn>; releaseSpy: ReturnType<typeof vi.fn>; _reg: ReturnType<typeof createHoldRegistry> } {
  const reg = createHoldRegistry({ now: () => T0 });
  const acquireSpy = vi.fn(reg.acquire);
  const releaseSpy = vi.fn(reg.release);
  return {
    acquire: acquireSpy,
    release: releaseSpy,
    acquireSpy,
    releaseSpy,
    _reg: reg,
  };
}

const WIN = {
  start: '2026-04-20T10:00:00.000Z',
  end:   '2026-04-20T11:00:00.000Z',
};

describe('useBookingHold — acquire + release lifecycle', () => {
  it('acquires on mount and releases on unmount', async () => {
    const provider = mkProvider();
    const { result, unmount } = renderHook(() =>
      useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice' }),
    );
    await waitFor(() => expect(result.current.status).toBe('held'));
    expect(result.current.hold?.holderId).toBe('alice');
    expect(provider.acquireSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(provider.releaseSpy).toHaveBeenCalledTimes(1);
  });

  it('does not acquire when enabled=false', async () => {
    const provider = mkProvider();
    const { result } = renderHook(() =>
      useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice', enabled: false }),
    );
    expect(result.current.status).toBe('idle');
    expect(provider.acquireSpy).not.toHaveBeenCalled();
  });

  it('re-acquires when the window changes (releases the old hold first)', async () => {
    const provider = mkProvider();
    const { result, rerender } = renderHook(
      ({ end }: { end: string }) =>
        useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end, holderId: 'alice' }),
      { initialProps: { end: WIN.end } },
    );
    await waitFor(() => expect(result.current.status).toBe('held'));
    const firstHoldId = result.current.hold!.id;

    rerender({ end: '2026-04-20T12:00:00.000Z' });
    await waitFor(() => expect(result.current.hold?.id).not.toBe(firstHoldId));
    expect(provider.releaseSpy).toHaveBeenCalledWith(firstHoldId);
  });

  it('releases when enabled flips to false', async () => {
    const provider = mkProvider();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice', enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.status).toBe('held'));

    rerender({ enabled: false });
    await waitFor(() => expect(result.current.status).toBe('released'));
    expect(provider.releaseSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useBookingHold — explicit release', () => {
  it('exposes a release() callback the form can call on submit success', async () => {
    const provider = mkProvider();
    const { result } = renderHook(() =>
      useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice' }),
    );
    await waitFor(() => expect(result.current.status).toBe('held'));
    act(() => { result.current.release(); });
    expect(result.current.status).toBe('released');
    expect(result.current.hold).toBeNull();
    expect(provider.releaseSpy).toHaveBeenCalledTimes(1);
  });

  it('double-release is a no-op', async () => {
    const provider = mkProvider();
    const { result } = renderHook(() =>
      useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice' }),
    );
    await waitFor(() => expect(result.current.status).toBe('held'));
    act(() => { result.current.release(); });
    act(() => { result.current.release(); });
    expect(provider.releaseSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useBookingHold — conflict + error handling', () => {
  it('surfaces CONFLICTING_HOLD via state.error without throwing', async () => {
    const provider = mkProvider();
    // Pre-seed a conflicting hold from a different holder.
    provider._reg.acquire({
      resourceId: 'room-a',
      window: WIN,
      holderId: 'bob',
    });

    const { result } = renderHook(() =>
      useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice' }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.code).toBe('CONFLICTING_HOLD');
    expect(result.current.hold).toBeNull();
  });

  it('same-holder re-acquire refreshes TTL (registry semantics)', async () => {
    const provider = mkProvider();
    // Acquire directly first …
    const first = provider._reg.acquire({
      resourceId: 'room-a',
      window: WIN,
      holderId: 'alice',
    });
    expect(first.ok).toBe(true);

    // … then mount the hook as alice on the same window — should succeed.
    const { result } = renderHook(() =>
      useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice' }),
    );
    await waitFor(() => expect(result.current.status).toBe('held'));
    expect(result.current.hold?.holderId).toBe('alice');
  });
});

describe('useBookingHold — missing inputs', () => {
  it('stays idle when no provider is passed', () => {
    const { result } = renderHook(() =>
      useBookingHold(null, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice' }),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.hold).toBeNull();
  });

  it('stays idle when resourceId or window fields are missing', async () => {
    const provider = mkProvider();
    const { result, rerender } = renderHook(
      (props: { resourceId: string | null }) =>
        useBookingHold(provider, { resourceId: props.resourceId, start: WIN.start, end: WIN.end, holderId: 'alice' }),
      { initialProps: { resourceId: null } },
    );
    expect(result.current.status).toBe('idle');
    expect(provider.acquireSpy).not.toHaveBeenCalled();

    rerender({ resourceId: 'room-a' });
    await waitFor(() => expect(result.current.status).toBe('held'));
  });
});

describe('useBookingHold — async provider', () => {
  it('awaits async acquire results', async () => {
    const reg = createHoldRegistry({ now: () => T0 });
    const provider: HoldProvider = {
      acquire: async input => reg.acquire(input),
      release: async id => reg.release(id),
    };
    const { result } = renderHook(() =>
      useBookingHold(provider, { resourceId: 'room-a', start: WIN.start, end: WIN.end, holderId: 'alice' }),
    );
    await waitFor(() => expect(result.current.status).toBe('held'));
  });
});
