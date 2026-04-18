/**
 * Public export wrapper that lazy-loads the heavy Excel implementation.
 */
export async function exportToExcel(events, filename = 'calendar-events') {
  const { exportToExcel: exportImpl } = await import('./excelExport.js');
  return exportImpl(events, filename);
}
