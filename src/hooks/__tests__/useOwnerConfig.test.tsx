/**
 * useOwnerConfig — runtime-guard regression tests.
 *
 * Covers: `isOwner` derivation, and reloading persisted config when the host
 * switches `calendarId` (the storage namespace key) — previously the config
 * stayed pinned to the calendar mounted with.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useOwnerConfig } from '../useOwnerConfig';
import { saveConfig } from '../../core/configSchema';

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
});
