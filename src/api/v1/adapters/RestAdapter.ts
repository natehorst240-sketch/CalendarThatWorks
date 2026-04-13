/**
 * RestAdapter — HTTP/REST integration adapter.
 *
 * Connects to any JSON REST API that exposes calendar events.
 * Implements loadRange, createEvent, updateEvent, deleteEvent, and a
 * polling-based subscribe.
 *
 * @example — minimal setup
 *   const adapter = new RestAdapter({ baseUrl: '/api/events' });
 *   const events  = await adapter.loadRange(start, end);
 *
 * @example — with auth + field mapping
 *   const adapter = new RestAdapter({
 *     baseUrl: 'https://api.acme.com/calendar/events',
 *     headers: { Authorization: `Bearer ${token}` },
 *     startParam: 'from',
 *     endParam:   'to',
 *     fromResponse: row => ({
 *       id:    String(row.event_id),
 *       title: row.name as string,
 *       start: new Date(row.starts_at as string),
 *       end:   new Date(row.ends_at as string),
 *     }),
 *     toRequest: ev => ({ name: ev.title, starts_at: ev.start, ends_at: ev.end }),
 *   });
 *
 * @example — polling subscribe (fires every 60 s)
 *   const unsub = adapter.subscribe(change => {
 *     if (change.type === 'reload') replaceEvents(change.events);
 *   }, { pollInterval: 60_000, rangeStart, rangeEnd });
 *   // later:
 *   unsub();
 */

