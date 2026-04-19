import { describe, it, expect } from 'vitest';
import { createManualLocationProvider } from '../ManualLocationProvider';

describe('ManualLocationProvider', () => {
  it('exposes id "manual" and refreshIntervalMs 0', () => {
    const provider = createManualLocationProvider();
    expect(provider.id).toBe('manual');
    expect(provider.refreshIntervalMs).toBe(0);
  });

  it('returns "Unknown" when no resources match', async () => {
    const provider = createManualLocationProvider();
    const data = await provider.fetchLocation('unknown-id');
    expect(data.text).toBe('Unknown');
    expect(data.status).toBe('unknown');
    expect(typeof data.asOf).toBe('string');
  });

  it('wraps a string meta.location into LocationData', async () => {
    const provider = createManualLocationProvider({
      resources: [{ id: 'N121AB', meta: { location: 'KPHX' } }],
    });
    const data = await provider.fetchLocation('N121AB');
    expect(data.text).toBe('KPHX');
    expect(data.status).toBe('unknown');
  });

  it('passes through a full LocationData object on meta.location', async () => {
    const provider = createManualLocationProvider({
      resources: [
        {
          id: 'N505CD',
          meta: {
            location: {
              text: 'Depot 3',
              status: 'live',
              asOf:   '2026-04-17T00:00:00Z',
              coords: { lat: 1, lon: 2 },
            },
          },
        },
      ],
    });
    const data = await provider.fetchLocation('N505CD');
    expect(data.text).toBe('Depot 3');
    expect(data.status).toBe('live');
    expect(data.asOf).toBe('2026-04-17T00:00:00Z');
    expect(data.coords).toEqual({ lat: 1, lon: 2 });
  });

  it('honors a custom metaKey', async () => {
    const provider = createManualLocationProvider({
      metaKey: 'pos',
      resources: [{ id: 'A', meta: { pos: 'On-base' } }],
    });
    const data = await provider.fetchLocation('A');
    expect(data.text).toBe('On-base');
  });

  it('uses getResource resolver when supplied (overrides static resources)', async () => {
    const provider = createManualLocationProvider({
      resources: [{ id: 'A', meta: { location: 'from-static' } }],
      getResource: (id) => ({ id, meta: { location: `from-resolver(${id})` } }),
    });
    const data = await provider.fetchLocation('A');
    expect(data.text).toBe('from-resolver(A)');
  });

  it('returns Unknown when meta.location is missing', async () => {
    const provider = createManualLocationProvider({
      resources: [{ id: 'X', meta: {} }],
    });
    const data = await provider.fetchLocation('X');
    expect(data.text).toBe('Unknown');
  });

  it('returns Unknown when meta.location is null', async () => {
    const provider = createManualLocationProvider({
      resources: [{ id: 'X', meta: { location: null } }],
    });
    const data = await provider.fetchLocation('X');
    expect(data.status).toBe('unknown');
  });

  it('ignores malformed objects that lack .text', async () => {
    const provider = createManualLocationProvider({
      resources: [{ id: 'X', meta: { location: { status: 'live' } } }],
    });
    const data = await provider.fetchLocation('X');
    expect(data.text).toBe('Unknown');
  });
});
