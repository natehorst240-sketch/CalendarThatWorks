/**
 * Billing types — typed metadata that hangs off `WorksCalendarEvent.meta.billing`.
 *
 * Kept intentionally minimal: this is the import/export contract for plugging
 * WorksCalendar into a downstream invoicing system (QuickBooks, Stripe, a CSV
 * import in the user's accounting tool, etc.). The library does not produce
 * invoices itself.
 */

export type InvoiceStatus = 'unbilled' | 'invoiced' | 'paid' | 'void';

export interface BillableMeta {
  /** Whether this event represents billable work. Absence == unknown. */
  billable?: boolean;
  /** Free-form customer identifier (name, ID, account number — consumer's choice). */
  customer?: string;
  /** Numeric rate. Units are consumer-defined (per hour, per job, per mile). */
  rate?: number;
  /** Optional explicit quantity. If absent, downstream may derive from event duration. */
  quantity?: number;
  /** Currency code (ISO 4217) when known. */
  currency?: string;
  /** Lifecycle for downstream sync. */
  invoiceStatus?: InvoiceStatus;
  /** Opaque ID from the downstream invoicing system once exported. */
  externalInvoiceId?: string;
  /** Free-text description that downstream invoicing tools can use as the line label. */
  description?: string;
}

/**
 * Flat shape consumers (or our own export helpers) can produce from a
 * NormalizedEvent + BillableMeta. Kept structural so any invoicing backend
 * can map it.
 */
export interface InvoiceLineItem {
  eventId: string;
  date: Date;
  customer: string | null;
  description: string;
  quantity: number;
  rate: number | null;
  total: number | null;
  currency: string | null;
  status: InvoiceStatus;
}
