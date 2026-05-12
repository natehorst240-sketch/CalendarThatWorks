import { format } from 'date-fns';
import type { NormalizedEvent } from '../types/events';

type Row = Record<string, unknown>;

interface ExcelJSWorksheet {
  columns: Array<{ header: string; key: string; width: number }>;
  addRow(row: Row): void;
}

interface ExcelJSWorkbook {
  addWorksheet(name: string): ExcelJSWorksheet;
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
}

interface ExcelJSModule {
  Workbook: new () => ExcelJSWorkbook;
}

function sanitizeCell(v: string): string {
  return /^[=+\-@|%]/.test(v) ? `\t${v}` : v;
}

function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  return Object.fromEntries(
    Object.entries(meta).map(([k, v]) => [k, typeof v === 'string' ? sanitizeCell(v) : v]),
  );
}

function eventsToRows(events: NormalizedEvent[]): Row[] {
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

function toCSV(rows: Row[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToExcel(events: NormalizedEvent[], filename = 'calendar-events'): Promise<void> {
  const rows = eventsToRows(events);

  try {
    const ExcelJS = (await import('exceljs')) as unknown as ExcelJSModule;
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Events');

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]!);
      worksheet.columns = headers.map(key => ({ header: key, key, width: 20 }));
      rows.forEach(row => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob   = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `${filename}.xlsx`);
  } catch {
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${filename}.csv`);
  }
}
