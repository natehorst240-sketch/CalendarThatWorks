/**
 * Example 11 — Maintenance & Invoicing Integration
 *
 * Small ops shops (trucking, flight schools, equipment rental) typically run
 * scheduling separately from their accounting + maintenance systems. This
 * example shows how WorksCalendar plugs into both without owning either:
 *
 *   • Per-asset maintenance rules with automatic due-status computation
 *   • Asset-row badges that surface "due soon" / "overdue" at a glance
 *   • EventForm gains a Maintenance section — completing a service auto-
 *     stamps next-due fields onto the event so the badges update.
 *   • One-click CSV export for invoices and maintenance log, ready to
 *     drop into QuickBooks, Excel, or a fleet management tool.
 *
 * The library does not produce invoices and does not store readings —
 * those live wherever the consumer wants. This example uses simple in-
 * memory state to keep the wiring honest.
 */
import { useState, useCallback, useMemo } from 'react';
import {
  WorksCalendar,
  AssetMaintenanceBadges,
  toInvoiceLineItems,
  invoiceLineItemsToCSV,
  downloadInvoicesCSV,
  downloadMaintenanceLogCSV,
} from '../src/index.ts';
import type {
  WorksCalendarEvent,
  MaintenanceRule,
  MeterType,
  LastService,
} from '../src/index.ts';

// ── Asset registry ───────────────────────────────────────────────────────────
const ASSETS = [
  { id: 'truck-12', label: 'Truck 12', meta: { sublabel: 'Box truck · F-450' } },
  { id: 'truck-13', label: 'Truck 13', meta: { sublabel: 'Box truck · F-550' } },
  { id: 'truck-14', label: 'Truck 14', meta: { sublabel: 'Reefer · M2-106'   } },
];

// ── Maintenance rules (per-asset or per-asset-type) ──────────────────────────
const RULES: MaintenanceRule[] = [
  {
    id: 'oil-10k',
    assetType: 'truck',
    title: 'Oil change',
    interval:      { miles: 10_000 },
    warningWindow: { miles: 1_500 },
  },
  {
    id: 'dot-annual',
    assetType: 'truck',
    title: 'DOT inspection',
    interval:      { days: 365 },
    warningWindow: { days: 30 },
  },
  {
    id: 'brake-30k',
    assetType: 'truck',
    title: 'Brake service',
    interval:      { miles: 30_000 },
    warningWindow: { miles: 5_000 },
  },
];

// In a real app these come from a backend. Here, simulated last-service state.
const LAST_SERVICE_BY_ASSET: Record<string, Record<string, LastService>> = {
  'truck-12': {
    'oil-10k':    { meterAtService: 100_000, completedAt: '2025-12-01T00:00:00Z' },
    'dot-annual': { completedAt: '2025-04-15T00:00:00Z' }, // due soon
    'brake-30k':  { meterAtService:  90_000, completedAt: '2025-08-01T00:00:00Z' },
  },
  'truck-13': {
    'oil-10k':    { meterAtService: 200_000, completedAt: '2026-03-20T00:00:00Z' },
    'dot-annual': { completedAt: '2025-10-01T00:00:00Z' },
  },
  // truck-14 has no history yet — badges render as "unknown".
};

const CURRENT_METER: Record<string, { type: MeterType; value: number }> = {
  'truck-12': { type: 'miles', value: 109_200 }, // oil due soon (800 mi away)
  'truck-13': { type: 'miles', value: 201_400 },
  'truck-14': { type: 'miles', value:  35_000 },
};

