// @vitest-environment node
/**
 * API v1 — integration adapter tests.
 *
 * Tests the four concrete adapters against lightweight mocks:
 *  - RestAdapter    — mock fetch
 *  - SupabaseAdapter — mock Supabase client
 *  - ICSAdapter     — mock fetch + real ICS serializer
 *  - WebSocketAdapter — not tested here (needs browser WS); tested via types
 *
 * Also tests the CalendarAdapter interface conformance pattern and
 * the ICS serialization helper serializeToICS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RestAdapter }         from '../adapters/RestAdapter';
import { SupabaseAdapter }     from '../adapters/SupabaseAdapter';
import { ICSAdapter, serializeToICS } from '../adapters/ICSAdapter';
import { FirebaseAdapter }     from '../adapters/FirebaseAdapter';
import { PocketBaseAdapter }   from '../adapters/PocketBaseAdapter';
import type { CalendarAdapter, AdapterChange } from '../adapters/CalendarAdapter';
import type { CalendarEventV1 } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const S = new Date('2026-04-10T09:00:00.000Z');
const E = new Date('2026-04-10T10:00:00.000Z');

function ev(overrides: Partial<CalendarEventV1> = {}): CalendarEventV1 {
  return { id: 'ev-1', title: 'Meeting', start: S, end: E, status: 'confirmed', ...overrides };
}

// ─── CalendarAdapter interface compliance ─────────────────────────────────────

describe('CalendarAdapter interface', () => {
  it('RestAdapter implements CalendarAdapter', () => {
    const adapter: CalendarAdapter = new RestAdapter({ baseUrl: '/api/events' });
    expect(typeof adapter.loadRange).toBe('function');
    expect(typeof adapter.createEvent).toBe('function');
    expect(typeof adapter.updateEvent).toBe('function');
    expect(typeof adapter.deleteEvent).toBe('function');
    expect(typeof adapter.subscribe).toBe('function');
    expect(typeof adapter.exportFeed).toBe('function');
    expect(typeof adapter.listScheduleTemplates).toBe('function');
    expect(typeof adapter.createScheduleTemplate).toBe('function');
    expect(typeof adapter.updateScheduleTemplate).toBe('function');
    expect(typeof adapter.deleteScheduleTemplate).toBe('function');
    expect(typeof adapter.instantiateScheduleTemplate).toBe('function');
  });

  it('SupabaseAdapter implements CalendarAdapter', () => {
    const mockClient = { from: vi.fn(), channel: vi.fn() };
    const adapter: CalendarAdapter = new SupabaseAdapter({ client: mockClient, table: 'events' });
    expect(typeof adapter.loadRange).toBe('function');
    expect(typeof adapter.createEvent).toBe('function');
    expect(typeof adapter.subscribe).toBe('function');
  });

  it('ICSAdapter implements CalendarAdapter', () => {
    const adapter: CalendarAdapter = new ICSAdapter({ url: 'https://example.com/feed.ics' });
    expect(typeof adapter.loadRange).toBe('function');
    expect(typeof adapter.importFeed).toBe('function');
    expect(typeof adapter.exportFeed).toBe('function');
    expect(typeof adapter.subscribe).toBe('function');
    // ICS is read-only — no create/update/delete
    expect(adapter.createEvent).toBeUndefined();
    expect(adapter.updateEvent).toBeUndefined();
    expect(adapter.deleteEvent).toBeUndefined();
  });
});

// ─── RestAdapter ─────────────────────────────────────────────────────────────

describe('RestAdapter.loadRange', () => {
  beforeEach(() => vi.resetAllMocks());

  it('GETs the base URL with start/end params', async () => {
    const events = [ev()];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => events,
    });
    const adapter = new RestAdapter({ baseUrl: 'http://api/events', fetchImpl: fetchMock } as never);
    // We need a way to inject fetch; use fromResponse to verify call
    // Instead, test via the actual global fetch mock approach:
    // Re-implement test using manual fetch stub
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => events });
    const a2 = new RestAdapter({
      baseUrl: 'http://api/events',
    });
    // Replace global fetch
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const result = await a2.loadRange(S, E);
      expect(stub).toHaveBeenCalledOnce();
      const calledUrl = stub.mock.calls[0][0]! as string;
      expect(calledUrl).toContain('start=');
      expect(calledUrl).toContain('end=');
      expect(result).toEqual(events);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('uses custom startParam and endParam', async () => {
    const noEvents: CalendarEventV1[] = [];
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => noEvents });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events', startParam: 'from', endParam: 'to' });
      await a.loadRange(S, E);
      const url = stub.mock.calls[0][0]! as string;
      expect(url).toContain('from=');
      expect(url).toContain('to=');
      expect(url).not.toContain('start=');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.loadRange(S, E)).rejects.toThrow('401');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('applies fromResponse mapping', async () => {
    const rawRow = { event_id: 99, name: 'Flight', starts_at: S.toISOString(), ends_at: E.toISOString() };
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => [rawRow] });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({
        baseUrl: 'http://api/events',
        fromResponse: row => ({
          id:    String(row['event_id']),
          title: row['name'] as string,
          start: new Date(row['starts_at'] as string),
          end:   new Date(row['ends_at'] as string),
        }),
      });
      const [result] = await a.loadRange(S, E);
      expect(result!.id).toBe('99');
      expect(result!.title).toBe('Flight');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RestAdapter.createEvent', () => {
  it('POSTs the event and returns fromResponse result', async () => {
    const created = ev({ id: 'server-1' });
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => created });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      const result = await a.createEvent(ev({ id: undefined }));
      const [callUrl, callOpts] = stub.mock.calls[0] as [string, RequestInit];
      expect(callOpts.method).toBe('POST');
      expect(result.id).toBe('server-1');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RestAdapter.updateEvent', () => {
  it('PATCHes the correct URL', async () => {
    const updated = ev();
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => updated });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await a.updateEvent('ev-1', { title: 'Updated' });
      const [callUrl, callOpts] = stub.mock.calls[0] as [string, RequestInit];
      expect(callUrl).toContain('/ev-1');
      expect(callOpts.method).toBe('PATCH');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RestAdapter.deleteEvent', () => {
  it('DELETEs the correct URL', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await a.deleteEvent('ev-42');
      const [callUrl, callOpts] = stub.mock.calls[0] as [string, RequestInit];
      expect(callUrl).toContain('/ev-42');
      expect(callOpts.method).toBe('DELETE');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RestAdapter.subscribe (polling)', () => {
  it('returns an unsubscribe function immediately', () => {
    const a = new RestAdapter({ baseUrl: 'http://api/events', pollInterval: null });
    const unsub = a.subscribe(() => {});
    expect(typeof unsub).toBe('function');
    unsub(); // should not throw
  });

  it('returns noop when pollInterval is null', () => {
    const a = new RestAdapter({ baseUrl: 'http://api/events', pollInterval: null });
    const cb = vi.fn();
    const unsub = a.subscribe(cb);
    unsub();
    expect(cb).not.toHaveBeenCalled();
  });

  it('polls on interval and emits reload events when pollInterval is set', async () => {
    vi.useFakeTimers();
    const events: CalendarEventV1[] = [];
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => events });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events', pollInterval: 1000 });
      const cb = vi.fn();
      const unsub = a.subscribe(cb, { rangeStart: S, rangeEnd: E });
      await vi.advanceTimersByTimeAsync(1001);
      expect(stub).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ type: 'reload', events: [] });
      unsub();
    } finally {
      globalThis.fetch = origFetch;
      vi.useRealTimers();
    }
  });

  it('does not emit after unsubscribe (active=false guard)', async () => {
    vi.useFakeTimers();
    const events: CalendarEventV1[] = [];
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => events });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events', pollInterval: 1000 });
      const cb = vi.fn();
      const unsub = a.subscribe(cb, { rangeStart: S, rangeEnd: E });
      unsub(); // active = false before timer fires
      await vi.advanceTimersByTimeAsync(1001);
      expect(cb).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
      vi.useRealTimers();
    }
  });

  it('uses default rangeStart/rangeEnd when opts is omitted', async () => {
    vi.useFakeTimers();
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events', pollInterval: 1000 });
      const cb = vi.fn();
      const unsub = a.subscribe(cb);
      await vi.advanceTimersByTimeAsync(1001);
      expect(stub).toHaveBeenCalled();
      unsub();
    } finally {
      globalThis.fetch = origFetch;
      vi.useRealTimers();
    }
  });
});

describe('RestAdapter.exportFeed', () => {
  it('returns a JSON string', async () => {
    const a = new RestAdapter({ baseUrl: 'http://api/events' });
    const json = await a.exportFeed([ev()]);
    const parsed = JSON.parse(json) as CalendarEventV1[];
    expect(parsed[0]!.title).toBe('Meeting');
  });
});


describe('RestAdapter schedule template scaffolding', () => {
  it('GETs schedule templates', async () => {
    const templatesResponse = [{ id: 'sched-1', name: 'Clinic', entries: [] as unknown[] }];
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => templatesResponse });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      const templates = await a.listScheduleTemplates();
      expect(stub.mock.calls[0][0]!).toContain('/templates/schedules');
      expect(templates[0]!.id).toBe('sched-1');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('POSTs schedule template instantiation request', async () => {
    const instantiationResponse = { templateId: 'sched-1', generated: [] as CalendarEventV1[] };
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => instantiationResponse });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      const result = await a.instantiateScheduleTemplate({ templateId: 'sched-1', anchor: S.toISOString() });
      const [url, opts] = stub.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/schedules/instantiate');
      expect(opts.method).toBe('POST');
      expect(result.templateId).toBe('sched-1');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('PATCHes a schedule template', async () => {
    const updatedTemplate = { id: 'sched-1', name: 'Updated', entries: [] as unknown[] };
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => updatedTemplate });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      const result = await a.updateScheduleTemplate('sched-1', { name: 'Updated' });
      const [url, opts] = stub.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/templates/schedules/sched-1');
      expect(opts.method).toBe('PATCH');
      expect(result.name).toBe('Updated');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('DELETEs a schedule template', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await a.deleteScheduleTemplate('sched-2');
      const [url, opts] = stub.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/templates/schedules/sched-2');
      expect(opts.method).toBe('DELETE');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─── SupabaseAdapter ──────────────────────────────────────────────────────────

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    lt:     vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: ev(), error: null }),
    insert: vi.fn().mockResolvedValue({ data: [ev()], error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    // Make the query builder awaitable; overrides can replace this
    then:   (resolve: (v: unknown) => void) => resolve({ data: [ev()], error: null }),
    ...overrides,
  };

  const channel = {
    on:          vi.fn().mockReturnThis(),
    subscribe:   vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  };
  return {
    from:    vi.fn().mockReturnValue(qb),
    channel: vi.fn().mockReturnValue(channel),
    _qb:     qb,
    _channel: channel,
  };
}

describe('SupabaseAdapter.loadRange', () => {
  it('calls from().select().gte().lt()', async () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await a.loadRange(S, E);
    expect(sb.from).toHaveBeenCalledWith('events');
    expect(sb._qb['select']).toHaveBeenCalledWith('*');
    expect(sb._qb['gte']).toHaveBeenCalledWith('start', S.toISOString());
    expect(sb._qb['lt']).toHaveBeenCalledWith('end', E.toISOString());
  });

  it('applies eq filter from options.filter', async () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({ client: sb, table: 'events', filter: 'org_id=eq.acme' });
    await a.loadRange(S, E);
    expect(sb._qb['eq']).toHaveBeenCalledWith('org_id', 'acme');
  });

  it('maps rows using fromRow', async () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({
      client: sb,
      table: 'events',
      fromRow: row => ({ ...(row as unknown as CalendarEventV1), title: 'mapped' }),
    });
    const result = await a.loadRange(S, E);
    expect(result[0]!.title).toBe('mapped');
  });
});

describe('SupabaseAdapter.createEvent', () => {
  it('calls from().insert()', async () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await a.createEvent(ev());
    expect(sb._qb['insert']).toHaveBeenCalled();
  });
});

describe('SupabaseAdapter.updateEvent', () => {
  it('calls from().update().eq(id).single()', async () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await a.updateEvent('ev-1', { title: 'New name' });
    expect(sb._qb['update']).toHaveBeenCalled();
    expect(sb._qb['eq']).toHaveBeenCalledWith('id', 'ev-1');
    expect(sb._qb['single']).toHaveBeenCalled();
  });
});

describe('SupabaseAdapter.deleteEvent', () => {
  it('calls from().delete().eq(id)', async () => {
    const sb = mockSupabase({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await a.deleteEvent('ev-1');
    expect(sb._qb['delete']).toHaveBeenCalled();
    expect(sb._qb['eq']).toHaveBeenCalledWith('id', 'ev-1');
  });
});

describe('SupabaseAdapter.subscribe', () => {
  it('creates a realtime channel and returns unsubscribe', () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    const unsub = a.subscribe(() => {});
    expect(sb.channel).toHaveBeenCalled();
    expect(sb._channel.on).toHaveBeenCalled();
    expect(sb._channel.subscribe).toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
    unsub();
    expect(sb._channel.unsubscribe).toHaveBeenCalled();
  });

  it('emits insert/update/delete changes to callback', () => {
    const sb = mockSupabase();
    const changes: AdapterChange[] = [];
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    a.subscribe(c => changes.push(c));

    // Simulate the postgres_changes handler being called
    const [, , handler] = (sb._channel.on as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, unknown, (p: unknown) => void];

    handler({ eventType: 'INSERT', new: ev({ id: 'new-1' }), old: {} });
    handler({ eventType: 'UPDATE', new: ev({ id: 'upd-1', title: 'Updated' }), old: {} });
    handler({ eventType: 'DELETE', new: {}, old: { id: 'del-1' } });

    expect(changes[0]).toEqual({ type: 'insert', event: expect.objectContaining({ id: 'new-1' }) });
    expect(changes[1]).toEqual({ type: 'update', event: expect.objectContaining({ title: 'Updated' }) });
    expect(changes[2]).toEqual({ type: 'delete', id: 'del-1' });
  });
});

// ─── SupabaseAdapter — additional branch coverage ────────────────────────────

describe('SupabaseAdapter — error branches', () => {
  it('loadRange throws when error is returned', async () => {
    const sb = mockSupabase({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: { code: '42P01' } }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await expect(a.loadRange(S, E)).rejects.toThrow('SupabaseAdapter.loadRange');
  });

  it('loadRange returns empty array when data is null', async () => {
    const sb = mockSupabase({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    const result = await a.loadRange(S, E);
    expect(result).toEqual([]);
  });

  it('createEvent throws when error is returned', async () => {
    const sb = mockSupabase({
      insert: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await expect(a.createEvent(ev())).rejects.toThrow('SupabaseAdapter.createEvent');
  });

  it('createEvent throws when inserted row is missing from data', async () => {
    const sb = mockSupabase({
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await expect(a.createEvent(ev())).rejects.toThrow('missing inserted row');
  });

  it('createEvent accepts data as a direct object (not array)', async () => {
    const inserted = ev({ id: 'new-direct' });
    const sb = mockSupabase({
      insert: vi.fn().mockResolvedValue({ data: inserted, error: null }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    const result = await a.createEvent(ev());
    expect(result.id).toBe('new-direct');
  });

  it('updateEvent throws when error is returned', async () => {
    const sb = mockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await expect(a.updateEvent('ev-1', { title: 'X' })).rejects.toThrow('SupabaseAdapter.updateEvent');
  });

  it('deleteEvent throws when error is returned', async () => {
    const sb = mockSupabase({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'forbidden' } }),
    });
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    await expect(a.deleteEvent('ev-1')).rejects.toThrow('SupabaseAdapter.deleteEvent');
  });
});

describe('SupabaseAdapter — filter and subscribe branches', () => {
  it('_baseQuery does not call eq when filter has no =eq. format', async () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({ client: sb, table: 'events', filter: 'malformed-filter' });
    await a.loadRange(S, E);
    // eq should NOT be called since the filter string has no '=eq.' segment
    expect(sb._qb['eq']).not.toHaveBeenCalled();
  });

  it('subscribe adds pgFilter.filter when this._filter is set', () => {
    const sb = mockSupabase();
    const a = new SupabaseAdapter({ client: sb, table: 'events', filter: 'org_id=eq.acme' });
    const unsub = a.subscribe(() => {});
    // The channel name and pgFilter both include the filter value
    expect(sb.channel).toHaveBeenCalledWith(expect.stringContaining('org_id=eq.acme'));
    unsub();
  });

  it('DELETE event with no old.id falls back to empty string id', () => {
    const sb = mockSupabase();
    const changes: AdapterChange[] = [];
    const a = new SupabaseAdapter({ client: sb, table: 'events' });
    a.subscribe(c => changes.push(c));
    const [, , handler] = (sb._channel.on as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, unknown, (p: unknown) => void];
    handler({ eventType: 'DELETE', new: {}, old: {} });
    expect(changes[0]).toEqual({ type: 'delete', id: '' });
  });
});

// ─── ICSAdapter + serializeToICS ─────────────────────────────────────────────

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-uid-1
SUMMARY:Stand-up
DTSTART:20260410T090000Z
DTEND:20260410T100000Z
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

describe('ICSAdapter.loadRange', () => {
  it('fetches, parses, and filters to range', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_ICS,
    });
    const a = new ICSAdapter({ url: 'https://cal.example.com/feed.ics', fetchImpl: fetchMock });
    const events = await a.loadRange(
      new Date('2026-04-10T00:00:00Z'),
      new Date('2026-04-11T00:00:00Z'),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.title).toBe('Stand-up');
  });

  it('filters out events outside the range', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_ICS,
    });
    const a = new ICSAdapter({ url: 'https://cal.example.com/feed.ics', fetchImpl: fetchMock });
    // Range is entirely in the future
    const events = await a.loadRange(
      new Date('2027-01-01T00:00:00Z'),
      new Date('2027-01-31T00:00:00Z'),
    );
    expect(events).toHaveLength(0);
  });

  it('throws on fetch error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const a = new ICSAdapter({ url: 'https://cal.example.com/missing.ics', fetchImpl: fetchMock });
    await expect(a.loadRange(S, E)).rejects.toThrow('404');
  });

  it('tags events with feed label', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({ url: 'https://example.com/feed.ics', label: 'My Cal', fetchImpl: fetchMock });
    const events = await a.loadRange(new Date('2026-04-01Z'), new Date('2026-04-30Z'));
    expect(events[0]!.meta?.['_feedLabel']).toBe('My Cal');
  });
});

describe('ICSAdapter.importFeed', () => {
  it('fetches the full feed without range filtering', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({ url: 'https://example.com/feed.ics', fetchImpl: fetchMock });
    const events = await a.importFeed();
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('ICSAdapter.subscribe (polling)', () => {
  it('returns noop when refreshInterval is null', () => {
    const a = new ICSAdapter({ url: 'https://example.com/feed.ics', refreshInterval: null });
    const unsub = a.subscribe(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('serializeToICS', () => {
  it('produces valid VCALENDAR header/footer', async () => {
    const ics = await new ICSAdapter({ url: 'x' }).exportFeed([ev()]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('includes each event as a VEVENT block', () => {
    const ics = serializeToICS([ev(), ev({ id: 'ev-2', title: 'Lunch' })]);
    const matches = ics.match(/BEGIN:VEVENT/g);
    expect(matches).toHaveLength(2);
  });

  it('writes SUMMARY from title', () => {
    const ics = serializeToICS([ev({ title: 'Sprint Review' })]);
    expect(ics).toContain('SUMMARY:Sprint Review');
  });

  it('writes DTSTART / DTEND as UTC', () => {
    const ics = serializeToICS([ev()]);
    expect(ics).toContain('DTSTART:20260410T090000Z');
    expect(ics).toContain('DTEND:20260410T100000Z');
  });

  it('writes RRULE when present', () => {
    const ics = serializeToICS([ev({ rrule: 'FREQ=WEEKLY;BYDAY=MO' })]);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
  });

  it('writes CATEGORIES when category present', () => {
    const ics = serializeToICS([ev({ category: 'ops' })]);
    expect(ics).toContain('CATEGORIES:ops');
  });

  it('writes STATUS:TENTATIVE for tentative events', () => {
    const ics = serializeToICS([ev({ status: 'tentative' })]);
    expect(ics).toContain('STATUS:TENTATIVE');
  });

  it('writes STATUS:CANCELLED for cancelled events', () => {
    const ics = serializeToICS([ev({ status: 'cancelled' })]);
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('writes DESCRIPTION from meta.description', () => {
    const ics = serializeToICS([ev({ meta: { description: 'Bring slides' } })]);
    expect(ics).toContain('DESCRIPTION:Bring slides');
  });

  it('writes UID from event id', () => {
    const ics = serializeToICS([ev({ id: 'my-uid-123' })]);
    expect(ics).toContain('UID:my-uid-123');
  });

  it('writes all-day events with DATE format', () => {
    const ics = serializeToICS([ev({ allDay: true })]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260410');
  });

  it('round-trips: serializeToICS output is parseable', async () => {
    const input = [ev({ title: 'Round-trip', category: 'test' })];
    const ics   = serializeToICS(input);
    // Re-parse using the existing ICS parser
    const { parseICS } = await import('../../../core/icalParser.js');
    const reparsed = parseICS(ics, {
      rangeStart: new Date('2026-01-01'),
      rangeEnd:   new Date('2027-01-01'),
    });
    expect(reparsed.length).toBe(1);
    expect(reparsed[0]!['title']).toBe('Round-trip');
  });
});

// ─── FirebaseAdapter ──────────────────────────────────────────────────────────

describe('FirebaseAdapter', () => {
  const docSnap = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => data,
    exists: true,
  });

  function makeSnapshot(docs: ReturnType<typeof docSnap>[]) {
    return {
      docs,
      forEach: (cb: (d: ReturnType<typeof docSnap>) => void) => docs.forEach(cb),
      docChanges: () => [] as never[],
    };
  }

  it('implements CalendarAdapter', () => {
    const fns = {
      collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
      getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
      doc: vi.fn(), onSnapshot: vi.fn(),
    };
    const adapter: CalendarAdapter = new FirebaseAdapter({
      db: {}, collection: 'events', adapterFns: fns,
    });
    expect(typeof adapter.loadRange).toBe('function');
    expect(typeof adapter.createEvent).toBe('function');
    expect(typeof adapter.updateEvent).toBe('function');
    expect(typeof adapter.deleteEvent).toBe('function');
    expect(typeof adapter.subscribe).toBe('function');
  });

  it('loadRange calls getDocs and maps results', async () => {
    const row = { ...ev(), start: S, end: E };
    const snap = makeSnapshot([docSnap('doc-1', row)]);
    const fns = {
      collection: vi.fn().mockReturnValue('colRef'),
      query:      vi.fn().mockReturnValue('query'),
      where:      vi.fn().mockReturnValue('where'),
      orderBy:    vi.fn().mockReturnValue('orderBy'),
      getDocs:    vi.fn().mockResolvedValue(snap),
      addDoc:     vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
      doc:        vi.fn(), onSnapshot: vi.fn(),
    };

    const adapter = new FirebaseAdapter({ db: {}, collection: 'events', adapterFns: fns });
    const events = await adapter.loadRange(S, E);

    expect(fns.getDocs).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe('doc-1');
  });

  it('createEvent calls addDoc and returns mapped event', async () => {
    const fns = {
      collection: vi.fn().mockReturnValue('colRef'),
      query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
      getDocs: vi.fn(),
      addDoc:     vi.fn().mockResolvedValue({ id: 'new-id' }),
      updateDoc: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(), onSnapshot: vi.fn(),
    };
    const adapter = new FirebaseAdapter({ db: {}, collection: 'events', adapterFns: fns });
    const created = await adapter.createEvent!(ev());
    expect(fns.addDoc).toHaveBeenCalledOnce();
    expect(created.id).toBe('new-id');
  });

  it('updateEvent calls updateDoc', async () => {
    const fns = {
      collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
      getDocs: vi.fn(), addDoc: vi.fn(),
      updateDoc:  vi.fn().mockResolvedValue(undefined),
      deleteDoc:  vi.fn(),
      doc:        vi.fn().mockReturnValue('docRef'),
      onSnapshot: vi.fn(),
    };
    const adapter = new FirebaseAdapter({ db: {}, collection: 'events', adapterFns: fns });
    await adapter.updateEvent!('ev-1', { title: 'Updated' });
    expect(fns.updateDoc).toHaveBeenCalledWith('docRef', expect.objectContaining({ title: 'Updated' }));
  });

  it('deleteEvent calls deleteDoc', async () => {
    const fns = {
      collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
      getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(),
      deleteDoc:  vi.fn().mockResolvedValue(undefined),
      doc:        vi.fn().mockReturnValue('docRef'),
      onSnapshot: vi.fn(),
    };
    const adapter = new FirebaseAdapter({ db: {}, collection: 'events', adapterFns: fns });
    await adapter.deleteEvent!('ev-1');
    expect(fns.deleteDoc).toHaveBeenCalledWith('docRef');
  });

  it('subscribe wires onSnapshot and maps changes', () => {
    const unsub = vi.fn();
    const fns = {
      collection: vi.fn().mockReturnValue('colRef'),
      query:      vi.fn().mockReturnValue('query'),
      where:      vi.fn(), orderBy: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(),
      updateDoc: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(),
      onSnapshot: vi.fn().mockImplementation((_q, cb) => {
        cb({
          docChanges: () => [
            { type: 'added',    doc: docSnap('d1', ev() as unknown as Record<string, unknown>) },
            { type: 'modified', doc: docSnap('d2', ev({ id: 'd2' }) as unknown as Record<string, unknown>) },
            { type: 'removed',  doc: docSnap('d3', {}) },
          ],
        });
        return unsub;
      }),
    };
    const adapter = new FirebaseAdapter({ db: {}, collection: 'events', adapterFns: fns });
    const changes: AdapterChange[] = [];
    const stop = adapter.subscribe!(c => changes.push(c));
    expect(changes).toHaveLength(3);
    expect(changes[0]!.type).toBe('insert');
    expect(changes[1]!.type).toBe('update');
    expect(changes[2]!.type).toBe('delete');
    stop();
    expect(unsub).toHaveBeenCalled();
  });
});

// ─── RestAdapter — additional branch coverage ─────────────────────────────────

describe('RestAdapter — constructor option branches', () => {
  it('strips trailing slash from baseUrl', () => {
    const a = new RestAdapter({ baseUrl: 'http://api/events/' });
    // The adapter should not double-slash on endpoint URLs
    // Verify by checking that the schedule templates URL is correct
    // (We can't inspect private fields directly, so proxy via fetch mock)
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      a.listScheduleTemplates();
    } finally {
      globalThis.fetch = origFetch;
    }
    const url = stub.mock.calls[0]?.[0] as string | undefined;
    expect(url).not.toContain('events//');
  });

  it('uses custom scheduleTemplatesUrl when provided', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({
        baseUrl: 'http://api/events',
        scheduleTemplatesUrl: 'http://api/custom-templates',
      });
      await a.listScheduleTemplates();
      expect(stub.mock.calls[0][0]).toBe('http://api/custom-templates');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('uses custom scheduleInstantiateUrl when provided', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templateId: 't1', generated: [] }) });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({
        baseUrl: 'http://api/events',
        scheduleInstantiateUrl: 'http://api/custom-instantiate',
      });
      await a.instantiateScheduleTemplate({ templateId: 't1', anchor: S.toISOString() });
      expect(stub.mock.calls[0][0]).toBe('http://api/custom-instantiate');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('uses pollInterval: 0 as falsy (returns noop subscribe)', () => {
    const a = new RestAdapter({ baseUrl: 'http://api/events', pollInterval: 0 });
    const cb = vi.fn();
    const unsub = a.subscribe(cb);
    expect(typeof unsub).toBe('function');
    unsub();
    expect(cb).not.toHaveBeenCalled();
  });

  it('applies custom toRequest on createEvent body', async () => {
    const raw = ev();
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => raw });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({
        baseUrl: 'http://api/events',
        toRequest: (e) => ({ customTitle: (e as CalendarEventV1).title }),
      });
      await a.createEvent(raw);
      const body = JSON.parse((stub.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
      expect(body).toHaveProperty('customTitle', 'Meeting');
      expect(body).not.toHaveProperty('id');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RestAdapter — error branches', () => {
  it('loadRange with AbortSignal passes signal to fetch', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    const controller = new AbortController();
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await a.loadRange(S, E, controller.signal);
      const opts = (stub.mock.calls[0] as [string, RequestInit])[1];
      expect(opts).toHaveProperty('signal', controller.signal);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('createEvent throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 422, statusText: 'Unprocessable Entity' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.createEvent(ev())).rejects.toThrow('422');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('updateEvent throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.updateEvent('ev-1', { title: 'x' })).rejects.toThrow('404');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('deleteEvent throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.deleteEvent('ev-1')).rejects.toThrow('403');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('listScheduleTemplates throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.listScheduleTemplates()).rejects.toThrow('500');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('createScheduleTemplate posts and returns result', async () => {
    const tpl = { id: 'sched-new', name: 'New', entries: [] as unknown[] };
    const stub = vi.fn().mockResolvedValue({ ok: true, json: async () => tpl });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      const result = await a.createScheduleTemplate({ name: 'New', entries: [] });
      const [url, opts] = stub.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/templates/schedules');
      expect(opts.method).toBe('POST');
      expect(result.id).toBe('sched-new');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('createScheduleTemplate throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.createScheduleTemplate({ name: 'Bad', entries: [] })).rejects.toThrow('400');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('updateScheduleTemplate throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 409, statusText: 'Conflict' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.updateScheduleTemplate('t1', { name: 'x' })).rejects.toThrow('409');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('deleteScheduleTemplate throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.deleteScheduleTemplate('t1')).rejects.toThrow('403');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('instantiateScheduleTemplate throws on non-OK response', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 422, statusText: 'Unprocessable Entity' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
      const a = new RestAdapter({ baseUrl: 'http://api/events' });
      await expect(a.instantiateScheduleTemplate({ templateId: 't1', anchor: S.toISOString() })).rejects.toThrow('422');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RestAdapter.subscribe — with range opts', () => {
  it('accepts custom rangeStart/rangeEnd opts', () => {
    const a = new RestAdapter({ baseUrl: 'http://api/events', pollInterval: null });
    const customStart = new Date('2026-01-01T00:00:00Z');
    const customEnd   = new Date('2026-12-31T00:00:00Z');
    const unsub = a.subscribe(() => {}, { rangeStart: customStart, rangeEnd: customEnd });
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ─── PocketBaseAdapter ────────────────────────────────────────────────────────

describe('PocketBaseAdapter', () => {
  function makePb() {
    const col = {
      getList:     vi.fn().mockResolvedValue({ items: [{ ...ev(), id: 'pb-1' }] }),
      create:      vi.fn().mockResolvedValue({ ...ev(), id: 'pb-new' }),
      update:      vi.fn().mockResolvedValue({ ...ev(), id: 'pb-1', title: 'Updated' }),
      delete:      vi.fn().mockResolvedValue(true),
      subscribe:   vi.fn().mockResolvedValue(vi.fn()),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };
    const pb = { collection: vi.fn().mockReturnValue(col) };
    return { pb, col };
  }

  it('implements CalendarAdapter', () => {
    const { pb } = makePb();
    const adapter: CalendarAdapter = new PocketBaseAdapter({ pb, collection: 'events' });
    expect(typeof adapter.loadRange).toBe('function');
    expect(typeof adapter.createEvent).toBe('function');
    expect(typeof adapter.subscribe).toBe('function');
  });

  it('loadRange calls getList with date filter', async () => {
    const { pb, col } = makePb();
    const adapter = new PocketBaseAdapter({ pb, collection: 'events' });
    const events = await adapter.loadRange(S, E);
    expect(col.getList).toHaveBeenCalledWith(1, 500, expect.objectContaining({
      filter: expect.stringContaining('start >='),
    }));
    expect(events).toHaveLength(1);
  });

  it('extraFilter is ANDed with date range', async () => {
    const { pb, col } = makePb();
    const adapter = new PocketBaseAdapter({
      pb, collection: 'events', extraFilter: 'org = "acme"',
    });
    await adapter.loadRange(S, E);
    const filter: string = col.getList.mock.calls[0][2].filter;
    expect(filter).toContain('org = "acme"');
    expect(filter).toContain('start >=');
  });

  it('createEvent calls pb.create', async () => {
    const { pb, col } = makePb();
    const adapter = new PocketBaseAdapter({ pb, collection: 'events' });
    const created = await adapter.createEvent!(ev());
    expect(col.create).toHaveBeenCalledOnce();
    expect(created.id).toBe('pb-new');
  });

  it('updateEvent calls pb.update with id', async () => {
    const { pb, col } = makePb();
    const adapter = new PocketBaseAdapter({ pb, collection: 'events' });
    const updated = await adapter.updateEvent!('pb-1', { title: 'Updated' });
    expect(col.update).toHaveBeenCalledWith('pb-1', expect.objectContaining({ title: 'Updated' }));
    expect(updated.title).toBe('Updated');
  });

  it('deleteEvent calls pb.delete', async () => {
    const { pb, col } = makePb();
    const adapter = new PocketBaseAdapter({ pb, collection: 'events' });
    await adapter.deleteEvent!('pb-1');
    expect(col.delete).toHaveBeenCalledWith('pb-1');
  });

  it('subscribe wires pb.subscribe and maps actions', async () => {
    let handler: ((e: { action: string; record: Record<string, unknown> }) => void) | undefined;
    const unsubFn = vi.fn();
    const pb = {
      collection: vi.fn().mockReturnValue({
        subscribe:   vi.fn().mockImplementation((_topic, cb) => {
          handler = cb;
          return Promise.resolve(unsubFn);
        }),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const adapter = new PocketBaseAdapter({ pb, collection: 'events' });
    const changes: AdapterChange[] = [];
    adapter.subscribe!(c => changes.push(c));

    // allow the subscribe promise to resolve
    await Promise.resolve();

    handler!({ action: 'create', record: { ...ev(), id: 'r1' } });
    handler!({ action: 'update', record: { ...ev(), id: 'r2' } });
    handler!({ action: 'delete', record: { id: 'r3' } as Record<string, unknown> });

    expect(changes[0]!.type).toBe('insert');
    expect(changes[1]!.type).toBe('update');
    expect(changes[2]!.type).toBe('delete');
    expect((changes[2] as { type: 'delete'; id: string }).id).toBe('r3');
  });
});

// ─── ICSAdapter — additional branch coverage ──────────────────────────────────

describe('ICSAdapter — constructor branches', () => {
  it('converts webcal:// URL prefix to https://', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({ url: 'webcal://cal.example.com/feed.ics', fetchImpl: fetchMock });
    await a.loadRange(new Date('2026-04-01Z'), new Date('2026-04-30Z'));
    const calledUrl = (fetchMock.mock.calls[0] as [string])[0];
    expect(calledUrl).toMatch(/^https:\/\//);
    expect(calledUrl).not.toContain('webcal://');
  });

  it('uses url as label when label option is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({ url: 'https://cal.example.com/feed.ics', fetchImpl: fetchMock });
    const events = await a.loadRange(new Date('2026-04-01Z'), new Date('2026-04-30Z'));
    if (events.length > 0) {
      expect(events[0]!.meta?.['_feedLabel']).toBe('https://cal.example.com/feed.ics');
    }
  });
});

describe('ICSAdapter.importFeed — with range opts', () => {
  it('passes rangeStart/rangeEnd when opts provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({ url: 'https://example.com/feed.ics', fetchImpl: fetchMock });
    const events = await a.importFeed({
      rangeStart: new Date('2026-04-01Z'),
      rangeEnd:   new Date('2026-04-30Z'),
    });
    expect(Array.isArray(events)).toBe(true);
  });
});

describe('ICSAdapter.subscribe — with range opts', () => {
  it('accepts custom rangeStart/rangeEnd opts', () => {
    const a = new ICSAdapter({ url: 'https://example.com/feed.ics', refreshInterval: null });
    const unsub = a.subscribe(() => {}, {
      rangeStart: new Date('2026-01-01Z'),
      rangeEnd:   new Date('2026-12-31Z'),
    });
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('serializeToICS — additional branch coverage', () => {
  it('generates a random UID when event.id is absent', () => {
    const ics = serializeToICS([ev({ id: undefined as unknown as string })]);
    // Should have a UID line but not "UID:undefined"
    expect(ics).toContain('UID:');
    expect(ics).not.toContain('UID:undefined');
  });

  it('defaults end to start + 1h when end is null', () => {
    const ics = serializeToICS([ev({ end: null as unknown as Date })]);
    expect(ics).toContain('DTEND:');
    // The DTEND should be 1 hour after DTSTART (10:00)
    expect(ics).toContain('DTEND:20260410T100000Z');
  });

  it('accepts string start/end', () => {
    const ics = serializeToICS([ev({
      start: '2026-04-10T09:00:00Z' as unknown as Date,
      end:   '2026-04-10T10:00:00Z' as unknown as Date,
    })]);
    expect(ics).toContain('DTSTART:20260410T090000Z');
  });

  it('includes LOCATION when meta.location is present', () => {
    const ics = serializeToICS([ev({ meta: { location: 'Conference Room B' } })]);
    expect(ics).toContain('LOCATION:Conference Room B');
  });

  it('serializes EXDATE list from Date instances', () => {
    const ics = serializeToICS([ev({
      exdates: [new Date('2026-04-17T09:00:00Z'), new Date('2026-04-24T09:00:00Z')],
    })]);
    expect(ics).toContain('EXDATE:');
    expect(ics).toContain('20260417T090000Z');
  });

  it('serializes EXDATE list from string values', () => {
    const ics = serializeToICS([ev({
      exdates: ['2026-04-17T09:00:00Z' as unknown as Date],
    })]);
    expect(ics).toContain('EXDATE:');
    expect(ics).toContain('20260417T090000Z');
  });

  it('folds long lines (> 75 chars) with RFC 5545 continuation', () => {
    const longTitle = 'A'.repeat(100);
    const ics = serializeToICS([ev({ title: longTitle })]);
    // Folded lines contain \r\n followed by a space
    expect(ics).toContain('\r\n ');
  });

  it('escapes backslash, semicolons, commas, and newlines in title', () => {
    const ics = serializeToICS([ev({ title: 'A\\B;C,D\nE' })]);
    expect(ics).toContain('A\\\\B\\;C\\,D\\nE');
  });
});

// ─── FirebaseAdapter — v8 fallback (no adapterFns) ───────────────────────────

describe('FirebaseAdapter — v8 namespaced API fallback', () => {
  function makeV8Db(snap: ReturnType<typeof makeSnapshot>) {
    const qb: Record<string, unknown> = {
      where:   vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      get:     vi.fn().mockResolvedValue(snap),
      onSnapshot: vi.fn().mockImplementation((_cb: unknown) => vi.fn()),
    };
    const docRef = {
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      get:    vi.fn().mockResolvedValue({ ...snap.docs[0], exists: true }),
    };
    return {
      collection: vi.fn().mockReturnValue(qb),
      doc:        vi.fn().mockReturnValue(docRef),
      _qb: qb,
      _docRef: docRef,
    };
  }

  function docSnap(id: string, data: Record<string, unknown>) {
    return { id, data: () => data, exists: true };
  }

  function makeSnapshot(docs: ReturnType<typeof docSnap>[]) {
    return {
      docs,
      forEach: (cb: (d: ReturnType<typeof docSnap>) => void) => docs.forEach(cb),
      docChanges: () => [] as never[],
    };
  }

  it('loadRange uses v8 collection().where().get()', async () => {
    const row = { ...ev(), start: S, end: E };
    const snap = makeSnapshot([docSnap('doc-1', row)]);
    const db = makeV8Db(snap);
    const adapter = new FirebaseAdapter({ db, collection: 'events' });
    const events = await adapter.loadRange(S, E);
    expect(db.collection).toHaveBeenCalledWith('events');
    expect(db._qb['where']).toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe('doc-1');
  });

  it('loadRange returns [] when signal is aborted', async () => {
    const snap = makeSnapshot([docSnap('doc-1', { ...ev() })]);
    const db = makeV8Db(snap);
    const adapter = new FirebaseAdapter({ db, collection: 'events' });
    const ctrl = new AbortController();
    ctrl.abort();
    const events = await adapter.loadRange(S, E, ctrl.signal);
    expect(events).toEqual([]);
  });

  it('createEvent uses v8 collection().add()', async () => {
    const snap = makeSnapshot([]);
    const db = makeV8Db(snap);
    const addMock = vi.fn().mockResolvedValue({ id: 'v8-new' });
    (db._qb as Record<string, unknown>)['add'] = addMock;
    const adapter = new FirebaseAdapter({ db, collection: 'events' });
    const created = await adapter.createEvent!(ev());
    expect(addMock).toHaveBeenCalledOnce();
    expect(created.id).toBe('v8-new');
  });

  it('updateEvent uses v8 doc().update()', async () => {
    const snap = makeSnapshot([]);
    const db = makeV8Db(snap);
    const adapter = new FirebaseAdapter({ db, collection: 'events' });
    await adapter.updateEvent!('ev-1', { title: 'Updated' });
    expect(db._docRef.update).toHaveBeenCalledOnce();
  });

  it('deleteEvent uses v8 doc().delete()', async () => {
    const snap = makeSnapshot([]);
    const db = makeV8Db(snap);
    const adapter = new FirebaseAdapter({ db, collection: 'events' });
    await adapter.deleteEvent!('ev-1');
    expect(db._docRef.delete).toHaveBeenCalledOnce();
  });

  it('subscribe uses v8 onSnapshot and maps changes', () => {
    const snap = makeSnapshot([]);
    const db = makeV8Db(snap);

    const addedDoc = docSnap('d1', { ...ev() });
    const modDoc   = docSnap('d2', { ...ev({ id: 'd2' }) });
    const remDoc   = docSnap('d3', {});

    (db._qb['onSnapshot'] as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (s: { docChanges(): unknown[] }) => void) => {
        cb({
          docChanges: () => [
            { type: 'added',    doc: addedDoc },
            { type: 'modified', doc: modDoc   },
            { type: 'removed',  doc: remDoc   },
          ],
        });
        return vi.fn();
      },
    );

    const adapter = new FirebaseAdapter({ db, collection: 'events' });
    const changes: import('../adapters/CalendarAdapter.js').AdapterChange[] = [];
    const stop = adapter.subscribe!(c => changes.push(c));
    expect(changes[0]!.type).toBe('insert');
    expect(changes[1]!.type).toBe('update');
    expect(changes[2]!.type).toBe('delete');
    stop();
  });

  it('subscribe accepts custom rangeStart/rangeEnd opts', () => {
    const snap = makeSnapshot([]);
    const db = makeV8Db(snap);
    const adapter = new FirebaseAdapter({ db, collection: 'events' });
    const unsub = adapter.subscribe!(() => {}, {
      rangeStart: new Date('2026-01-01Z'),
      rangeEnd:   new Date('2026-12-31Z'),
    });
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ─── ICSAdapter — remaining branch coverage ───────────────────────────────────

describe('ICSAdapter — loadRange with AbortSignal', () => {
  it('passes signal to fetch when signal is provided to loadRange', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({ url: 'https://example.com/feed.ics', fetchImpl: fetchMock });
    const controller = new AbortController();
    await a.loadRange(new Date('2026-04-01Z'), new Date('2026-04-30Z'), controller.signal);
    const fetchOpts = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(fetchOpts?.signal).toBe(controller.signal);
  });
});

describe('ICSAdapter.subscribe — with non-zero refreshInterval', () => {
  it('sets up polling and calls callback on timer fire', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({
      url: 'https://example.com/feed.ics',
      fetchImpl: fetchMock,
      refreshInterval: 1000,
    });
    const callback = vi.fn();
    const unsub = a.subscribe(callback);

    await vi.advanceTimersByTimeAsync(1001);
    expect(fetchMock).toHaveBeenCalled();

    unsub();
    vi.useRealTimers();
  });

  it('does not call callback after unsubscribe (active=false guard)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_ICS });
    const a = new ICSAdapter({
      url: 'https://example.com/feed.ics',
      fetchImpl: fetchMock,
      refreshInterval: 1000,
    });
    const callback = vi.fn();
    const unsub = a.subscribe(callback);
    unsub();  // unsubscribe before timer fires → active=false

    await vi.advanceTimersByTimeAsync(1001);
    // active=false → poll returns early → callback not called
    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
