/**
 * useOwnerConfig — runtime-guard regression tests.
 *
 * Covers: `isOwner` derivation, and reloading persisted config when the host
 * switches `calendarId` (the storage namespace key) — previously the config
 * stayed pinned to the calendar mounted with.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useOwnerConfig } from '../useOwnerConfig';
import { saveConfig, loadConfig } from '../../core/configSchema';

afterEach(() => {
  cleanup();
  try { localStorage.clear(); } catch { /* noop */ }
});

const A = 'wc-owner-cfg-test-a';
const B = 'wc-owner-cfg-test-b';

describe('useOwnerConfig', () => {
  it('derives isOwner from role / devMode', () => {
    expect(renderHook(() => useOwnerConfig({ calendarId: A, role: 'admin' })).result.current.isOwner).toBe(true);
    expect(renderHook(() => useOwnerConfig({ calendarId: A, role: 'user' })).result.current.isOwner).toBe(false);
    expect(renderHook(() => useOwnerConfig({ calendarId: A, role: 'user', devMode: true })).result.current.isOwner).toBe(true);
  });

  it('reloads config from storage when calendarId changes', () => {
    saveConfig(A, { title: 'Calendar A' });
    saveConfig(B, { title: 'Calendar B' });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useOwnerConfig({ calendarId: id }),
      { initialProps: { id: A } },
    );
    expect(result.current.config['title']).toBe('Calendar A');

    rerender({ id: B });
    expect(result.current.config['title']).toBe('Calendar B');

    rerender({ id: A });
    expect(result.current.config['title']).toBe('Calendar A');
  });

  it('does not notify onConfigSave when reloading on a calendarId change', () => {
    saveConfig(A, { title: 'A' });
    saveConfig(B, { title: 'B' });
    const calls: unknown[] = [];
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useOwnerConfig({ calendarId: id, onConfigSave: (c) => calls.push(c) }),
      { initialProps: { id: A } },
    );
    rerender({ id: B });
    expect(calls).toEqual([]);
  });

  it('updateConfig persists to storage and notifies onConfigSave (from the commit effect, not the updater)', () => {
    const saved: Array<Record<string, unknown>> = [];
    const { result } = renderHook(() => useOwnerConfig({ calendarId: A, onConfigSave: (c) => saved.push(c as Record<string, unknown>) }));

    act(() => result.current.updateConfig({ title: 'Edited' }));

    expect(result.current.config['title']).toBe('Edited');
    expect(loadConfig(A)['title']).toBe('Edited'); // persisted
    expect(saved).toHaveLength(1);
    expect(saved[0]!['title']).toBe('Edited');
  });

  it('updateConfig accepts a functional updater', () => {
    const { result } = renderHook(() => useOwnerConfig({ calendarId: A }));
    act(() => result.current.updateConfig({ count: 1 }));
    act(() => result.current.updateConfig((prev) => ({ ...prev, count: (prev['count'] as number) + 1 })));
    expect(result.current.config['count']).toBe(2);
  });

  it('persists an edit to the calendar that was active at edit time, even if the host switches calendars in the same render', () => {
    saveConfig(A, { title: 'Calendar A' });
    saveConfig(B, { title: 'Calendar B' });
    const saved: Array<Record<string, unknown>> = [];
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useOwnerConfig({ calendarId: id, onConfigSave: (c) => saved.push(c as Record<string, unknown>) }),
      { initialProps: { id: A } },
    );

    // Edit (against calendar A) and switch to B, batched in one act() — the race
    // the reviewer flagged: the save must not redirect to B's namespace or vanish.
    act(() => {
      result.current.updateConfig({ title: 'Edited A' });
      rerender({ id: B });
    });

    expect(loadConfig(A)['title']).toBe('Edited A');   // persisted to A
    expect(loadConfig(B)['title']).toBe('Calendar B');  // B untouched
    expect(result.current.config['title']).toBe('Calendar B'); // now showing B
    expect(saved).toHaveLength(1);
    expect(saved[0]!['title']).toBe('Edited A');        // onConfigSave got A's edited config
  });
});