// ── Seed events: a mix of billable jobs and maintenance work ─────────────────
function seedEvents(): WorksCalendarEvent[] {
  const today = new Date();
  const day   = (offset: number, hour = 9) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  return [
    {
      id: 'job-1', title: 'ABC Logistics — transit', resource: 'truck-12',
      start: day(-1, 8), end: day(-1, 16),
      meta: { billing: { billable: true, customer: 'ABC Logistics', rate: 120, currency: 'USD', invoiceStatus: 'invoiced' } },
    },
    {
      id: 'job-2', title: 'XYZ Freight — delivery', resource: 'truck-13',
      start: day(0, 7), end: day(0, 12),
      meta: { billing: { billable: true, customer: 'XYZ Freight', rate: 145, currency: 'USD', invoiceStatus: 'unbilled' } },
    },
    {
      id: 'svc-1', title: 'Oil change — Truck 12', resource: 'truck-12',
      start: day(1, 10), end: day(1, 11),
      category: 'Maintenance',
      meta: { maintenance: { ruleId: 'oil-10k', lifecycle: 'scheduled' } },
    },
    {
      id: 'job-3', title: 'Acme — last-mile run', resource: 'truck-14',
      start: day(2, 8), end: day(2, 14),
      meta: { billing: { billable: true, customer: 'Acme', rate: 95, currency: 'USD', invoiceStatus: 'paid' } },
    },
  ];
}

// ── Component ────────────────────────────────────────────────────────────────
export function MaintenanceAndInvoicingExample() {
  const [events, setEvents] = useState<WorksCalendarEvent[]>(seedEvents);

  const handleSave = useCallback((ev: WorksCalendarEvent) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, { ...ev, id: ev.id ?? `evt-${Date.now()}` }];
    });
  }, []);

  // Renders the maintenance status chips inside each asset row.
  // The library passes us the asset id; we look up rules + state and let
  // <AssetMaintenanceBadges /> compute due-status and render chips.
  const renderAssetBadges = useCallback((asset: { id: string }) => (
    <AssetMaintenanceBadges
      rules={RULES}
      currentMeter={CURRENT_METER[asset.id]}
      lastServiceByRule={LAST_SERVICE_BY_ASSET[asset.id]}
      max={3}
    />
  ), []);

  // Pre-compute invoice totals so the toolbar can show a quick summary.
  const invoiceSummary = useMemo(() => {
    const items = toInvoiceLineItems(
      // The export helpers want NormalizedEvent[] — for in-memory examples
      // we cast through unknown since our raw events are close enough in shape.
      events as unknown as Parameters<typeof toInvoiceLineItems>[0],
    );
    const total = items.reduce((acc, i) => acc + (i.total ?? 0), 0);
    return { count: items.length, total };
  }, [events]);

  function handleExportInvoices() {
    downloadInvoicesCSV(events as unknown as Parameters<typeof downloadInvoicesCSV>[0], {}, 'invoices');
  }

  function handleExportMaintenance() {
    downloadMaintenanceLogCSV(
      events as unknown as Parameters<typeof downloadMaintenanceLogCSV>[0],
      { rules: RULES },
      'maintenance-log',
    );
  }

  function handleCopyInvoiceCSV() {
    const csv = invoiceLineItemsToCSV(toInvoiceLineItems(
      events as unknown as Parameters<typeof toInvoiceLineItems>[0],
    ));
    if (navigator.clipboard) navigator.clipboard.writeText(csv);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Lightweight toolbar above the calendar — invoicing / export actions. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderBottom: '1px solid var(--wc-border)',
        background: 'var(--wc-surface)',
      }}>
        <strong style={{ fontSize: 13 }}>Invoices:</strong>
        <span style={{ fontSize: 13, color: 'var(--wc-text-muted)' }}>
          {invoiceSummary.count} item{invoiceSummary.count === 1 ? '' : 's'}
          {' · '}
          ${invoiceSummary.total.toFixed(2)}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={handleCopyInvoiceCSV}    style={btn}>Copy CSV</button>
        <button onClick={handleExportInvoices}    style={btn}>Export invoices</button>
        <button onClick={handleExportMaintenance} style={btn}>Export maintenance log</button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <WorksCalendar
          devMode
          calendarId="maintenance-invoicing"
          initialView="assets"
          events={events}
          assets={ASSETS}
          renderAssetBadges={renderAssetBadges}
          maintenanceRules={RULES}
          showAddButton
          onEventSave={handleSave}
          onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
        />
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 500,
  background: 'var(--wc-bg)',
  color: 'var(--wc-text)',
  border: '1px solid var(--wc-border)',
  borderRadius: 6,
  cursor: 'pointer',
};
