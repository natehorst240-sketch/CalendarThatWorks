/**
 * MaintenanceSection — opt-in section of the EventForm for maintenance-typed
 * events. Lets the user select a rule, set lifecycle, record a meter reading,
 * and add notes. Renders a live "next due" preview when lifecycle is
 * `complete` and the inputs are sufficient to project.
 *
 * Controlled. Reads `value: MaintenanceMeta | undefined` and emits the full
 * next meta (or `undefined` when the rule is cleared) via `onChange`. The
 * EventForm wires this into setMeta('maintenance', ...).
 */
import { useMemo } from 'react';
import type { ChangeEvent } from 'react';
import styles from '../EventForm.module.css';
import type { MaintenanceMeta, MaintenanceRule, MaintenanceLifecycle, MeterType } from '../../types/maintenance';
import { projectNextDue } from '../../core/maintenance';

const LIFECYCLE_OPTIONS: { id: MaintenanceLifecycle; label: string }[] = [
  { id: 'due',         label: 'Due'         },
  { id: 'scheduled',   label: 'Scheduled'   },
  { id: 'in-progress', label: 'In progress' },
  { id: 'complete',    label: 'Complete'    },
  { id: 'skipped',     label: 'Skipped'     },
];

export interface MaintenanceSectionProps {
  value: MaintenanceMeta | undefined;
  rules: readonly MaintenanceRule[];
  /** ISO timestamp used as `completedAt` when projecting the next-due preview.
   *  Typically `event.start` or now. */
  completedAt?: string;
  onChange: (next: MaintenanceMeta | undefined) => void;
}

export function MaintenanceSection({ value, rules, completedAt, onChange }: MaintenanceSectionProps) {
  const current   = value ?? {};
  const ruleId    = current.ruleId ?? '';
  const lifecycle = current.lifecycle ?? '';
  const meter     = current.meterAtService;
  const notes     = current.notes ?? '';

  const selectedRule = useMemo(() => rules.find(r => r.id === ruleId), [rules, ruleId]);
  const meterDim     = inferMeterDim(selectedRule);
  const showsMeter   = !!meterDim;

  const preview = useMemo(() => {
    if (!selectedRule || lifecycle !== 'complete') return null;
    if (showsMeter && meter == null) return null;
    return projectNextDue(selectedRule, {
      ...(meter != null && { meterAtService: meter }),
      ...(completedAt && { completedAt }),
    });
  }, [selectedRule, lifecycle, meter, completedAt, showsMeter]);

  function emit(patch: Partial<MaintenanceMeta>) {
    const next: MaintenanceMeta = { ...current, ...patch };
    onChange(next);
  }

  function handleRuleChange(e: ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) {
      onChange(undefined); // clearing the rule clears the whole section
      return;
    }
    // Default lifecycle to 'scheduled' when picking a rule for the first time.
    onChange({ ...current, ruleId: id, lifecycle: current.lifecycle ?? 'scheduled' });
  }

  function handleLifecycleChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as MaintenanceLifecycle | '';
    if (!v) { const { lifecycle: _drop, ...rest } = current; onChange(rest); return; }
    emit({ lifecycle: v });
  }

  function handleMeterChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === '') {
      const { meterAtService: _drop, ...rest } = current;
      onChange(rest);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) emit({ meterAtService: n });
  }

  return (
    <fieldset className={styles['field']} style={{ border: '1px solid var(--wc-border)', borderRadius: 6, padding: 10 }}>
      <legend style={{ padding: '0 6px', fontSize: 12, fontWeight: 600, color: 'var(--wc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Maintenance
      </legend>

      <div className={styles['field']}>
        <label className={styles['label']} htmlFor="ef-maint-rule">Rule</label>
        <select id="ef-maint-rule" className={styles['select']} value={ruleId} onChange={handleRuleChange}>
          <option value="">— None —</option>
          {rules.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </div>

      {ruleId && (
        <>
          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="ef-maint-lifecycle">Status</label>
            <select id="ef-maint-lifecycle" className={styles['select']} value={lifecycle} onChange={handleLifecycleChange}>
              <option value="">— Not set —</option>
              {LIFECYCLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>

          {showsMeter && (
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ef-maint-meter">Meter at service ({meterDim})</label>
              <input
                id="ef-maint-meter"
                type="number"
                inputMode="decimal"
                className={styles['input']}
                value={meter ?? ''}
                onChange={handleMeterChange}
                placeholder={`e.g. 110000`}
              />
            </div>
          )}

          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="ef-maint-notes">Notes</label>
            <textarea
              id="ef-maint-notes"
              className={styles['input']}
              rows={2}
              value={notes}
              onChange={e => emit({ notes: e.target.value })}
              placeholder="Technician notes…"
            />
          </div>

          {preview && hasAnyProjection(preview) && (
            <div
              data-testid="maint-next-due-preview"
              style={{
                fontSize: 11, color: 'var(--wc-text-muted)',
                background: 'color-mix(in srgb, var(--wc-accent) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--wc-accent) 25%, transparent)',
                borderRadius: 4, padding: '4px 8px', marginTop: 4,
              }}
            >
              <strong style={{ color: 'var(--wc-text)' }}>Next due:</strong>{' '}
              {formatProjection(preview)}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function inferMeterDim(rule: MaintenanceRule | undefined): MeterType | null {
  const i = rule?.interval;
  if (!i) return null;
  if (i.miles  != null) return 'miles';
  if (i.hours  != null) return 'hours';
  if (i.cycles != null) return 'cycles';
  return null; // days-only rule — no meter input needed
}

type Projection = ReturnType<typeof projectNextDue>;

function hasAnyProjection(p: Projection): boolean {
  return p.nextDueMiles != null || p.nextDueHours != null || p.nextDueCycles != null || !!p.nextDueDate;
}

function formatProjection(p: Projection): string {
  const parts: string[] = [];
  if (p.nextDueMiles  != null) parts.push(`${p.nextDueMiles.toLocaleString()} mi`);
  if (p.nextDueHours  != null) parts.push(`${p.nextDueHours.toLocaleString()} hr`);
  if (p.nextDueCycles != null) parts.push(`${p.nextDueCycles.toLocaleString()} cycles`);
  if (p.nextDueDate)           parts.push(p.nextDueDate.slice(0, 10));
  return parts.join(' · ');
}
