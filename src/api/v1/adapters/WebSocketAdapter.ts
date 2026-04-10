/**
 * WebSocketAdapter — live WebSocket integration adapter.
 *
 * Connects to a WebSocket server that streams calendar event changes.
 * Implements loadRange (request/response over WS) and subscribe (push).
 *
 * Message protocol is fully configurable — bring your own format.
 * The defaults assume a simple JSON envelope:
 *   → { type: 'loadRange', requestId: string, start: string, end: string }
 *   ← { type: 'events',   requestId: string, events: CalendarEventV1[] }
 *   ← { type: 'insert' | 'update', event: CalendarEventV1 }
 *   ← { type: 'delete',  id: string }
 *   ← { type: 'reload',  events: CalendarEventV1[] }
 *
 * @example — minimal
 *   const adapter = new WebSocketAdapter({ url: 'wss://api.example.com/calendar' });
 *
 *   const unsub = adapter.subscribe(change => {
 *     if (change.type === 'insert') addEvent(change.event);
 *     if (change.type === 'reload') replaceAll(change.events);
 *   });
 *
 *   const events = await adapter.loadRange(start, end);
 *
 * @example — custom message format
 *   const adapter = new WebSocketAdapter({
 *     url: 'wss://internal.acme.com/events',
 *     buildLoadMessage: (start, end, requestId) => ({
 *       op: 'QUERY', id: requestId, range: { from: start.toISOString(), to: end.toISOString() }
 *     }),
 *     parseMessage: (data) => {
 *       if (data.op === 'EVENTS') return { type: 'reload', events: data.items };
 *       if (data.op === 'ADDED')  return { type: 'insert', event: data.item };
 *       return null;
 *     },
 *   });
 */

import type { CalendarAdapter, AdapterChange, AdapterChangeCallback, AdapterUnsubscribe } from './CalendarAdapter.js';
import type { CalendarEventV1 } from '../types.js';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface WebSocketAdapterOptions {
  /** WebSocket URL, e.g. "wss://api.example.com/calendar". */
  readonly url: string;

  /**
   * Build the outgoing message for a loadRange request.
   * Default: `{ type: 'loadRange', requestId, start: start.toISOString(), end: end.toISOString() }`
   */
  readonly buildLoadMessage?: (
    start: Date,
    end: Date,
    requestId: string,
  ) => unknown;

  /**
   * Parse an incoming WS message (already JSON-decoded) into an AdapterChange.
   * Return null to ignore the message (e.g. heartbeats, ACKs).
   *
   * Default implementation handles the built-in envelope:
   *   { type: 'insert' | 'update' | 'delete' | 'reload' | 'events', ... }
   */
  readonly parseMessage?: (data: Record<string, unknown>, requestId?: string) => AdapterChange | null;

  /**
   * Reconnect delay in ms after an unexpected close.
   * Default: 2000 ms.  Set to null to disable auto-reconnect.
   */
  readonly reconnectDelay?: number | null;

  /**
   * Maximum number of reconnect attempts (applies per connection lifecycle).
   * Default: 10.  Set to 0 for unlimited.
   */
  readonly maxReconnects?: number;

  /**
   * Timeout in ms for a loadRange response before the promise rejects.
   * Default: 15_000 ms.
   */
  readonly requestTimeout?: number;
}

// ─── Default message protocol ─────────────────────────────────────────────────

function defaultBuildLoad(start: Date, end: Date, requestId: string): unknown {
  return { type: 'loadRange', requestId, start: start.toISOString(), end: end.toISOString() };
}

