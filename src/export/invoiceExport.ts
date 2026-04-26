/**
 * invoiceExport — pluggable export for billable events.
 *
 * Three layers:
 *   1. toInvoiceLineItems(events, options?)   — pure data transform
 *   2. invoiceLineItemsToCSV(items)           — pure CSV string
 *   3. downloadInvoicesCSV(events, …)         — browser download convenience
 *
 * The library does not produce invoices; it produces the structured line-item
 * data a downstream system (QuickBooks, Stripe, your accountant's CSV import)
 * can consume. Source data lives on `event.meta.billing` (BillableMeta).
 */
import type { NormalizedEvent } from '../types/events';
import type { BillableMeta, InvoiceLineItem, InvoiceStatus } from '../types/billing';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY  = 86_400_000;

export type InvoiceQuantitySource = 'duration-hours' | 'duration-days' | 'none';

export interface InvoiceLineItemsOptions {
  /** Exclude events where `meta.billing.billable === false`. Events with the
   *  flag absent are still included by default — absence means "not specified",
   *  not "non-billable". Set this to `true` only when you trust the flag. */
  onlyBillable?: boolean;
  /** Restrict output to line items with one of these statuses. Default: all. */
  statuses?: readonly InvoiceStatus[];
  /** How to compute `quantity` when meta.billing.quantity is absent.
   *  - 'duration-hours' (default): event duration in hours, rounded to 2 dec.
   *  - 'duration-days':  event duration in days, rounded to 2 dec.
   *  - 'none':           leave quantity at 0 when not explicitly set. */
  quantityFrom?: InvoiceQuantitySource;
}

/**
 * Transform NormalizedEvents into a flat InvoiceLineItem[] ready for
 * downstream invoicing tools. Events without `meta.billing` are skipped.
 */
export function toInvoiceLineItems(
  events: readonly NormalizedEvent[],
  options: InvoiceLineItemsOptions = {},
): InvoiceLineItem[] {
  const onlyBillable = options.onlyBillable ?? false;
  const statuses     = options.statuses;
  const quantityFrom = options.quantityFrom ?? 'duration-hours';

  const out: InvoiceLineItem[] = [];

  for (const ev of events) {
    const billing = readBilling(ev);
    if (!billing) continue;
    if (onlyBillable && billing.billable === false) continue;

    const status: InvoiceStatus = billing.invoiceStatus ?? 'unbilled';
    if (statuses && !statuses.includes(status)) continue;

    const quantity = billing.quantity ?? deriveQuantity(ev, quantityFrom);
    const rate     = billing.rate     ?? null;
    const total    = rate != null ? round2(rate * quantity) : null;

    out.push({
      eventId:     ev.id,
      date:        ev.start,
      customer:    billing.customer ?? null,
      description: billing.description ?? ev.title,
      quantity,
      rate,
      total,
      currency:    billing.currency ?? null,
      status,
    });
  }

  return out;
}

// ── CSV serialization ────────────────────────────────────────────────────────

const INVOICE_HEADERS = [
  'Event ID',
  'Date',
  'Customer',
  'Description',
  'Quantity',
  'Rate',
  'Total',
  'Currency',
  'Status',
] as const;

export function invoiceLineItemsToCSV(items: readonly InvoiceLineItem[]): string {
  const rows = items.map(it => [
    it.eventId,
    formatDate(it.date),
    it.customer ?? '',
    it.description,
    String(it.quantity),
    it.rate  != null ? String(it.rate)  : '',
    it.total != null ? String(it.total) : '',
    it.currency ?? '',
    it.status,
  ]);
  return toCSV([INVOICE_HEADERS as readonly string[], ...rows]);
}

// ── Browser download ─────────────────────────────────────────────────────────

/**
 * Convenience: transform → CSV → trigger a browser download. Skipped silently
 * when called outside the browser (no `document`).
 */
export function downloadInvoicesCSV(
  events: readonly NormalizedEvent[],
  options: InvoiceLineItemsOptions = {},
  filename = 'invoices',
): void {
  const items = toInvoiceLineItems(events, options);
  const csv   = invoiceLineItemsToCSV(items);
  downloadCSV(csv, `${filename}.csv`);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readBilling(ev: NormalizedEvent): BillableMeta | null {
  const candidate = ev.meta?.['billing'];
  return candidate && typeof candidate === 'object' ? (candidate as BillableMeta) : null;
}

function deriveQuantity(ev: NormalizedEvent, mode: InvoiceQuantitySource): number {
  if (mode === 'none') return 0;
  const ms = ev.end.getTime() - ev.start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  if (mode === 'duration-days') return round2(ms / MS_PER_DAY);
  return round2(ms / MS_PER_HOUR);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDate(d: Date): string {
  // ISO date (yyyy-mm-dd) — matches what most accounting tools want.
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function toCSV(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return '';
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map(r => r.map(escape).join(',')).join('\n');
}

function downloadCSV(content: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
