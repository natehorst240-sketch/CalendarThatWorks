/**
 * excelExport.js — Export visible events to Excel (SheetJS) with CSV fallback.
 */
import { format } from 'date-fns';

function eventsToRows(events) {
  return events.map(ev => ({
    Title:    ev.title,
    Start:    format(ev.start, 'yyyy-MM-dd HH:mm'),
    End:      format(ev.end,   'yyyy-MM-dd HH:mm'),
    AllDay:   ev.allDay ? 'Yes' : 'No',
    Category: ev.category || '',
    Resource: ev.resource || '',
    ...ev.meta,
  }));
}

function toCSV(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToExcel(events, filename = 'calendar-events') {
  const rows = eventsToRows(events);

  try {
    // Attempt SheetJS
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Events');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } catch {
    // Fallback to CSV
    const csv = toCSV(rows);
    downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
  }
}
