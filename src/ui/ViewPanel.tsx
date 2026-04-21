/**
 * ViewPanel — top-level "View" picker for the sidebar.
 *
 * Issue #268 rewrites the sidebar's first tab from a raw grouping builder
 * ("Level 1", "Add grouping level") into a perspective picker. The user
 * chooses a ready-made operational view (By Base, Dispatch, Mission Timeline,
 * …) and the calendar sets the corresponding grouping behind the scenes.
 *
 * The original freeform builder is still available under an "Advanced"
 * disclosure so power users can still compose nested group-by levels.
 */
import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Layers, Radio, Wrench, Users, Plane, Route } from 'lucide-react';
import GroupsPanel from './GroupsPanel';
import type { GroupLevel } from './GroupsPanel';
import type { SortConfig } from '../types/grouping';
import type { FilterField } from '../filters/filterSchema';
import styles from './ViewPanel.module.css';

/**
 * Preset definitions. Each preset describes a set of grouping levels that the
 * sidebar will apply on click. Presets intentionally reference generic fields
 * (category, resource, base, region, mission) — the calendar skips unknown
 * field keys gracefully via useGrouping's meta lookup, so a calendar that
 * lacks one of these fields still renders, just with fewer nested levels.
 */
type ViewPreset = {
  id: string;
  label: string;
  description: string;
  icon: typeof Layers;
  levels: GroupLevel[];
};

const PRESETS: ViewPreset[] = [
  {
    id: 'by-base',
    label: 'By Base',
    description: 'Region → Base rollups. The default operational layout.',
    icon: Layers,
    levels: [
      { field: 'region', showEmpty: false },
      { field: 'base', showEmpty: false },
    ],
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    description: 'Crew rows grouped by resource, focused on dispatch shifts.',
    icon: Radio,
    levels: [{ field: 'resource', showEmpty: false }],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Assets first, then category — see coverage at a glance.',
    icon: Wrench,
    levels: [
      { field: 'resource', showEmpty: true },
      { field: 'category', showEmpty: false },
    ],
  },
  {
    id: 'crew',
    label: 'Crew',
    description: 'One row per person — shifts, on-call, PTO side by side.',
    icon: Users,
    levels: [{ field: 'resource', showEmpty: false }],
  },
  {
    id: 'aircraft',
    label: 'Aircraft',
    description: 'Group by aircraft resource to read fleet utilization.',
    icon: Plane,
    levels: [{ field: 'resource', showEmpty: false }],
  },
  {
    id: 'mission-timeline',
    label: 'Mission Timeline',
    description: 'Mission → leg → crew for multi-leg transfer missions.',
    icon: Route,
    levels: [
      { field: 'mission', showEmpty: false },
      { field: 'category', showEmpty: false },
    ],
  },
];

function levelsMatch(a: GroupLevel[], b: GroupLevel[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].field !== b[i].field) return false;
  }
  return true;
}

export type ViewPanelProps = {
  levels: GroupLevel[];
  onLevelsChange: (levels: GroupLevel[]) => void;
  sort: SortConfig[];
  onSortChange: (sort: SortConfig[]) => void;
  schema: FilterField[];
  showAllGroups: boolean;
  onShowAllGroupsChange: (show: boolean) => void;
};

export default function ViewPanel(props: ViewPanelProps) {
  const { levels, onLevelsChange } = props;
  const [advancedOpen, setAdvancedOpen] = useState(() => levels.length > 0 && !matchesAnyPreset(levels));

  const activePresetId = useMemo(() => {
    const hit = PRESETS.find(p => levelsMatch(p.levels, levels));
    return hit?.id ?? null;
  }, [levels]);

  return (
    <div className={styles.root}>
      <div className={styles.introRow}>
        <span className={styles.introLabel}>Pick a perspective</span>
        <span className={styles.introHint}>
          One click sets the grouping. Fine-tune in Advanced.
        </span>
      </div>

      <div className={styles.grid}>
        {PRESETS.map(preset => {
          const Icon = preset.icon;
          const selected = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={[styles.card, selected && styles.cardSelected].filter(Boolean).join(' ')}
              onClick={() => onLevelsChange(preset.levels)}
              aria-pressed={selected}
              title={preset.description}
            >
              <span className={styles.cardIcon}><Icon size={14} aria-hidden="true" /></span>
              <span className={styles.cardLabel}>{preset.label}</span>
              {selected && <span className={styles.cardCheck}><Check size={12} aria-hidden="true" /></span>}
              <span className={styles.cardDesc}>{preset.description}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.advancedToggle}
        onClick={() => setAdvancedOpen(v => !v)}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Advanced (custom grouping)
      </button>

      {advancedOpen && (
        <div className={styles.advancedBody}>
          <GroupsPanel {...props} />
        </div>
      )}
    </div>
  );
}

function matchesAnyPreset(levels: GroupLevel[]): boolean {
  return PRESETS.some(p => levelsMatch(p.levels, levels));
}
