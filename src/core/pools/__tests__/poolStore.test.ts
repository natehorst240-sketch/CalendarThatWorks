/**
 * poolStore — localStorage persistence specs (issue #212).
 *
 * Pins the acceptance criterion "round-robin cursor persists across
 * page reloads" at the storage-helper level: once a pool (including
 * its rrCursor) is saved, a fresh load returns the same state that
 * the engine can be rehydrated with.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { savePools, loadPools, clearPools, poolStorageKey } from '../poolStore';
import type { ResourcePool } from '../resourcePoolSchema';

const CAL = 'test-cal';

beforeEach(() => {
  localStorage.clear();
});

const pool = (patch: Partial<ResourcePool> & Pick<ResourcePool, 'id' | 'memberIds'>): ResourcePool => ({
  name:     patch.id.toUpperCase(),
  strategy: 'round-robin',
  ...patch,
});

describe('poolStore', () => {
  it('returns [] when no entry is stored', () => {
    expect(loadPools(CAL)).toEqual([]);
  });

  it('round-trips a pools array, preserving rrCursor', () => {
    const pools: ResourcePool[] = [
      pool({ id: 'agents', memberIds: ['a', 'b', 'c'], rrCursor: 2 }),
      pool({ id: 'rooms',  memberIds: ['r1', 'r2'],   strategy: 'first-available' }),
    ];
    savePools(CAL, pools);

    const loaded = loadPools(CAL);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.id).toBe('agents');
    expect(loaded[0]!.rrCursor).toBe(2);
    expect(loaded[1]!.strategy).toBe('first-available');
  });

  it('accepts a Map and serializes only the values', () => {
    const map = new Map<string, ResourcePool>([
      ['agents', pool({ id: 'agents', memberIds: ['a'], rrCursor: 0 })],
    ]);
    savePools(CAL, map);

    const loaded = loadPools(CAL);
    expect(loaded).toEqual([
      { id: 'agents', name: 'AGENTS', strategy: 'round-robin', memberIds: ['a'], rrCursor: 0 },
    ]);
  });

  it('omits rrCursor / disabled when absent', () => {
    savePools(CAL, [pool({ id: 'p', memberIds: ['m'] })]);
    const loaded = loadPools(CAL);
    expect(loaded[0]).not.toHaveProperty('rrCursor');
    expect(loaded[0]).not.toHaveProperty('disabled');
  });

  it('drops entries with an unknown strategy instead of corrupting the load', () => {
    localStorage.setItem(poolStorageKey(CAL), JSON.stringify([
      { id: 'bad',  name: 'BAD',  memberIds: ['x'], strategy: 'random' },
      { id: 'good', name: 'GOOD', memberIds: ['x'], strategy: 'round-robin' },
    ]));
    expect(loadPools(CAL).map(p => p.id)).toEqual(['good']);
  });

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(poolStorageKey(CAL), '{not-json');
    expect(loadPools(CAL)).toEqual([]);
  });

  it('clearPools removes the entry', () => {
    savePools(CAL, [pool({ id: 'x', memberIds: ['m'] })]);
    clearPools(CAL);
    expect(loadPools(CAL)).toEqual([]);
  });

  it('keys are scoped per calendarId', () => {
    savePools('cal-a', [pool({ id: 'pa', memberIds: ['a'] })]);
    savePools('cal-b', [pool({ id: 'pb', memberIds: ['b'] })]);
    expect(loadPools('cal-a').map(p => p.id)).toEqual(['pa']);
    expect(loadPools('cal-b').map(p => p.id)).toEqual(['pb']);
  });
});