function defaultParseMessage(data: Record<string, unknown>): AdapterChange | null {
  switch (data['type']) {
    case 'insert':
      return { type: 'insert', event: data['event'] as CalendarEventV1 };
    case 'update':
      return { type: 'update', event: data['event'] as CalendarEventV1 };
    case 'delete':
      return { type: 'delete', id: String(data['id'] ?? '') };
    case 'reload':
      return { type: 'reload', events: data['events'] as CalendarEventV1[] };
    // 'events' is the loadRange response — handled by the pending request map
    case 'events':
      return null;
    default:
      return null;
  }
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class WebSocketAdapter implements CalendarAdapter {
  private readonly _url: string;
  private readonly _buildLoad: (s: Date, e: Date, id: string) => unknown;
  private readonly _parse: (data: Record<string, unknown>) => AdapterChange | null;
  private readonly _reconnectDelay: number | null;
  private readonly _maxReconnects: number;
  private readonly _requestTimeout: number;

  private _ws: WebSocket | null = null;
  private _subscribers: Set<AdapterChangeCallback> = new Set();
  /** Pending loadRange promises: requestId → { resolve, reject, timer } */
  private _pending: Map<string, {
    resolve: (events: CalendarEventV1[]) => void;
    reject:  (err: Error) => void;
    timer:   ReturnType<typeof setTimeout>;
  }> = new Map();
  private _reconnectCount = 0;
  private _intentionallyClosed = false;

  constructor(options: WebSocketAdapterOptions) {
    this._url            = options.url;
    this._buildLoad      = options.buildLoadMessage ?? defaultBuildLoad;
    this._parse          = options.parseMessage     ?? defaultParseMessage;
    this._reconnectDelay = options.reconnectDelay !== undefined ? options.reconnectDelay : 2000;
    this._maxReconnects  = options.maxReconnects  !== undefined ? options.maxReconnects  : 10;
    this._requestTimeout = options.requestTimeout  ?? 15_000;
  }

  // ── WebSocket lifecycle ─────────────────────────────────────────────────────

  private _connect(): WebSocket {
    const ws = new WebSocket(this._url);

    ws.addEventListener('message', (evt) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(evt.data as string) as Record<string, unknown>;
      } catch {
        return; // ignore non-JSON frames
      }

      // Resolve pending loadRange request
      const reqId = data['requestId'] as string | undefined;
      if (data['type'] === 'events' && reqId && this._pending.has(reqId)) {
        const pending = this._pending.get(reqId)!;
        clearTimeout(pending.timer);
        this._pending.delete(reqId);
        pending.resolve((data['events'] as CalendarEventV1[]) ?? []);
        return;
      }

      // Dispatch to subscribers
      const change = this._parse(data);
      if (change) {
        for (const cb of this._subscribers) cb(change);
      }
    });

    ws.addEventListener('close', () => {
      if (this._intentionallyClosed) return;
      if (this._reconnectDelay == null) return;
      if (this._maxReconnects > 0 && this._reconnectCount >= this._maxReconnects) return;

      this._reconnectCount++;
      setTimeout(() => {
        if (!this._intentionallyClosed) {
          this._ws = this._connect();
        }
      }, this._reconnectDelay);
    });

    ws.addEventListener('error', () => {
      // Errors are followed by close; let the close handler manage reconnect
    });

    this._reconnectCount = 0;
    return ws;
  }

  private _ensureOpen(): WebSocket {
    if (!this._ws || this._ws.readyState === WebSocket.CLOSED || this._ws.readyState === WebSocket.CLOSING) {
      this._intentionallyClosed = false;
      this._ws = this._connect();
    }
    return this._ws;
  }

  private _send(message: unknown): Promise<void> {
    const ws = this._ensureOpen();
    return new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        resolve();
      } else {
        ws.addEventListener('open', () => {
          ws.send(JSON.stringify(message));
          resolve();
        }, { once: true });
        ws.addEventListener('error', () => reject(new Error('WebSocketAdapter: connection failed')), { once: true });
      }
    });
  }

  // ── loadRange ───────────────────────────────────────────────────────────────

  loadRange(start: Date, end: Date, signal?: AbortSignal): Promise<CalendarEventV1[]> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message   = this._buildLoad(start, end, requestId);

    return new Promise<CalendarEventV1[]>((resolve, reject) => {
      if (signal?.aborted) { reject(new Error('WebSocketAdapter.loadRange: aborted')); return; }

      const timer = setTimeout(() => {
        this._pending.delete(requestId);
        reject(new Error(`WebSocketAdapter.loadRange: timed out after ${this._requestTimeout}ms`));
      }, this._requestTimeout);

      this._pending.set(requestId, { resolve, reject, timer });

      this._send(message).catch(err => {
        clearTimeout(timer);
        this._pending.delete(requestId);
        reject(err);
      });

      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        this._pending.delete(requestId);
        reject(new Error('WebSocketAdapter.loadRange: aborted'));
      }, { once: true });
    });
  }

  // ── subscribe ───────────────────────────────────────────────────────────────

  subscribe(callback: AdapterChangeCallback): AdapterUnsubscribe {
    this._ensureOpen(); // opens connection if not already open
    this._subscribers.add(callback);
    return () => {
      this._subscribers.delete(callback);
      // Close the socket when the last subscriber unsubscribes
      if (this._subscribers.size === 0 && this._ws) {
        this._intentionallyClosed = true;
        this._ws.close();
        this._ws = null;
      }
    };
  }

  /** Explicitly close the WebSocket connection. */
  close(): void {
    this._intentionallyClosed = true;
    this._ws?.close();
    this._ws = null;
    this._subscribers.clear();
    for (const { reject, timer } of this._pending.values()) {
      clearTimeout(timer);
      reject(new Error('WebSocketAdapter: closed'));
    }
    this._pending.clear();
  }
}
