import { describe, it, expect } from 'vitest';
import {
  clientWins,
  serverWins,
  latestWins,
  manualResolve,
  resolverFor,
  ConflictError,
} from '../sync/conflictStrategies';
import type { CalendarEventV1 } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<CalendarEventV1> = {}): CalendarEventV1 {
  return {
    id: 'ev-1',
    title: 'Meeting',
    start: new Date('2026-01-10T09:00:00Z'),
    end:   new Date('2026-01-10T10:00:00Z'),
    ...overrides,
  } as CalendarEventV1;
}

const local  = makeEvent({ title: 'Local'  });
const server = makeEvent({ title: 'Server' });

// ─── clientWins ───────────────────────────────────────────────────────────────

describe('clientWins', () => {
  it('returns the local version', () => {
    expect(clientWins(local, server)).toBe(local);
  });
});

// ─── serverWins ───────────────────────────────────────────────────────────────

describe('serverWins', () => {
  it('returns the server version', () => {
    expect(serverWins(local, server)).toBe(server);
  });
});

// ─── latestWins ───────────────────────────────────────────────────────────────

describe('latestWins', () => {
  it('returns server when both have no timestamps', () => {
    expect(latestWins(local, server)).toBe(server);
  });

  it('returns server when local has no timestamp', () => {
    const srv = makeEvent({ sync: { updatedAt: new Date('2026-01-10T12:00:00Z') } } as any);
    expect(latestWins(local, srv)).toBe(srv);
  });

  it('returns local when server has no timestamp', () => {
    const loc = makeEvent({ sync: { updatedAt: new Date('2026-01-10T12:00:00Z') } } as any);
    expect(latestWins(loc, server)).toBe(loc);
  });

  it('returns local when local updatedAt is newer', () => {
    const loc = makeEvent({ sync: { updatedAt: new Date('2026-01-10T14:00:00Z') } } as any);
    const srv = makeEvent({ sync: { updatedAt: new Date('2026-01-10T12:00:00Z') } } as any);
    expect(latestWins(loc, srv)).toBe(loc);
  });

  it('returns server when server updatedAt is newer', () => {
    const loc = makeEvent({ sync: { updatedAt: new Date('2026-01-10T10:00:00Z') } } as any);
    const srv = makeEvent({ sync: { updatedAt: new Date('2026-01-10T14:00:00Z') } } as any);
    expect(latestWins(loc, srv)).toBe(srv);
  });

  it('returns local when timestamps are equal (local >= server)', () => {
    const ts  = new Date('2026-01-10T12:00:00Z');
    const loc = makeEvent({ sync: { updatedAt: ts } } as any);
    const srv = makeEvent({ sync: { updatedAt: ts } } as any);
    expect(latestWins(loc, srv)).toBe(loc);
  });

  it('falls back to lastSyncedAt when updatedAt is absent', () => {
    const loc = makeEvent({ sync: { lastSyncedAt: new Date('2026-01-10T13:00:00Z') } } as any);
    const srv = makeEvent({ sync: { lastSyncedAt: new Date('2026-01-10T11:00:00Z') } } as any);
    expect(latestWins(loc, srv)).toBe(loc);
  });
});

// ─── manualResolve ────────────────────────────────────────────────────────────

describe('manualResolve', () => {
  it('throws ConflictError with both versions', () => {
    expect(() => manualResolve(local, server)).toThrow(ConflictError);
  });

  it('ConflictError has name "ConflictError"', () => {
    try {
      manualResolve(local, server);
    } catch (e) {
      expect((e as ConflictError).name).toBe('ConflictError');
    }
  });

  it('ConflictError exposes local and server properties', () => {
    try {
      manualResolve(local, server);
    } catch (e) {
      const err = e as ConflictError;
      expect(err.local).toBe(local);
      expect(err.server).toBe(server);
    }
  });
});

// ─── ConflictError ────────────────────────────────────────────────────────────

describe('ConflictError', () => {
  it('can be constructed directly', () => {
    const err = new ConflictError('msg', local, server);
    expect(err.message).toBe('msg');
    expect(err.local).toBe(local);
    expect(err.server).toBe(server);
    expect(err instanceof Error).toBe(true);
  });
});

// ─── resolverFor ─────────────────────────────────────────────────────────────

describe('resolverFor', () => {
  it('"client-wins" returns clientWins', () => {
    expect(resolverFor('client-wins')).toBe(clientWins);
  });

  it('"server-wins" returns serverWins', () => {
    expect(resolverFor('server-wins')).toBe(serverWins);
  });

  it('"latest-wins" returns latestWins', () => {
    expect(resolverFor('latest-wins')).toBe(latestWins);
  });

  it('"manual" returns manualResolve', () => {
    expect(resolverFor('manual')).toBe(manualResolve);
  });

  it('passes through a custom function unchanged', () => {
    const custom = () => local;
    expect(resolverFor(custom)).toBe(custom);
  });

  it('throws for unknown strategy string', () => {
    expect(() => resolverFor('unknown' as any)).toThrow(/Unknown conflict strategy/);
  });
});
