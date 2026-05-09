/**
 * PocketBaseAdapter — PocketBase integration adapter.
 *
 * Connects to a PocketBase collection using the PocketBase JS SDK.
 * Implements loadRange, createEvent, updateEvent, deleteEvent, and a
 * real-time subscribe via PocketBase's SSE realtime API.
 *
 * Duck-typed — never imports the PocketBase SDK directly, so the library
 * compiles without it installed.
 *
 * @example — basic setup
 *   import PocketBase from 'pocketbase';
 *
 *   const pb = new PocketBase('https://myapp.pockethost.io');
 *   const adapter = new PocketBaseAdapter({ pb, collection: 'events' });
 *
 * @example — with field mapping + auth token
 *   pb.authStore.save(token);
 *
 *   const adapter = new PocketBaseAdapter({
 *     pb,
 *     collection: 'events',
 *     startField: 'starts_at',
 *     endField:   'ends_at',
 *     fromRecord: r => ({
 *       id:    r.id as string,
 *       title: r.name as string,
 *       start: new Date(r.starts_at as string),
 *       end:   new Date(r.ends_at   as string),
 *     }),
 *     toRecord: ev => ({
 *       name:       ev.title,
 *       starts_at:  (ev.start as Date).toISOString(),
 *       ends_at:    (ev.end   as Date).toISOString(),
 *     }),
 *   });
 */

import type { CalendarAdapter, AdapterChangeCallback, AdapterUnsubscribe } from './CalendarAdapter';
import type { CalendarEventV1 } from '../types';

// ─── PocketBase duck-types ────────────────────────────────────────────────────

type PBRecord = Record<string, unknown> & { id: string };

interface PBListResult {
  items: PBRecord[];
  page: number;
  perPage: number;
  totalItems: number;
}

interface PBCollection {
  getList(
    page: number,
    perPage: number,
    options?: { filter?: string | undefined; sort?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<PBListResult>;
  create(data: Record<string, unknown>): Promise<PBRecord>;
  update(id: string, data: Record<string, unknown>): Promise<PBRecord>;
  delete(id: string): Promise<boolean>;
  subscribe(
    topic: string,
    cb: (e: { action: string; record: PBRecord }) => void,
  ): Promise<() => void>;
  unsubscribe(topic?: string): Promise<void>;
}

interface PocketBaseClient {
  collection(name: string): PBCollection;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface PocketBaseAdapterOptions {
  /** PocketBase SDK instance — `new PocketBase(url)`. */
  readonly pb: unknown;

  /** Name of the PocketBase collection that stores events. */
  readonly collection: string;

  /** Field for event start timestamp. Default: 'start'. */
  readonly startField?: string;

  /** Field for event end timestamp. Default: 'end'. */
  readonly endField?: string;

  /**
   * Extra filter string ANDed with the date range filter, e.g. `'org = "acme"'`.
   * Uses PocketBase filter syntax.
   */
  readonly extraFilter?: string;

  /**
   * Map a PocketBase record → CalendarEventV1.
   * Default: identity — assumes the record matches CalendarEventV1.
   */
  readonly fromRecord?: (record: PBRecord) => CalendarEventV1;

  /**
   * Map a CalendarEventV1 → PocketBase record fields for write operations.
   * Default: passes the event as-is.
   */
  readonly toRecord?: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => Record<string, unknown>;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class PocketBaseAdapter implements CalendarAdapter {
  private readonly _pb: PocketBaseClient;
  private readonly _col: string;
  private readonly _startField: string;
  private readonly _endField: string;
  private readonly _extraFilter: string | undefined;
  private readonly _fromRecord: (record: PBRecord) => CalendarEventV1;
  private readonly _toRecord: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => Record<string, unknown>;

  constructor(options: PocketBaseAdapterOptions) {
    this._pb          = options.pb as PocketBaseClient;
    this._col         = options.collection;
    this._startField  = options.startField  ?? 'start';
    this._endField    = options.endField    ?? 'end';
    this._extraFilter = options.extraFilter;
    this._fromRecord  = options.fromRecord  ?? (r => r as unknown as CalendarEventV1);
    this._toRecord    = options.toRecord    ?? (ev => ev as unknown as Record<string, unknown>);
  }

  // ── Internal: build date-range filter string ────────────────────────────────

  private _rangeFilter(start: Date, end: Date): string {
    const s = start.toISOString().replace('T', ' ').replace('Z', '');
    const e = end.toISOString().replace('T', ' ').replace('Z', '');
    const base = `${this._startField} >= "${s}" && ${this._startField} < "${e}"`;
    return this._extraFilter ? `(${base}) && (${this._extraFilter})` : base;
  }

  // ── loadRange ───────────────────────────────────────────────────────────────

  async loadRange(start: Date, end: Date, signal?: AbortSignal): Promise<CalendarEventV1[]> {
    // Fetch up to 500 records — if you expect more, implement pagination.
    const result = await this._pb.collection(this._col).getList(1, 500, {
      filter: this._rangeFilter(start, end),
      sort:   this._startField,
      signal,
    });
    return result.items.map(r => this._fromRecord(r));
  }

  // ── createEvent ─────────────────────────────────────────────────────────────

  async createEvent(event: CalendarEventV1): Promise<CalendarEventV1> {
    const record = await this._pb.collection(this._col).create(this._toRecord(event));
    return this._fromRecord(record);
  }

  // ── updateEvent ─────────────────────────────────────────────────────────────

  async updateEvent(id: string, patch: Partial<CalendarEventV1>): Promise<CalendarEventV1> {
    const record = await this._pb.collection(this._col).update(id, this._toRecord(patch));
    return this._fromRecord(record);
  }

  // ── deleteEvent ─────────────────────────────────────────────────────────────

  async deleteEvent(id: string): Promise<void> {
    await this._pb.collection(this._col).delete(id);
  }

  // ── subscribe ───────────────────────────────────────────────────────────────

  subscribe(callback: AdapterChangeCallback): AdapterUnsubscribe {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    this._pb
      .collection(this._col)
      .subscribe('*', ({ action, record }) => {
        if (cancelled) return;
        switch (action) {
          case 'create': callback({ type: 'insert', event: this._fromRecord(record) }); break;
          case 'update': callback({ type: 'update', event: this._fromRecord(record) }); break;
          case 'delete': callback({ type: 'delete', id: record.id }); break;
        }
      })
      .then(fn => {
        if (cancelled) fn();
        else unsub = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsub?.();
      this._pb.collection(this._col).unsubscribe('*').catch(() => {});
    };
  }
}
