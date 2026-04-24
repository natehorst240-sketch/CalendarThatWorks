/**
 * GroupsPanel — Notion-style "Group by" field picker with color swatches.
 *
 * Displays up to 3 nesting levels. Each level lets the user pick a field
 * from the filter schema (or event.meta keys), see discovered group values
 * with auto-assigned color swatches, and toggle "Show empty groups."
 */
import { useMemo } from 'react';
import { Plus, X, Layers } from 'lucide-react';
import SortControls from './SortControls';
import type { SortConfig } from '../types/grouping';
import type { FilterField } from '../filters/filterSchema';
import styles from './GroupsPanel.module.css';

const MAX_LEVELS = 3;

// Issue #268 relabels the grouping builder so owners understand it as a
// hierarchy, not a numeric stack. Level 1 is the "Primary View" (root),
// 2+ are "Secondary"/"Tertiary".
const LEVEL_LABELS = ['Primary View', 'Secondary', 'Tertiary'];

const GROUP_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

export type GroupLevel = {
  field: string;
  showEmpty?: boolean;
};

export type GroupsPanelProps = {
  /** Current group-by levels (plain field strings or objects). */
  levels: GroupLevel[];
  /** Called when levels change. */
  onLevelsChange: (levels: GroupLevel[]) => void;
  /** Current sort config. */
  sort: SortConfig[];
  /** Called when sort changes. */
  onSortChange: (sort: SortConfig[]) => void;
  /** Schema fields available for grouping. */
  schema: FilterField[];
  /** Show-all-groups toggle state. */
  showAllGroups: boolean;
  /** Called when showAllGroups changes. */
  onShowAllGroupsChange: (show: boolean) => void;
};

/** Derive groupable fields from schema: multi-select and select types,
 *  minus any field that explicitly opts out via `groupable: false`. */
function getGroupableFields(schema: FilterField[]) {
  return schema.filter(
    f => (f.type === 'multi-select' || f.type === 'select' || f.type === 'text')
      && f.groupable !== false,
  );
}

/** Sort-field entries derived from groupable fields. */
function toSortFields(schema: FilterField[]) {
  const base = [
    { key: 'start', label: 'Start date' },
    { key: 'title', label: 'Title' },
  ];
  const fromSchema = getGroupableFields(schema).map(f => ({
    key: f.key,
    label: f.label,
  }));
  return [...base, ...fromSchema];
}

export default function GroupsPanel({
  levels,
  onLevelsChange,
  sort,
  onSortChange,
  schema,
  showAllGroups,
  onShowAllGroupsChange,
}: GroupsPanelProps) {
  const groupableFields = useMemo(() => getGroupableFields(schema), [schema]);
  const sortFields = useMemo(() => toSortFields(schema), [schema]);

  const addLevel = () => {
    if (levels.length >= MAX_LEVELS || groupableFields.length === 0) return;
    // Pick first field not already used, or fallback to first
    const usedFields = new Set(levels.map(l => l.field));
    const nextField = groupableFields.find(f => !usedFields.has(f.key))
      ?? groupableFields[0];
    if (nextField === undefined) return;
    onLevelsChange([...levels, { field: nextField.key, showEmpty: false }]);
  };

  const removeLevel = (index: number) => {
    onLevelsChange(levels.filter((_, i) => i !== index));
  };

  const updateLevel = (index: number, patch: Partial<GroupLevel>) => {
    onLevelsChange(levels.map((l, i) => i === index ? { ...l, ...patch } : l));
  };

  return (
    <div className={styles['root']}>
      {levels.length === 0 && (
        <div className={styles['empty']}>
          <Layers size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
          <div>No grouping applied</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Add a level to group events by field</div>
        </div>
      )}

      {levels.map((level, index) => {
        const fieldDef = groupableFields.find(f => f.key === level.field);
        return (
          <div key={index} className={styles['levelCard']}>
            <div className={styles['levelHeader']}>
              <span className={styles['levelLabel']}>{LEVEL_LABELS[index] ?? `Level ${index + 1}`}</span>
              <select
                className={styles['fieldSelect']}
                value={level.field}
                onChange={e => updateLevel(index, { field: e.target.value })}
                aria-label={`Group by field level ${index + 1}`}
              >
                {groupableFields.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <button
                className={styles['removeBtn']}
                onClick={() => removeLevel(index)}
                aria-label={`Remove grouping level ${index + 1}`}
              >
                <X size={14} />
              </button>
            </div>

            {/* Color swatch preview — shows palette colors for this field */}
            <div className={styles['swatches']}>
              {GROUP_PALETTE.map((color, ci) => (
                <div
                  key={ci}
                  className={styles['swatch']}
                  style={{ background: color }}
                  title={`Group color ${ci + 1}`}
                />
              ))}
            </div>

            <div className={styles['toggleRow']}>
              <button
                className={[styles['toggle'], level.showEmpty ? styles['on'] : ''].filter(Boolean).join(' ')}
                onClick={() => updateLevel(index, { showEmpty: !level.showEmpty })}
                role="switch"
                aria-checked={!!level.showEmpty}
                aria-label="Show empty groups"
              />
              <span>Show empty groups</span>
            </div>
          </div>
        );
      })}

      <button
        className={styles['addBtn']}
        onClick={addLevel}
        disabled={levels.length >= MAX_LEVELS || groupableFields.length === 0}
        aria-label={levels.length === 0 ? 'Add primary grouping' : 'Add secondary grouping'}
      >
        <Plus size={14} />
        {levels.length === 0 ? 'Add primary grouping' : 'Add secondary grouping'}
        {levels.length >= MAX_LEVELS && <span> (max {MAX_LEVELS})</span>}
      </button>

      {/* Show all groups toggle (global) */}
      {levels.length > 0 && (
        <div className={styles['toggleRow']} style={{ paddingTop: 4 }}>
          <button
            className={[styles['toggle'], showAllGroups ? styles['on'] : ''].filter(Boolean).join(' ')}
            onClick={() => onShowAllGroupsChange(!showAllGroups)}
            role="switch"
            aria-checked={showAllGroups}
            aria-label="Show all groups"
          />
          <span>Show all groups (including empty)</span>
        </div>
      )}

      {/* Sort controls */}
      <div className={styles['sortSection']}>
        <SortControls
          value={sort}
          onChange={onSortChange}
          fields={sortFields}
          maxSorts={3}
          label="Sort by"
        />
      </div>
    </div>
  );
}
