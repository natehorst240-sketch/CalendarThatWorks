/**
 * CSV export — the dependency-free core exporter.
 *
 * This path has no third-party dependencies, so it never breaks a
 * consumer's bundle. The richer .xlsx exporter lives in `./excelExport`
 * (published as the optional `works-calendar/xlsx` subpath) and reuses
 * the row-shaping + download helpers exported from here.
 */
import { format } from 'date-fns';
import type { NormalizedEvent } from '../types/events';

export type Row = Record<string, unknown>;

/**
 * Defuse spreadsheet formula injection: a leading =, +, -, @, |, or %
 * in a cell can be interpreted as a formula by Excel / Sheets. Prefix
 * with a tab so the value renders literally.
 */
export function sanitizeCell(v: string): string {
  return /^[=+\-@|%]/.test(v) ? `\t${v}` : v;
}

export function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  return Object.fromEntries(
    Object.entries(meta).map(([k, v]) => [k, typeof v === 'string' ? sanitizeCell(v) : v]),
  );
}

export function eventsToRows(events: NormalizedEvent[]): Row[] {
  return events.map(ev => ({
    Title:    sanitizeCell(ev.title),
    Start:    format(ev.start, 'yyyy-MM-dd HH:mm'),
    End:      format(ev.end,   'yyyy-MM-dd HH:mm'),
    AllDay:   ev.allDay ? 'Yes' : 'No',
    Category: sanitizeCell(ev.category || ''),
    Resource: sanitizeCell(ev.resource || ''),
    ...sanitizeMeta(ev.meta as Record<string, unknown>),
  }));
}

export function toCSV(rows: Row[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCsv(events: NormalizedEvent[], filename = 'calendar-events'): void {
  const csv = toCSV(eventsToRows(events));
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}