import type { CalendarAdapter, AdapterChangeCallback, AdapterUnsubscribe } from './CalendarAdapter.js';
import type { CalendarEventV1 } from '../types.js';
import type {
  ScheduleTemplateV1,
  ScheduleInstantiationRequestV1,
  ScheduleInstantiationResultV1,
} from '../templates.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface RestAdapterOptions {
  /** Base URL of the REST API, e.g. "/api/events" or "https://api.example.com/events". */
  readonly baseUrl: string;

  /**
   * Default headers for every request.
   * @example { Authorization: 'Bearer TOKEN', 'X-Tenant': 'acme' }
   */
  readonly headers?: Readonly<Record<string, string>>;

  /** Query parameter name for the range start date (ISO 8601). Default: 'start'. */
  readonly startParam?: string;

  /** Query parameter name for the range end date (ISO 8601). Default: 'end'. */
  readonly endParam?: string;

  /**
   * Map a raw API response object to CalendarEventV1.
   * Called for each item in the loadRange response array.
   * Default: identity cast.
   */
  readonly fromResponse?: (raw: Record<string, unknown>) => CalendarEventV1;

  /**
   * Map a CalendarEventV1 to the request body sent on create/update.
   * Default: passes the CalendarEventV1 as-is.
   */
  readonly toRequest?: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => Record<string, unknown>;

  /**
   * Polling interval for subscribe() in milliseconds.
   * Default: 60_000 (1 minute).  Set to null to disable polling.
   */
  readonly pollInterval?: number | null;

  /** Optional base URL override for template endpoints. Default: `${baseUrl}/templates/schedules`. */
  readonly scheduleTemplatesUrl?: string;

  /** Optional endpoint override for schedule instantiation. Default: `${baseUrl}/schedules/instantiate`. */
  readonly scheduleInstantiateUrl?: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class RestAdapter implements CalendarAdapter {
  private readonly _base: string;
  private readonly _headers: Record<string, string>;
  private readonly _startParam: string;
  private readonly _endParam: string;
  private readonly _fromResponse: (raw: Record<string, unknown>) => CalendarEventV1;
  private readonly _toRequest: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => Record<string, unknown>;
  private readonly _pollInterval: number | null;
  private readonly _scheduleTemplatesUrl: string;
  private readonly _scheduleInstantiateUrl: string;

  constructor(options: RestAdapterOptions) {
    this._base        = options.baseUrl.replace(/\/$/, '');
    this._headers     = { 'Content-Type': 'application/json', ...options.headers };
    this._startParam  = options.startParam ?? 'start';
    this._endParam    = options.endParam   ?? 'end';
    this._fromResponse = options.fromResponse ?? (raw => raw as unknown as CalendarEventV1);
    this._toRequest   = options.toRequest   ?? (ev  => ev  as unknown as Record<string, unknown>);
    this._pollInterval = options.pollInterval !== undefined ? options.pollInterval : 60_000;
    this._scheduleTemplatesUrl = options.scheduleTemplatesUrl ?? `${this._base}/templates/schedules`;
    this._scheduleInstantiateUrl = options.scheduleInstantiateUrl ?? `${this._base}/schedules/instantiate`;
  }

  // ── loadRange ───────────────────────────────────────────────────────────────

  async loadRange(start: Date, end: Date, signal?: AbortSignal): Promise<CalendarEventV1[]> {
    const url = new URL(this._base, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    url.searchParams.set(this._startParam, start.toISOString());
    url.searchParams.set(this._endParam,   end.toISOString());

    const res = await fetch(url.toString(), { headers: this._headers, signal });
    if (!res.ok) throw new Error(`RestAdapter.loadRange: ${res.status} ${res.statusText}`);

    const json = await res.json() as unknown[];
    return json.map(item => this._fromResponse(item as Record<string, unknown>));
  }

  // ── createEvent ─────────────────────────────────────────────────────────────

  async createEvent(event: CalendarEventV1): Promise<CalendarEventV1> {
    const res = await fetch(this._base, {
      method:  'POST',
      headers: this._headers,
      body:    JSON.stringify(this._toRequest(event)),
    });
    if (!res.ok) throw new Error(`RestAdapter.createEvent: ${res.status} ${res.statusText}`);
    const json = await res.json() as Record<string, unknown>;
    return this._fromResponse(json);
  }

  // ── updateEvent ─────────────────────────────────────────────────────────────

  async updateEvent(id: string, patch: Partial<CalendarEventV1>): Promise<CalendarEventV1> {
    const res = await fetch(`${this._base}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: this._headers,
      body:    JSON.stringify(this._toRequest(patch)),
    });
    if (!res.ok) throw new Error(`RestAdapter.updateEvent: ${res.status} ${res.statusText}`);
    const json = await res.json() as Record<string, unknown>;
    return this._fromResponse(json);
  }

  // ── deleteEvent ─────────────────────────────────────────────────────────────

  async deleteEvent(id: string): Promise<void> {
    const res = await fetch(`${this._base}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: this._headers,
    });
    if (!res.ok) throw new Error(`RestAdapter.deleteEvent: ${res.status} ${res.statusText}`);
  }

  // ── subscribe ───────────────────────────────────────────────────────────────

  /**
   * Poll-based subscribe.  Calls loadRange every `pollInterval` ms and emits
   * a `reload` change with the full refreshed event list.
   *
   * Pass the current visible range as `opts.rangeStart` / `opts.rangeEnd` so
   * the poller knows which window to refresh.
   */
  subscribe(
    callback: AdapterChangeCallback,
    opts?: { rangeStart?: Date; rangeEnd?: Date },
  ): AdapterUnsubscribe {
    if (!this._pollInterval) return () => {};

    const start = opts?.rangeStart ?? new Date(Date.now() - 30 * 24 * 3600_000);
    const end   = opts?.rangeEnd   ?? new Date(Date.now() + 30 * 24 * 3600_000);

    let active = true;
    let controller = new AbortController();

    const poll = async () => {
      if (!active) return;
      try {
        const events = await this.loadRange(start, end, controller.signal);
        if (active) callback({ type: 'reload', events });
      } catch {
        // Ignore aborted requests; caller retries on next poll
      }
    };

    const timer = setInterval(poll, this._pollInterval);

    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }

  // ── schedule templates ─────────────────────────────────────────────────────

  async listScheduleTemplates(): Promise<ScheduleTemplateV1[]> {
    const res = await fetch(this._scheduleTemplatesUrl, {
      method: 'GET',
      headers: this._headers,
    });
    if (!res.ok) throw new Error(`RestAdapter.listScheduleTemplates: ${res.status} ${res.statusText}`);
    return await res.json() as ScheduleTemplateV1[];
  }

  async createScheduleTemplate(template: Omit<ScheduleTemplateV1, 'id'>): Promise<ScheduleTemplateV1> {
    const res = await fetch(this._scheduleTemplatesUrl, {
      method: 'POST',
      headers: this._headers,
      body: JSON.stringify(template),
    });
    if (!res.ok) throw new Error(`RestAdapter.createScheduleTemplate: ${res.status} ${res.statusText}`);
    return await res.json() as ScheduleTemplateV1;
  }

  async instantiateScheduleTemplate(request: ScheduleInstantiationRequestV1): Promise<ScheduleInstantiationResultV1> {
    const res = await fetch(this._scheduleInstantiateUrl, {
      method: 'POST',
      headers: this._headers,
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`RestAdapter.instantiateScheduleTemplate: ${res.status} ${res.statusText}`);
    return await res.json() as ScheduleInstantiationResultV1;
  }

  // ── exportFeed ──────────────────────────────────────────────────────────────

  async exportFeed(events: CalendarEventV1[]): Promise<string> {
    return JSON.stringify(events, null, 2);
  }
}
