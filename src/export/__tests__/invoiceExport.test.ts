/**
 * invoiceExport — pure transform + CSV serialization.
 */
import { describe, it, expect } from 'vitest';
import {
  toInvoiceLineItems,
  invoiceLineItemsToCSV,
} from '../invoiceExport';
import type { NormalizedEvent } from '../../types/events';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id:    'evt-1',
    title: 'Job',
    start: new Date('2026-04-10T09:00:00Z'),
    end:   new Date('2026-04-10T11:00:00Z'),
    allDay: false,
    category: null,
    color:    '#3b82f6',
    resource: 'truck-12',
    status:   'confirmed',
    meta:     {},
    rrule:    null,
    exdates:  [],
    _raw:     {} as any,
    ...overrides,
  };
}

// ── toInvoiceLineItems ───────────────────────────────────────────────────────

describe('toInvoiceLineItems', () => {
  it('skips events with no meta.billing', () => {
    expect(toInvoiceLineItems([makeEvent()])).toEqual([]);
  });

  it('emits a line item with all fields populated when billing is set', () => {
    const ev = makeEvent({
      meta: { billing: {
        billable: true, customer: 'ABC Logistics', rate: 120, quantity: 2,
        currency: 'USD', invoiceStatus: 'unbilled', description: 'Transit',
      } },
    });
    const [item] = toInvoiceLineItems([ev]);
    expect(item).toEqual({
      eventId:     'evt-1',
      date:        ev.start,
      customer:    'ABC Logistics',
      description: 'Transit',
      quantity:    2,
      rate:        120,
      total:       240,
      currency:    'USD',
      status:      'unbilled',
    });
  });

  it('falls back to event title when description is absent', () => {
    const ev = makeEvent({ title: 'Box truck run', meta: { billing: { rate: 50 } } });
    expect(toInvoiceLineItems([ev])[0]!.description).toBe('Box truck run');
  });

  it('derives quantity from event duration in hours by default (2-hour event → 2)', () => {
    const ev = makeEvent({ meta: { billing: { rate: 100 } } });
    const [item] = toInvoiceLineItems([ev]);
    expect(item!.quantity).toBe(2);
    expect(item!.total).toBe(200);
  });

  it('derives quantity in days when quantityFrom: duration-days', () => {
    const ev = makeEvent({
      start: new Date('2026-04-10T00:00:00Z'),
      end:   new Date('2026-04-12T12:00:00Z'),
      meta:  { billing: { rate: 250 } },
    });
    const [item] = toInvoiceLineItems([ev], { quantityFrom: 'duration-days' });
    expect(item!.quantity).toBe(2.5);
    expect(item!.total).toBe(625);
  });

  it('leaves quantity at 0 when quantityFrom: none and no explicit quantity', () => {
    const ev = makeEvent({ meta: { billing: { rate: 100 } } });
    const [item] = toInvoiceLineItems([ev], { quantityFrom: 'none' });
    expect(item!.quantity).toBe(0);
    expect(item!.total).toBe(0);
  });

  it('leaves total null when rate is absent', () => {
    const ev = makeEvent({ meta: { billing: { quantity: 3 } } });
    expect(toInvoiceLineItems([ev])[0]!.total).toBeNull();
    expect(toInvoiceLineItems([ev])[0]!.rate).toBeNull();
  });

  it('defaults status to "unbilled" when invoiceStatus is absent', () => {
    const ev = makeEvent({ meta: { billing: { rate: 50 } } });
    expect(toInvoiceLineItems([ev])[0]!.status).toBe('unbilled');
  });

  it('honors onlyBillable: true to drop billable=false events', () => {
    const billable    = makeEvent({ id: 'a', meta: { billing: { billable: true,  rate: 50 } } });
    const nonBillable = makeEvent({ id: 'b', meta: { billing: { billable: false, rate: 50 } } });
    const unspecified = makeEvent({ id: 'c', meta: { billing: { rate: 50 } } });
    const ids = toInvoiceLineItems([billable, nonBillable, unspecified], { onlyBillable: true })
      .map(i => i.eventId);
    expect(ids).toEqual(['a', 'c']); // unspecified absence is included
  });

  it('filters by status when provided', () => {
    const a = makeEvent({ id: 'a', meta: { billing: { rate: 1, invoiceStatus: 'unbilled' } } });
    const b = makeEvent({ id: 'b', meta: { billing: { rate: 1, invoiceStatus: 'invoiced' } } });
    const c = makeEvent({ id: 'c', meta: { billing: { rate: 1, invoiceStatus: 'paid' } } });
    const ids = toInvoiceLineItems([a, b, c], { statuses: ['invoiced', 'paid'] }).map(i => i.eventId);
    expect(ids).toEqual(['b', 'c']);
  });

  it('rounds derived quantity to 2 decimal places', () => {
    const ev = makeEvent({
      start: new Date('2026-04-10T09:00:00Z'),
      end:   new Date('2026-04-10T09:20:00Z'), // 0.333… hours
      meta:  { billing: { rate: 60 } },
    });
    const [item] = toInvoiceLineItems([ev]);
    expect(item!.quantity).toBe(0.33);
    expect(item!.total).toBe(19.8); // 0.33 * 60
  });

  it('treats malformed meta.billing (non-object) as absent', () => {
    const ev = makeEvent({ meta: { billing: 'oops' as unknown as object } });
    expect(toInvoiceLineItems([ev])).toEqual([]);
  });
});

// ── invoiceLineItemsToCSV ────────────────────────────────────────────────────

describe('invoiceLineItemsToCSV', () => {
  it('emits headers + a row, ISO-formatted date, blank for nulls', () => {
    const ev = makeEvent({
      meta: { billing: { customer: 'ABC', rate: 100, invoiceStatus: 'paid' } },
    });
    const csv = invoiceLineItemsToCSV(toInvoiceLineItems([ev]));
    const [header, row] = csv.split('\n');
    expect(header).toBe('"Event ID","Date","Customer","Description","Quantity","Rate","Total","Currency","Status"');
    expect(row).toBe('"evt-1","2026-04-10","ABC","Job","2","100","200","","paid"');
  });

  it('escapes embedded quotes in description', () => {
    const ev = makeEvent({
      title: 'She said "hi"',
      meta:  { billing: { rate: 50 } },
    });
    const csv = invoiceLineItemsToCSV(toInvoiceLineItems([ev]));
    expect(csv.split('\n')[1]).toContain('"She said ""hi"""');
  });

  it('emits a header-only CSV for empty input (accounting tools import cleanly)', () => {
    const csv = invoiceLineItemsToCSV([]);
    expect(csv).toBe('"Event ID","Date","Customer","Description","Quantity","Rate","Total","Currency","Status"');
  });
});
