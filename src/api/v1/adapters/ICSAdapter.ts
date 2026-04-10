/**
 * ICSAdapter — iCalendar (RFC 5545) integration adapter.
 *
 * Fetches, parses, and exports iCal feeds.  Implements:
 *   loadRange   — fetch feed, parse ICS, filter to range
 *   importFeed  — fetch + parse without range filtering
 *   exportFeed  — serialize CalendarEventV1[] to RFC 5545 VCALENDAR text
 *   subscribe   — polling-based live refresh
 *
 * The adapter is read-only by default (ICS feeds don't support mutations).
 * createEvent / updateEvent / deleteEvent are not implemented.
 *
 * @example — import a public Google Calendar feed
 *   const adapter = new ICSAdapter({
 *     url: 'https://calendar.google.com/calendar/ical/example%40gmail.com/public/basic.ics',
 *     label: 'Team calendar',
 *     refreshInterval: 5 * 60_000,   // re-poll every 5 min
 *   });
 *
 *   const events = await adapter.loadRange(weekStart, weekEnd);
 *
 * @example — export to ICS for download
 *   const ics  = await adapter.exportFeed(visibleEvents);
 *   const blob = new Blob([ics], { type: 'text/calendar' });
 *   saveAs(blob, 'calendar.ics');
 *
 * @example — polling subscribe
 *   const unsub = adapter.subscribe(change => {
 *     if (change.type === 'reload') replaceEvents(change.events);
 *   });
 *   // later:
 *   unsub();
 */

import type { CalendarAdapter, AdapterChangeCallback, AdapterUnsubscribe } from './CalendarAdapter.js';
import type { CalendarEventV1 } from '../types.js';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface ICSAdapterOptions {
  /**
   * URL of the ICS feed.  Supports https:// and webcal:// (converted to https).
   * May be a relative URL when used in a server-side context.
   */
  readonly url: string;

  /**
   * Human-readable label for this feed (shows up in event.meta._feedLabel).
   * Defaults to the URL.
   */
  readonly label?: string;

  /**
   * Polling interval in ms for subscribe().
   * Default: 300_000 (5 min).  Pass null to disable polling.
   */
  readonly refreshInterval?: number | null;

  /**
   * Custom fetch implementation (for testing or environments that need
   * a custom HTTP client / CORS proxy).
   * Defaults to the global `fetch`.
   */
  readonly fetchImpl?: typeof fetch;
}

// ─── ICS serialization helpers ────────────────────────────────────────────────

/** Format a Date as an ICS DATETIME string (UTC, ending with Z). */
function formatICSDate(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    'T',
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
    'Z',
  ].join('');
}

/** Escape special ICS characters in text values. */
function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Fold an ICS line to max 75 octets per RFC 5545 §3.1.
 * Continuation lines start with a single space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  const firstMax = 75;
  const contMax  = 74; // 74 chars + leading space = 75
  parts.push(line.slice(0, firstMax));
  i = firstMax;
  while (i < line.length) {
    parts.push('\r\n ' + line.slice(i, i + contMax));
    i += contMax;
  }
  return parts.join('');
}

