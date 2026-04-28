/**
 * poolStore — localStorage persistence specs (issue #212).
 *
 * Pins the acceptance criterion "round-robin cursor persists across
 * page reloads" at the storage-helper level: once a pool (including
 * its rrCursor) is saved, a fresh load returns the same state that
 * the engine can be rehydrated with.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { savePools, loadPools, loadPoolsDetailed, clearPools, poolStorageKey } from '../poolStore';
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

describe('loadPoolsDetailed', () => {
  it('reports zero drops on a clean load', () => {
    savePools(CAL, [pool({ id: 'p', memberIds: ['m'], rrCursor: 0 })]);
    const result = loadPoolsDetailed(CAL);
    expect(result.dropped).toBe(0);
    expect(result.storageError).toBe(false);
    expect(result.pools).toHaveLength(1);
  });

  it('reports the count of malformed entries instead of dropping silently', () => {
    localStorage.setItem(poolStorageKey(CAL), JSON.stringify([
      { id: 'good',  name: 'GOOD', memberIds: ['x'], strategy: 'round-robin' },
      { id: 'bad',   name: 'BAD',  memberIds: ['x'], strategy: 'random' },
      { /* totally wrong shape */ },
    ]));
    const result = loadPoolsDetailed(CAL);
    expect(result.pools.map(p => p.id)).toEqual(['good']);
    expect(result.dropped).toBe(2);
    expect(result.storageError).toBe(false);
  });

  it('flags storageError on malformed JSON', () => {
    localStorage.setItem(poolStorageKey(CAL), '{not-json');
    const result = loadPoolsDetailed(CAL);
    expect(result).toEqual({ pools: [], dropped: 0, storageError: true });
  });

  it('flags storageError when the top-level value is not an array', () => {
    localStorage.setItem(poolStorageKey(CAL), JSON.stringify({ not: 'an array' }));
    const result = loadPoolsDetailed(CAL);
    expect(result).toEqual({ pools: [], dropped: 0, storageError: true });
  });

  it('returns clean defaults when no entry is stored', () => {
    expect(loadPoolsDetailed(CAL)).toEqual({ pools: [], dropped: 0, storageError: false });
  });
});

describe('poolStore — v2 type/query (#386)', () => {
  it('round-trips type and query for query pools', () => {
    const pools: ResourcePool[] = [{
      id: 'reefer', name: 'Nearby Reefers',
      type: 'query',
      memberIds: [],
      query: {
        op: 'and',
        clauses: [
          { op: 'eq',  path: 'type',                      value:  'vehicle' },
          { op: 'eq',  path: 'capabilities.refrigerated', value:  true },
          { op: 'gte', path: 'capabilities.capacity_lbs', value:  80000 },
        ],
      },
      strategy: 'first-available',
    }];
    savePools(CAL, pools);
    const loaded = loadPools(CAL);
    expect(loaded).toEqual(pools);
  });

  it('drops entries with an unknown pool type', () => {
    localStorage.setItem(poolStorageKey(CAL), JSON.stringify([
      { id: 'good', name: 'OK', memberIds: ['x'], strategy: 'round-robin' },
      { id: 'bad',  name: 'BAD', memberIds: ['x'], strategy: 'round-robin', type: 'graphql' },
    ]));
    expect(loadPools(CAL).map(p => p.id)).toEqual(['good']);
  });

  it('drops entries with a non-object query', () => {
    localStorage.setItem(poolStorageKey(CAL), JSON.stringify([
      { id: 'bad', name: 'BAD', memberIds: [], strategy: 'first-available', type: 'query', query: 'not-an-object' },
    ]));
    expect(loadPools(CAL)).toEqual([]);
  });
});
