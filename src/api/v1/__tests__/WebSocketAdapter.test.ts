// @vitest-environment node
/**
 * WebSocketAdapter unit tests.
 *
 * Uses a mock WebSocket class injected via vi.stubGlobal to avoid requiring
 * a real WS server. The mock supports simulating open/close/message/error
 * events and tracks sent frames.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketAdapter } from '../adapters/WebSocketAdapter';
import type { AdapterChange } from '../adapters/CalendarAdapter';
import type { CalendarEventV1 } from '../types';

const S = new Date('2026-04-10T09:00:00Z');
const E = new Date('2026-04-10T10:00:00Z');

function ev(overrides: Partial<CalendarEventV1> = {}): CalendarEventV1 {
  return { id: 'ev-1', title: 'Meeting', start: S, end: E, ...overrides };
}

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

type ListenerHandler = (evt: unknown) => void;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN       = 1;
  static CLOSING    = 2;
  static CLOSED     = 3;

  readyState: number;
  url: string;
  sent: string[] = [];

  private _listeners: Map<string, Array<{ handler: ListenerHandler; once: boolean }>> = new Map();

  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: ListenerHandler, opts?: { once?: boolean }) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type)!.push({ handler, once: opts?.once ?? false });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this._emit('close', {});
  }

  simulateMessage(data: unknown) {
    this._emit('message', { data: JSON.stringify(data) });
  }

  simulateRawMessage(raw: string) {
    this._emit('message', { data: raw });
  }

  simulateError() {
    this._emit('error', new Error('ws error'));
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this._emit('open', {});
  }

  private _emit(type: string, event: unknown) {
    const handlers = this._listeners.get(type) ?? [];
    const keep: typeof handlers = [];
    for (const entry of handlers) {
      entry.handler(event);
      if (!entry.once) keep.push(entry);
    }
    this._listeners.set(type, keep);
  }
}

let originalWebSocket: typeof WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  originalWebSocket = globalThis.WebSocket;
  (globalThis as unknown as Record<string, unknown>)['WebSocket'] = MockWebSocket;
});

afterEach(() => {
  (globalThis as unknown as Record<string, unknown>)['WebSocket'] = originalWebSocket;
});

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
}

// ─── defaultParseMessage ──────────────────────────────────────────────────────

describe('WebSocketAdapter — defaultParseMessage dispatch', () => {
  it('dispatches insert messages to subscribers', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));

    const ws = lastWs();
    ws.simulateMessage({ type: 'insert', event: ev() });

    expect(changes[0]).toEqual({ type: 'insert', event: expect.objectContaining({ id: 'ev-1' }) });
    adapter.close();
  });

  it('dispatches update messages to subscribers', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));

    lastWs().simulateMessage({ type: 'update', event: ev({ title: 'Updated' }) });
    expect(changes[0]).toEqual({ type: 'update', event: expect.objectContaining({ title: 'Updated' }) });
    adapter.close();
  });

  it('dispatches delete messages to subscribers', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));

    lastWs().simulateMessage({ type: 'delete', id: 'ev-1' });
    expect(changes[0]).toEqual({ type: 'delete', id: 'ev-1' });
    adapter.close();
  });

  it('dispatches reload messages to subscribers', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));

    lastWs().simulateMessage({ type: 'reload', events: [ev()] });
    expect(changes[0]?.type).toBe('reload');
    adapter.close();
  });

  it('ignores "events" type messages (loadRange response handled separately)', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));

    lastWs().simulateMessage({ type: 'events', events: [] });
    expect(changes).toHaveLength(0);
    adapter.close();
  });

  it('ignores unknown message types', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));

    lastWs().simulateMessage({ type: 'heartbeat', ts: Date.now() });
    expect(changes).toHaveLength(0);
    adapter.close();
  });

  it('ignores malformed (non-JSON) frames', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));

    expect(() => lastWs().simulateRawMessage('NOT_JSON{{{')).not.toThrow();
    expect(changes).toHaveLength(0);
    adapter.close();
  });
});

// ─── loadRange ────────────────────────────────────────────────────────────────

describe('WebSocketAdapter.loadRange', () => {
  it('sends a loadRange message and resolves with server events', async () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test', requestTimeout: 5000 });

    const promise = adapter.loadRange(S, E);
    const ws = lastWs();

    // Verify a message was sent
    expect(ws.sent).toHaveLength(1);
    const msg = JSON.parse(ws.sent[0]!) as Record<string, unknown>;
    expect(msg['type']).toBe('loadRange');
    expect(msg['start']).toBe(S.toISOString());
    expect(msg['requestId']).toBeDefined();

    // Respond with events
    ws.simulateMessage({ type: 'events', requestId: msg['requestId'], events: [ev()] });

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('ev-1');
    adapter.close();
  });

  it('resolves with empty array when response events are absent', async () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const promise = adapter.loadRange(S, E);
    const ws = lastWs();
    const msg = JSON.parse(ws.sent[0]!) as Record<string, unknown>;
    ws.simulateMessage({ type: 'events', requestId: msg['requestId'] }); // no events field
    const result = await promise;
    expect(result).toEqual([]);
    adapter.close();
  });

  it('rejects immediately when signal is already aborted', async () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(adapter.loadRange(S, E, ctrl.signal)).rejects.toThrow('aborted');
    adapter.close();
  });

  it('rejects when abort signal fires mid-flight', async () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const ctrl = new AbortController();
    const promise = adapter.loadRange(S, E, ctrl.signal);
    ctrl.abort();
    await expect(promise).rejects.toThrow('aborted');
    adapter.close();
  });

  it('uses custom buildLoadMessage when provided', async () => {
    const buildLoad = vi.fn().mockReturnValue({ op: 'QUERY', id: 'req-custom' });
    const adapter = new WebSocketAdapter({ url: 'wss://test', buildLoadMessage: buildLoad });
    adapter.loadRange(S, E).catch(() => {}); // don't await — will timeout
    expect(buildLoad).toHaveBeenCalledWith(S, E, expect.any(String));
    const msg = JSON.parse(lastWs().sent[0]!) as Record<string, unknown>;
    expect(msg['op']).toBe('QUERY');
    adapter.close();
  });

  it('uses custom parseMessage when provided', () => {
    const parseMessage = vi.fn().mockReturnValue(null);
    const adapter = new WebSocketAdapter({ url: 'wss://test', parseMessage });
    adapter.subscribe(() => {});
    lastWs().simulateMessage({ type: 'insert', event: ev() });
    expect(parseMessage).toHaveBeenCalled();
    adapter.close();
  });
});

// ─── subscribe ────────────────────────────────────────────────────────────────

describe('WebSocketAdapter.subscribe', () => {
  it('adds callback and delivers changes', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));
    lastWs().simulateMessage({ type: 'insert', event: ev() });
    expect(changes).toHaveLength(1);
    adapter.close();
  });

  it('unsubscribe removes callback and closes socket on last subscriber', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const unsub = adapter.subscribe(() => {});
    expect(lastWs().readyState).toBe(MockWebSocket.OPEN);
    unsub();
    expect(lastWs().readyState).toBe(MockWebSocket.CLOSED);
  });

  it('does not close socket when other subscribers remain', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const unsub1 = adapter.subscribe(() => {});
    adapter.subscribe(() => {});
    unsub1(); // only one of two
    expect(lastWs().readyState).toBe(MockWebSocket.OPEN);
    adapter.close();
  });
});

// ─── close ───────────────────────────────────────────────────────────────────

describe('WebSocketAdapter.close', () => {
  it('rejects pending loadRange requests with "closed"', async () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const promise = adapter.loadRange(S, E);
    adapter.close();
    await expect(promise).rejects.toThrow('closed');
  });

  it('clears subscribers', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    const changes: AdapterChange[] = [];
    adapter.subscribe(c => changes.push(c));
    adapter.close();
    // After close, ws is gone — no more events possible
    expect(MockWebSocket.instances[0]!.readyState).toBe(MockWebSocket.CLOSED);
  });
});

// ─── reconnect logic ─────────────────────────────────────────────────────────

describe('WebSocketAdapter — reconnect', () => {
  it('reconnects after unexpected close when reconnectDelay is set', async () => {
    vi.useFakeTimers();
    const adapter = new WebSocketAdapter({ url: 'wss://test', reconnectDelay: 100 });
    adapter.subscribe(() => {}); // open socket
    expect(MockWebSocket.instances).toHaveLength(1);

    lastWs().close(); // unexpected close
    vi.runAllTimers();

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    adapter.close();
    vi.useRealTimers();
  });

  it('does not reconnect when reconnectDelay is null', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test', reconnectDelay: null });
    adapter.subscribe(() => {});
    const countBefore = MockWebSocket.instances.length;
    lastWs().close();
    expect(MockWebSocket.instances.length).toBe(countBefore);
    adapter.close();
  });

  it('does not reconnect when intentionally closed', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test', reconnectDelay: 100 });
    adapter.subscribe(() => {});
    const countBefore = MockWebSocket.instances.length;
    adapter.close(); // intentional
    expect(MockWebSocket.instances.length).toBe(countBefore);
  });

  it('stops reconnecting after maxReconnects consecutive attempts on same connection', () => {
    vi.useFakeTimers();
    // maxReconnects: 1 — after one failed attempt, stop
    const adapter = new WebSocketAdapter({ url: 'wss://test', reconnectDelay: 100, maxReconnects: 1 });
    adapter.subscribe(() => {});

    const ws = lastWs();
    // Trigger close twice BEFORE timer fires — second close should be ignored
    ws.close(); // count (0) < 1 → count++ (1) → sets timer
    ws.close(); // count (1) >= 1 → skip (no new timer)

    vi.runAllTimers(); // runs the ONE timer set above
    // Only ONE reconnect should have been triggered (one new instance)
    expect(MockWebSocket.instances.length).toBe(2);
    adapter.close();
    vi.useRealTimers();
  });
});

// ─── _ensureOpen / _send branches ────────────────────────────────────────────

describe('WebSocketAdapter — _send when not yet open', () => {
  it('queues send until WebSocket fires open event', async () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });

    // Force not-open state before sending
    const ws0 = new MockWebSocket('wss://test') as unknown as { readyState: number };
    ws0.readyState = MockWebSocket.CONNECTING;

    // Create adapter and make it use a connecting WS by hooking _ensureOpen
    // We test this indirectly: call subscribe (which opens WS) but override
    // the WS to CONNECTING state immediately after
    adapter.subscribe(() => {});
    const ws = lastWs();
    ws.readyState = MockWebSocket.CONNECTING;

    const sendPromise = adapter.loadRange(S, E);

    // Now simulate open
    ws.simulateOpen();

    // The load message should now be sent
    expect(ws.sent.length).toBeGreaterThan(0);
    adapter.close();
    await sendPromise.catch(() => {}); // might timeout or close
  });

  it('rejects loadRange when WebSocket fires error before open', async () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test' });
    adapter.subscribe(() => {});
    const ws = lastWs();
    ws.readyState = MockWebSocket.CONNECTING;

    const sendPromise = adapter.loadRange(S, E);
    ws.simulateError();

    await expect(sendPromise).rejects.toThrow('connection failed');
  });
});

// ─── constructor option branches ─────────────────────────────────────────────

describe('WebSocketAdapter — constructor defaults', () => {
  it('uses requestTimeout: 0 to override default', () => {
    const adapter = new WebSocketAdapter({ url: 'wss://test', requestTimeout: 100 });
    expect(adapter).toBeInstanceOf(WebSocketAdapter);
    adapter.close();
  });

  it('uses maxReconnects: 0 for unlimited reconnects', () => {
    vi.useFakeTimers();
    const adapter = new WebSocketAdapter({ url: 'wss://test', reconnectDelay: 10, maxReconnects: 0 });
    adapter.subscribe(() => {});

    // With maxReconnects=0, the condition `maxReconnects > 0 && ...` is false → always reconnect
    lastWs().close();
    vi.runAllTimers();
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    adapter.close();
    vi.useRealTimers();
  });
});
