/**
 * CascadePanel — tiered scope picker.
 *
 * A vertical stack of tiers (Region → Base → Type → Sub-type, etc.). Each
 * tier is a multi-select pill row with an "All" pill that's selected when
 * nothing else in that tier is. Tiers are independent multi-selects, but
 * downstream tiers compute their options as a function of upstream
 * selections (the host wires this via `tier.getOptions(selections)`),
 * which is how "pick North → South bases vanish" pruning works.
 *
 * Selections are an opaque `Record<tierId, string[]>`. The host translates
 * them to whatever filter shape the calendar consumes — typically by
 * mapping each tier id to a `tier.filterField` key in the filter object.
 *
 * "+ More Options" reveals a second stack of tiers (e.g. certifications,
 * shift patterns) — same UI shape, just hidden by default to keep the
 * common cascade clean.
 *
 * Save calls back into the host with the current selections; the host
 * decides what to do (typically capture as a saved-view chip).
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './CascadePanel.module.css';

export type CascadeSelections = Readonly<Record<string, readonly string[]>>;

export interface CascadeOption {
  readonly value: string;
  readonly label: string;
  /** Optional badge count rendered next to the option label. */
  readonly count?: number;
}

export interface CascadeTier {
  readonly id: string;
  readonly label: string;
  /**
   * Options for this tier given current selections. Upstream tiers being
   * narrowed should produce a shorter list here — that's how downstream
   * pruning is expressed. An empty list renders as "no options".
   */
  readonly getOptions: (selections: CascadeSelections) => readonly CascadeOption[];
  /**
   * If set, the tier label gets a small meta string under it (e.g.
   * "select one or more").
   */
  readonly hint?: string;
  /** Optional override for the "All" pill label — defaults to "All". */
  readonly allLabel?: string;
}

export interface CascadeConfig {
  readonly tiers: readonly CascadeTier[];
  /** Optional second stack revealed by the "+ More Options" expander. */
  readonly moreOptions?: readonly CascadeTier[];
  /** Label for the "+ More Options" toggle. Defaults to "More options". */
  readonly moreOptionsLabel?: string;
}

export interface CascadePanelProps {
  readonly config: CascadeConfig;
  readonly selections: CascadeSelections;
  readonly onSelectionsChange: (next: CascadeSelections) => void;
  /** Called when the user clicks Save. The host decides naming/persistence. */
  readonly onSave?: (snapshot: CascadeSelections) => void;
  /** Called when the user clicks Reset. Defaults to clearing all selections. */
  readonly onReset?: () => void;
}

const EMPTY_ARRAY: readonly string[] = [];

function isEmpty(selections: CascadeSelections): boolean {
  for (const key in selections) {
    if (selections[key] && selections[key]!.length > 0) return false;
  }
  return true;
}

