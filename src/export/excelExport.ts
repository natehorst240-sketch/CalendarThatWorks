/**
 * Excel (.xlsx) export — the optional, dependency-heavy exporter.
 *
 * Published as the `works-calendar/xlsx` subpath so it stays out of the
 * core bundle. `exceljs` is an *optional* peer dependency: consumers who
 * import this subpath must install it themselves. If the import fails at
 * runtime (or `exceljs` isn't present), this falls back to the
 * dependency-free CSV exporter.
 *
 * Keeping the bare `import('exceljs')` confined to this entry point means
 * the core `works-calendar` bundle never references `exceljs`, so a
 * consumer who never imports `works-calendar/xlsx` won't have their
 * bundler choke on the missing module.
 */
import type { NormalizedEvent } from '../types/events';
import { eventsToRows, toCSV, downloadBlob, type Row } from './csvExport';

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
