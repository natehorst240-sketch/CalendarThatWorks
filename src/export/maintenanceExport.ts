/**
 * maintenanceExport — pluggable export for maintenance work events.
 *
 * Three layers:
 *   1. toMaintenanceLog(events, options?)     — pure data transform
 *   2. maintenanceLogToCSV(entries)           — pure CSV string
 *   3. downloadMaintenanceLogCSV(events, …)   — browser download convenience
 *
 * Source data lives on `event.meta.maintenance` (MaintenanceMeta). Pass the
 * rules array via options to get human-readable rule titles in the output.
 */
import type { NormalizedEvent } from '../types/events';
import type {
  MaintenanceMeta,
  MaintenanceLifecycle,
  MaintenanceRule,
} from '../types/maintenance';

export interface MaintenanceLogEntry {
  eventId: string;
  date: Date;
  /** Asset id from `event.resource`. May be null when the event has none. */
  asset: string | null;
  /** Human-readable rule title from the supplied rules array. Falls back to ruleId. */
  rule: string | null;
  ruleId: string | null;
  lifecycle: MaintenanceLifecycle | null;
  meterAtService: number | null;
  nextDueMiles: number | null;
  nextDueHours: number | null;
  nextDueCycles: number | null;
  /** ISO-8601 date string from MaintenanceMeta.nextDueDate. */
  nextDueDate: string | null;
  notes: string;
}

export interface MaintenanceLogOptions {
  /** Filter to entries with one of these lifecycles. Default: all maintenance events. */
  lifecycles?: readonly MaintenanceLifecycle[];
  /** Rules registry — used to resolve `ruleId` → human-readable `rule`. */
  rules?: readonly MaintenanceRule[];
}

/**
 * Transform NormalizedEvents into a flat MaintenanceLogEntry[] for downstream
 * reporting. Events without `meta.maintenance` are skipped.
 */
export function toMaintenanceLog(
  events: readonly NormalizedEvent[],
  options: MaintenanceLogOptions = {},
): MaintenanceLogEntry[] {
  const lifecycles = options.lifecycles;
  const rulesById  = indexRules(options.rules);

  const out: MaintenanceLogEntry[] = [];

  for (const ev of events) {
    const m = readMaintenance(ev);
    if (!m) continue;
    const lifecycle = m.lifecycle ?? null;
    if (lifecycles && (lifecycle == null || !lifecycles.includes(lifecycle))) continue;

    const ruleId = m.ruleId ?? null;
    const rule   = ruleId
      ? (rulesById?.get(ruleId)?.title ?? ruleId)
      : null;

    out.push({
      eventId:        ev.id,
      date:           ev.start,
      asset:          ev.resource,
      rule,
      ruleId,
      lifecycle,
      meterAtService: m.meterAtService ?? null,
      nextDueMiles:   m.nextDueMiles   ?? null,
      nextDueHours:   m.nextDueHours   ?? null,
      nextDueCycles:  m.nextDueCycles  ?? null,
      nextDueDate:    m.nextDueDate    ?? null,
      notes:          m.notes ?? '',
    });
  }

  return out;
}

// ── CSV serialization ────────────────────────────────────────────────────────

const MAINTENANCE_HEADERS = [
  'Event ID',
  'Date',
  'Asset',
  'Rule',
  'Rule ID',
  'Lifecycle',
  'Meter at service',
  'Next due (miles)',
  'Next due (hours)',
  'Next due (cycles)',
  'Next due (date)',
  'Notes',
] as const;

export function maintenanceLogToCSV(entries: readonly MaintenanceLogEntry[]): string {
  const rows = entries.map(e => [
    e.eventId,
    formatDate(e.date),
    e.asset ?? '',
    e.rule  ?? '',
    e.ruleId ?? '',
    e.lifecycle ?? '',
    e.meterAtService != null ? String(e.meterAtService) : '',
    e.nextDueMiles   != null ? String(e.nextDueMiles)   : '',
    e.nextDueHours   != null ? String(e.nextDueHours)   : '',
    e.nextDueCycles  != null ? String(e.nextDueCycles)  : '',
    e.nextDueDate ? e.nextDueDate.slice(0, 10) : '',
    e.notes,
  ]);
  return toCSV([MAINTENANCE_HEADERS as readonly string[], ...rows]);
}

// ── Browser download ─────────────────────────────────────────────────────────

export function downloadMaintenanceLogCSV(
  events: readonly NormalizedEvent[],
  options: MaintenanceLogOptions = {},
  filename = 'maintenance-log',
): void {
  const entries = toMaintenanceLog(events, options);
  const csv     = maintenanceLogToCSV(entries);
  downloadCSV(csv, `${filename}.csv`);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readMaintenance(ev: NormalizedEvent): MaintenanceMeta | null {
  const candidate = ev.meta?.['maintenance'];
  return candidate && typeof candidate === 'object' ? (candidate as MaintenanceMeta) : null;
}

function indexRules(rules: readonly MaintenanceRule[] | undefined): Map<string, MaintenanceRule> | null {
  if (!rules || !rules.length) return null;
  const m = new Map<string, MaintenanceRule>();
  for (const r of rules) m.set(r.id, r);
  return m;
}

function formatDate(d: Date): string {
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
