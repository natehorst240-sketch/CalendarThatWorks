/**
 * SupabaseAdapter — Supabase Postgres + Realtime integration adapter.
 *
 * Implements loadRange, createEvent, updateEvent, deleteEvent via the
 * Supabase Data API, and subscribe via Supabase Realtime postgres_changes.
 *
 * The adapter is framework-agnostic — it wraps the Supabase JS client
 * directly and can be used with or without React.
 *
 * @example — basic setup
 *   import { createClient } from '@supabase/supabase-js';
 *
 *   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *   const adapter  = new SupabaseAdapter({
 *     client: supabase,
 *     table:  'calendar_events',
 *   });
 *
 *   const events = await adapter.loadRange(start, end);
 *
 * @example — with column mapping + live subscription
 *   const adapter = new SupabaseAdapter({
 *     client:   supabase,
 *     table:    'events',
 *     filter:   'org_id=eq.acme',
 *     startCol: 'starts_at',
 *     endCol:   'ends_at',
 *     fromRow:  row => ({
 *       id:    String(row.id),
 *       title: row.name as string,
 *       start: new Date(row.starts_at as string),
 *       end:   new Date(row.ends_at as string),
 *     }),
 *     toRow: ev => ({
 *       name:       ev.title,
 *       starts_at:  (ev.start as Date).toISOString(),
 *       ends_at:    (ev.end   as Date).toISOString(),
 *       org_id:     'acme',
 *     }),
 *   });
 *
 *   const unsub = adapter.subscribe(change => {
 *     if (change.type === 'insert') addEvent(change.event);
 *     if (change.type === 'update') replaceEvent(change.event);
 *     if (change.type === 'delete') removeEvent(change.id);
 *   });
 */

import type { CalendarAdapter, AdapterChangeCallback, AdapterUnsubscribe } from './CalendarAdapter.js';
import type { CalendarEventV1 } from '../types.js';

// ─── Supabase client duck-type ────────────────────────────────────────────────
// We duck-type the minimal Supabase API we use so the adapter compiles even when
// @supabase/supabase-js is not installed.  The full client is accepted at runtime.

interface SupabaseQueryBuilder {
  select(cols: string): this;
  gte(col: string, val: string): this;
  lt(col: string, val: string): this;
  eq(col: string, val: string): this;
  insert(row: Record<string, unknown>): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
  update(patch: Record<string, unknown>): this;
  delete(): this;
  single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  then(onFulfilled: (result: { data: unknown; error: unknown }) => void): void;
}

interface SupabaseRealtimeChannel {
  on(event: string, filter: Record<string, unknown>, handler: (payload: unknown) => void): this;
  subscribe(cb?: (status: string) => void): this;
  unsubscribe(): void;
}

interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
  channel(name: string): SupabaseRealtimeChannel;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface SupabaseAdapterOptions {
  /** A Supabase JS client (`createClient(url, key)`). */
  readonly client: unknown;

  /** Name of the Postgres table that stores events. */
  readonly table: string;

  /**
   * PostgREST filter applied to all queries (optional).
   * @example "calendar_id=eq.my-cal"  "org_id=eq.acme"
   */
  readonly filter?: string;

  /** Column for the event start timestamp. Default: 'start'. */
  readonly startCol?: string;

  /** Column for the event end timestamp. Default: 'end'. */
  readonly endCol?: string;

  /**
   * Map a database row → CalendarEventV1.
   * Default: identity (assumes the row already matches the CalendarEventV1 shape).
   */
  readonly fromRow?: (row: Record<string, unknown>) => CalendarEventV1;

  /**
   * Map a CalendarEventV1 → database row for insert/update.
   * Default: passes the event as-is.
   */
  readonly toRow?: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => Record<string, unknown>;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class SupabaseAdapter implements CalendarAdapter {
  private readonly _sb: SupabaseClient;
  private readonly _table: string;
  private readonly _filter: string | undefined;
  private readonly _startCol: string;
  private readonly _endCol: string;
  private readonly _fromRow: (row: Record<string, unknown>) => CalendarEventV1;
  private readonly _toRow: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => Record<string, unknown>;

  constructor(options: SupabaseAdapterOptions) {
    this._sb       = options.client as SupabaseClient;
    this._table    = options.table;
    this._filter   = options.filter;
    this._startCol = options.startCol ?? 'start';
    this._endCol   = options.endCol   ?? 'end';
    this._fromRow  = options.fromRow  ?? (row => row as unknown as CalendarEventV1);
    this._toRow    = options.toRow    ?? (ev  => ev  as unknown as Record<string, unknown>);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private _baseQuery(): SupabaseQueryBuilder {
    let q = this._sb.from(this._table).select('*');
    if (this._filter) {
      // Apply the PostgREST filter string by splitting on the first '='
      const eqIdx = this._filter.indexOf('=eq.');
      if (eqIdx >= 0) {
        const col = this._filter.slice(0, eqIdx);
        const val = this._filter.slice(eqIdx + 4);
        q = q.eq(col, val);
      }
    }
    return q;
  }

  // ── loadRange ───────────────────────────────────────────────────────────────

  async loadRange(start: Date, end: Date, _signal?: AbortSignal): Promise<CalendarEventV1[]> {
    const { data, error } = await (this._baseQuery()
      .gte(this._startCol, start.toISOString())
      .lt(this._endCol,    end.toISOString()) as unknown as Promise<{
        data: Record<string, unknown>[] | null;
        error: unknown;
      }>);

    if (error) throw new Error(`SupabaseAdapter.loadRange: ${JSON.stringify(error)}`);
    return (data ?? []).map(row => this._fromRow(row));
  }

  // ── createEvent ─────────────────────────────────────────────────────────────

  async createEvent(event: CalendarEventV1): Promise<CalendarEventV1> {
    const { data, error } = await this._sb
      .from(this._table)
      .insert(this._toRow(event)) as unknown as {
        data: Record<string, unknown>[] | null;
        error: unknown;
      };

    if (error) throw new Error(`SupabaseAdapter.createEvent: ${JSON.stringify(error)}`);
    const row = Array.isArray(data) ? data[0] : data as Record<string, unknown>;
    return this._fromRow(row);
  }

  // ── updateEvent ─────────────────────────────────────────────────────────────

  async updateEvent(id: string, patch: Partial<CalendarEventV1>): Promise<CalendarEventV1> {
    const { data, error } = await (this._sb
      .from(this._table)
      .update(this._toRow(patch))
      .eq('id', id)
      .single() as unknown as Promise<{ data: Record<string, unknown> | null; error: unknown }>);

    if (error) throw new Error(`SupabaseAdapter.updateEvent: ${JSON.stringify(error)}`);
    return this._fromRow(data!);
  }

  // ── deleteEvent ─────────────────────────────────────────────────────────────

  async deleteEvent(id: string): Promise<void> {
    const { error } = await (this._sb
      .from(this._table)
      .delete()
      .eq('id', id) as unknown as Promise<{ data: unknown; error: unknown }>);

    if (error) throw new Error(`SupabaseAdapter.deleteEvent: ${JSON.stringify(error)}`);
  }

  // ── subscribe ───────────────────────────────────────────────────────────────

  subscribe(callback: AdapterChangeCallback): AdapterUnsubscribe {
    const chanName  = `wc-rt-${this._table}-${this._filter ?? 'all'}`;
    const pgFilter: Record<string, unknown> = {
      event:  '*',
      schema: 'public',
      table:  this._table,
    };
    if (this._filter) pgFilter.filter = this._filter;

    const channel = this._sb
      .channel(chanName)
      .on('postgres_changes', pgFilter, (payload: unknown) => {
        const p = payload as { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };
        switch (p.eventType) {
          case 'INSERT':
            callback({ type: 'insert', event: this._fromRow(p.new) });
            break;
          case 'UPDATE':
            callback({ type: 'update', event: this._fromRow(p.new) });
            break;
          case 'DELETE':
            callback({ type: 'delete', id: String(p.old['id'] ?? '') });
            break;
        }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }
}
