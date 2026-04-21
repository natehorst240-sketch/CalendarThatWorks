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
import { RestAdapter }       from '../adapters/RestAdapter';
import { SupabaseAdapter }   from '../adapters/SupabaseAdapter';
import { ICSAdapter, serializeToICS } from '../adapters/ICSAdapter';
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
      const calledUrl = stub.mock.calls[0][0] as string;
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
      const url = stub.mock.calls[0][0] as string;
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
      expect(result.id).toBe('99');
      expect(result.title).toBe('Flight');
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
});

describe('RestAdapter.exportFeed', () => {
  it('returns a JSON string', async () => {
    const a = new RestAdapter({ baseUrl: 'http://api/events' });
    const json = await a.exportFeed([ev()]);
    const parsed = JSON.parse(json) as CalendarEventV1[];
    expect(parsed[0].title).toBe('Meeting');
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
      expect(stub.mock.calls[0][0]).toContain('/templates/schedules');
      expect(templates[0].id).toBe('sched-1');
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
    ...overrides,
  };
  // Make the query builder awaitable (for .lt() final call → { data, error })
  (qb as Record<string, unknown>)['then'] = (resolve: (v: unknown) => void) =>
    resolve({ data: [ev()], error: null });

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
    expect(result[0].title).toBe('mapped');
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
    expect(events[0].title).toBe('Stand-up');
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
    expect(events[0].meta?.['_feedLabel']).toBe('My Cal');
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
    expect(reparsed[0].title).toBe('Round-trip');
  });
});