/** Serialize an array of CalendarEventV1 to an RFC 5545 VCALENDAR string. */
export function serializeToICS(events: CalendarEventV1[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalendarThatWorks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const start = ev.start instanceof Date ? ev.start : new Date(String(ev.start));
    const rawEnd = ev.end != null ? (ev.end instanceof Date ? ev.end : new Date(String(ev.end))) : null;
    const end = rawEnd ?? new Date(start.getTime() + 3_600_000);

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${ev.id ?? `wc-${Math.random().toString(36).slice(2)}`}`));

    if (ev.allDay) {
      // DATE format: YYYYMMDD (no time, no Z)
      const fmt = (d: Date) => [
        d.getUTCFullYear(),
        String(d.getUTCMonth() + 1).padStart(2, '0'),
        String(d.getUTCDate()).padStart(2, '0'),
      ].join('');
      lines.push(`DTSTART;VALUE=DATE:${fmt(start)}`);
      lines.push(`DTEND;VALUE=DATE:${fmt(end)}`);
    } else {
      lines.push(`DTSTART:${formatICSDate(start)}`);
      lines.push(`DTEND:${formatICSDate(end)}`);
    }

    lines.push(foldLine(`SUMMARY:${escapeICS(ev.title)}`));

    if (ev.status === 'tentative')  lines.push('STATUS:TENTATIVE');
    else if (ev.status === 'cancelled') lines.push('STATUS:CANCELLED');
    else                            lines.push('STATUS:CONFIRMED');

    if (ev.rrule) lines.push(foldLine(`RRULE:${ev.rrule}`));
    if (ev.category) lines.push(foldLine(`CATEGORIES:${escapeICS(ev.category)}`));

    const desc = ev.meta?.['description'];
    if (typeof desc === 'string') lines.push(foldLine(`DESCRIPTION:${escapeICS(desc)}`));

    const loc = ev.meta?.['location'];
    if (typeof loc === 'string') lines.push(foldLine(`LOCATION:${escapeICS(loc)}`));

    if (ev.exdates?.length) {
      const exStr = ev.exdates
        .map(d => d instanceof Date ? d : new Date(String(d)))
        .map(formatICSDate)
        .join(',');
      lines.push(foldLine(`EXDATE:${exStr}`));
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ICSAdapter implements CalendarAdapter {
  private readonly _url: string;
  private readonly _label: string;
  private readonly _refreshInterval: number | null;
  private readonly _fetch: typeof fetch;

  constructor(options: ICSAdapterOptions) {
    this._url             = options.url.replace(/^webcal:\/\//i, 'https://');
    this._label           = options.label ?? options.url;
    this._refreshInterval = options.refreshInterval !== undefined
      ? options.refreshInterval
      : 300_000;
    this._fetch = options.fetchImpl ?? fetch.bind(globalThis);
  }

  // ── Internal: fetch + parse ─────────────────────────────────────────────────

  private async _fetch_and_parse(
    rangeStart?: Date,
    rangeEnd?: Date,
    signal?: AbortSignal,
  ): Promise<CalendarEventV1[]> {
    const res = await this._fetch(this._url, { signal });
    if (!res.ok) throw new Error(`ICSAdapter: fetch failed ${res.status} ${res.statusText}`);
    const text = await res.text();

    // Dynamically import the existing ICS parser from core
    const { parseICS } = await import('../../../core/icalParser.js');
    const opts: Record<string, Date> = {};
    if (rangeStart) opts['rangeStart'] = rangeStart;
    if (rangeEnd)   opts['rangeEnd']   = rangeEnd;
    const raw = parseICS(text, opts) as CalendarEventV1[];

    // Tag with feed label
    return raw.map(ev => ({
      ...ev,
      meta: { ...((ev.meta as Record<string, unknown>) ?? {}), _feedLabel: this._label },
    }));
  }

  // ── loadRange ───────────────────────────────────────────────────────────────

  async loadRange(start: Date, end: Date, signal?: AbortSignal): Promise<CalendarEventV1[]> {
    const all = await this._fetch_and_parse(start, end, signal);
    // Filter to overlapping events (parser already scopes by range, but
    // we double-check here for single-occurrence events)
    return all.filter(ev => {
      const s = ev.start instanceof Date ? ev.start : new Date(String(ev.start));
      const e = ev.end   instanceof Date ? ev.end   : new Date(String(ev.end   ?? s));
      return s < end && e > start;
    });
  }

  // ── importFeed ──────────────────────────────────────────────────────────────

  async importFeed(opts?: { rangeStart?: Date; rangeEnd?: Date }): Promise<CalendarEventV1[]> {
    return this._fetch_and_parse(opts?.rangeStart, opts?.rangeEnd);
  }

  // ── exportFeed ──────────────────────────────────────────────────────────────

  async exportFeed(events: CalendarEventV1[]): Promise<string> {
    return serializeToICS(events);
  }

  // ── subscribe ───────────────────────────────────────────────────────────────

  /**
   * Polling subscribe.  Re-fetches the ICS feed every `refreshInterval` ms
   * and emits a `reload` change with the full updated event list.
   *
   * Pass `opts.rangeStart` / `opts.rangeEnd` to scope the reload window.
   */
  subscribe(
    callback: AdapterChangeCallback,
    opts?: { rangeStart?: Date; rangeEnd?: Date },
  ): AdapterUnsubscribe {
    if (!this._refreshInterval) return () => {};

    let active = true;
    let controller = new AbortController();

    const poll = async () => {
      if (!active) return;
      try {
        const events = await this.loadRange(
          opts?.rangeStart ?? new Date(Date.now() - 30 * 24 * 3600_000),
          opts?.rangeEnd   ?? new Date(Date.now() + 30 * 24 * 3600_000),
          controller.signal,
        );
        if (active) callback({ type: 'reload', events });
      } catch {
        // Ignore aborted requests
      }
    };

    const timer = setInterval(poll, this._refreshInterval);

    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }
}