export default function CascadePanel({
  config,
  selections,
  onSelectionsChange,
  onSave,
  onReset,
}: CascadePanelProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const allTiers = useMemo(
    () => [...config.tiers, ...(config.moreOptions ?? [])],
    [config.tiers, config.moreOptions],
  );

  const summary = useMemo(() => buildSummary(allTiers, selections), [allTiers, selections]);
  const hasSelection = !isEmpty(selections);

  const setTier = (tierId: string, next: readonly string[]) => {
    const updated: Record<string, readonly string[]> = { ...selections };
    if (next.length === 0) {
      delete updated[tierId];
    } else {
      updated[tierId] = next;
    }
    // Drop downstream tier selections whose chosen values are no longer in
    // their pruned options. We re-resolve options against the updated upstream
    // state and intersect.
    const tierIndex = allTiers.findIndex(t => t.id === tierId);
    if (tierIndex >= 0) {
      for (let i = tierIndex + 1; i < allTiers.length; i += 1) {
        const t = allTiers[i]!;
        const sel = updated[t.id];
        if (!sel || sel.length === 0) continue;
        const validValues = new Set(t.getOptions(updated).map(o => o.value));
        const filtered = sel.filter(v => validValues.has(v));
        if (filtered.length === 0) {
          delete updated[t.id];
        } else if (filtered.length !== sel.length) {
          updated[t.id] = filtered;
        }
      }
    }
    onSelectionsChange(updated);
  };

  const toggleValue = (tierId: string, value: string) => {
    const current = selections[tierId] ?? EMPTY_ARRAY;
    const has = current.includes(value);
    const next = has ? current.filter(v => v !== value) : [...current, value];
    setTier(tierId, next);
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      onSelectionsChange({});
    }
  };

  const handleSave = () => {
    if (!onSave) return;
    onSave(selections);
  };

  return (
    <div className={styles['root']}>
      <div className={styles['intro']}>
        <span className={styles['introLabel']}>Scope</span>
        <span className={styles['introHint']}>
          Narrow the calendar by drilling down. Each tier defaults to All;
          stop where you want and Save creates a chip.
        </span>
      </div>

      {config.tiers.map(tier => (
        <CascadeTierRow
          key={tier.id}
          tier={tier}
          selections={selections}
          onToggleValue={toggleValue}
          onClearTier={(id) => setTier(id, EMPTY_ARRAY)}
        />
      ))}

      {config.moreOptions && config.moreOptions.length > 0 && (
        <>
          <hr className={styles['divider']} />
          <button
            type="button"
            className={styles['moreToggle']}
            onClick={() => setMoreOpen(v => !v)}
            aria-expanded={moreOpen}
          >
            {moreOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            {config.moreOptionsLabel ?? 'More options'}
          </button>

          {moreOpen && (
            <div className={styles['moreBody']}>
              {config.moreOptions.map(tier => (
                <CascadeTierRow
                  key={tier.id}
                  tier={tier}
                  selections={selections}
                  onToggleValue={toggleValue}
                  onClearTier={(id) => setTier(id, EMPTY_ARRAY)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div className={styles['actions']}>
        <span className={styles['summary']} aria-live="polite">
          {summary}
        </span>
        <span className={styles['actionGroup']}>
          <button
            type="button"
            className={styles['btnGhost']}
            onClick={handleReset}
            disabled={!hasSelection}
          >
            Reset
          </button>
          {onSave && (
            <button
              type="button"
              className={styles['btnPrimary']}
              onClick={handleSave}
              disabled={!hasSelection}
            >
              Save
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

interface TierRowProps {
  tier: CascadeTier;
  selections: CascadeSelections;
  onToggleValue: (tierId: string, value: string) => void;
  onClearTier: (tierId: string) => void;
}

function CascadeTierRow({ tier, selections, onToggleValue, onClearTier }: TierRowProps) {
  const options = tier.getOptions(selections);
  const selected = selections[tier.id] ?? EMPTY_ARRAY;
  const allSelected = selected.length === 0;

  return (
    <div className={styles['tier']}>
      <div className={styles['tierHead']}>
        <span className={styles['tierLabel']}>{tier.label}</span>
        {tier.hint && <span className={styles['tierMeta']}>{tier.hint}</span>}
      </div>

      {options.length === 0 ? (
        <div className={styles['empty']}>No options for the current scope.</div>
      ) : (
        <div className={styles['pills']}>
          <button
            type="button"
            className={[styles['pill'], styles['pillAll'], allSelected && styles['pillSelected']]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onClearTier(tier.id)}
            aria-pressed={allSelected}
          >
            {tier.allLabel ?? 'All'}
          </button>
          {options.map(opt => {
            const isSel = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={[styles['pill'], isSel && styles['pillSelected']].filter(Boolean).join(' ')}
                onClick={() => onToggleValue(tier.id, opt.value)}
                aria-pressed={isSel}
              >
                {opt.label}
                {typeof opt.count === 'number' && (
                  <span className={styles['pillCount']}>· {opt.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildSummary(tiers: readonly CascadeTier[], selections: CascadeSelections): React.ReactNode {
  const parts: string[] = [];
  for (const tier of tiers) {
    const sel = selections[tier.id];
    if (!sel || sel.length === 0) continue;
    const opts = tier.getOptions(selections);
    const labelMap = new Map(opts.map(o => [o.value, o.label]));
    const labels = sel.map(v => labelMap.get(v) ?? v);
    parts.push(`${tier.label}: ${labels.join(', ')}`);
  }
  if (parts.length === 0) return 'Showing everything.';
  return (
    <>
      <strong>Showing</strong> {parts.join(' · ')}
    </>
  );
}
