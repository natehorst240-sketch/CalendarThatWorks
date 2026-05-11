import { describe, it, expect, vi, afterEach } from 'vitest';
import { createId } from '../createId';

describe('createId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a string with the given prefix', () => {
    const id = createId('evt');
    expect(id).toMatch(/^evt-/);
  });

  it('uses default prefix "id" when none given', () => {
    const id = createId();
    expect(id).toMatch(/^id-/);
  });

  it('uses randomUUID when available', () => {
    const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(mockUUID as `${string}-${string}-${string}-${string}-${string}`);
    const id = createId('test');
    expect(id).toBe(`test-${mockUUID}`);
  });

  it('returns unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createId('x')));
    expect(ids.size).toBe(20);
  });

  it('falls back to getRandomValues when randomUUID is absent', () => {
    const orig = globalThis.crypto.randomUUID;
    // @ts-expect-error intentional test override
    globalThis.crypto.randomUUID = undefined;
    try {
      const id = createId('fb');
      expect(id).toMatch(/^fb-[0-9a-f-]{36}$/);
    } finally {
      globalThis.crypto.randomUUID = orig;
    }
  });

  it('fallback produces a RFC4122-shaped UUID', () => {
    const orig = globalThis.crypto.randomUUID;
    // @ts-expect-error intentional test override
    globalThis.crypto.randomUUID = undefined;
    try {
      const id = createId('x');
      const uuid = id.slice('x-'.length);
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      globalThis.crypto.randomUUID = orig;
    }
  });

  it('omits prefix separator when prefix is empty string', () => {
    const id = createId('');
    expect(id).not.toMatch(/^-/);
  });

  it('throws when neither randomUUID nor getRandomValues is available', () => {
    const origUUID = globalThis.crypto.randomUUID;
    const origGetRandom = globalThis.crypto.getRandomValues;
    // @ts-expect-error intentional test override
    globalThis.crypto.randomUUID = undefined;
    // @ts-expect-error intentional test override
    globalThis.crypto.getRandomValues = undefined;
    try {
      expect(() => createId()).toThrow('Secure ID generation requires Web Crypto support.');
    } finally {
      globalThis.crypto.randomUUID = origUUID;
      globalThis.crypto.getRandomValues = origGetRandom;
    }
  });
});
