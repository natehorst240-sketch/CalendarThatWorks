/**
 * FilterBar — schema-driven filter controls with grouped dropdown menus.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import type { FilterField, FilterOption } from '../filters/filterSchema';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema';
import { buildActiveFilterPills, clearFilterValue, hasActiveFilters as computeHasActiveFilters } from '../filters/filterState';
import styles from './FilterBar.module.css';

type FilterBarProps = {
  schema?: FilterField[];
  filters?: Record<string, unknown>;
  items?: unknown[];
  onChange?: (fieldKey: string, value: unknown) => void;
  onClear?: (fieldKey: string) => void;
  onClearAll?: () => void;
  sources?: Array<{ id: string | number; color?: string; type?: string }>;
  groupLabels?: Partial<Record<'categories' | 'resources' | 'sources' | 'more', string>>;
  pillHoverTitle?: boolean;
  onPillHoverTitleToggle?: ((nextValue: boolean) => void) | undefined;
}

type DateRangeValue = { start?: Date | string | null; end?: Date | string | null } | null;
type GroupKey = 'categories' | 'resources' | 'sources' | 'more';
type GroupedFields = Record<GroupKey, FilterField[]>;

function formatDateInput(date: unknown) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date as string | number);
  return d.toISOString().slice(0, 10);
}

function getGroupKey(fieldKey: string): GroupKey {
  if (fieldKey === 'categories') return 'categories';
  if (fieldKey === 'resources') return 'resources';
  if (fieldKey === 'sources') return 'sources';
  return 'more';
}

const DEFAULT_GROUP_LABELS = {
  categories: 'Categories',
  resources: 'People',
  sources: 'Sources',
  more: 'More',
};

export default function FilterBar({
  schema = DEFAULT_FILTER_SCHEMA,
  filters = {},
  items = [],
  onChange,
  onClear,
  onClearAll,
  sources = [],
  groupLabels = {},
  pillHoverTitle = false,
  onPillHoverTitleToggle = undefined,
}: FilterBarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function handleToggle(fieldKey: string, value: unknown) {
    const current = filters[fieldKey];
    const next = current instanceof Set ? new Set(current) : new Set();
    next.has(value) ? next.delete(value) : next.add(value);
    onChange?.(fieldKey, next);
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const currentRef = openGroup ? dropdownRefs.current[openGroup] : null;
      if (currentRef && e.target instanceof Node && !currentRef.contains(e.target)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openGroup]);

  const visibleMultiSelectFields = useMemo(() => {
    return schema.filter((field) => {
      if (field.type !== 'multi-select') return false;

      if (typeof field.hidden === 'function') {
        if (field.hidden({ items, filters })) return false;
      } else if (field.hidden) {
        return false;
      }

      const options = field.getOptions ? field.getOptions(items) : (field.options ?? []);
      return options.length > 0;
    });
  }, [schema, items, filters]);

  const groupedFields = useMemo<GroupedFields>(() => {
    const groups: GroupedFields = {
      categories: [],
      resources: [],
      sources: [],
      more: [],
    };

    for (const field of visibleMultiSelectFields) {
      groups[getGroupKey(field.key)].push(field);
    }

    return groups;
  }, [visibleMultiSelectFields]);

  const mergedGroupLabels = {
    ...DEFAULT_GROUP_LABELS,
    ...(groupLabels ?? {}),
  };

  const hasActiveFilters = computeHasActiveFilters(filters, schema);
  const activePills = buildActiveFilterPills(filters, schema);

  function selectedCountForGroup(groupKey: GroupKey) {
    return groupedFields[groupKey].reduce((count, field) => {
      const value = filters[field.key];
      if (value instanceof Set) return count + value.size;
      if (Array.isArray(value)) return count + value.length;
      return count;
    }, 0);
  }

  function renderOption(field: FilterField, opt: FilterOption) {
    const activeValues = filters[field.key] ?? new Set();
    const active = activeValues instanceof Set
      ? activeValues.has(opt.value)
      : (Array.isArray(activeValues) ? activeValues : []).includes(opt.value);

    const isSourceField = field.key === 'sources';
    const src = isSourceField ? sources.find(s => s.id === opt.value) : null;

    return (
      <button
        key={`${field.key}-${String(opt.value)}`}
        className={[styles.optionRow, active && styles.optionRowActive].filter(Boolean).join(' ')}
        onClick={() => handleToggle(field.key, opt.value)}
        type="button"
      >
        <span className={styles.optionCheck}>{active ? '✓' : ''}</span>

        {isSourceField && (
          <span
            className={styles.sourceDot}
            style={{ background: src?.color ?? opt.color ?? '#3b82f6' }}
          />
        )}

        <span className={styles.optionLabel}>{opt.label}</span>

        {isSourceField && src?.type && (
          <span className={styles.optionMeta}>{src.type}</span>
        )}
      </button>
    );
  }

  return (
    <div className={styles.bar}>
      {Object.entries(groupedFields).map(([groupKey, fields]) => {
        if (!fields.length) return null;
        const typedGroupKey = groupKey as GroupKey;
        const count = selectedCountForGroup(typedGroupKey);

        return (
          <div
            key={groupKey}
            className={styles.dropdownWrap}
            ref={el => { dropdownRefs.current[groupKey] = el; }}
          >
            <button
              type="button"
              className={[styles.dropdownBtn, openGroup === groupKey && styles.dropdownBtnOpen].filter(Boolean).join(' ')}
              onClick={() => setOpenGroup(openGroup === groupKey ? null : groupKey)}
            >
              <span>{mergedGroupLabels[typedGroupKey] ?? DEFAULT_GROUP_LABELS[typedGroupKey] ?? typedGroupKey}</span>
              {count > 0 && <span className={styles.countBadge}>{count}</span>}
              <span className={styles.chevronIcon}><ChevronDown size={14} /></span>
            </button>

            {openGroup === groupKey && (
              <div className={styles.dropdownMenu}>
                {fields.map(field => {
                  const options = field.getOptions ? field.getOptions(items) : (field.options ?? []);
                  if (!options.length) return null;

                  return (
                    <div key={field.key} className={styles.menuSection}>
                      <div className={styles.menuHead}>{field.label ?? field.key}</div>
                      <div className={styles.menuOptions}>
                        {options.map((opt) => renderOption(field, opt))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {schema
        .filter(field => field.type === 'text' && !field.hidden)
        .map(field => {
          const value = (filters[field.key] ?? '') as string;
          return (
            <div key={field.key} className={styles.searchWrap}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.search}
                placeholder={field.placeholder ?? 'Search…'}
                value={value}
                onChange={e => onChange?.(field.key, e.target.value)}
              />
              {value && (
                <button
                  className={styles.clearSearch}
                  onClick={() => onChange?.(field.key, '')}
                  aria-label="Clear search"
                  type="button"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

      {schema.filter((f) => f.type === 'select' && !f.hidden).map(field => {
        const options = field.getOptions ? field.getOptions(items) : (field.options ?? []);
        const value = (filters[field.key] ?? '') as string | number;
        return (
          <select
            key={field.key}
            className={styles.selectInput}
            value={value}
            onChange={e => onChange?.(field.key, e.target.value || null)}
          >
            <option value="">{field.placeholder ?? `All ${field.label ?? field.key}`}</option>
            {options.map(opt => (
              <option key={String(opt.value)} value={opt.value as string | number | readonly string[]}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      })}

      {schema.filter((f) => f.type === 'boolean' && !f.hidden).map(field => {
        const value = filters[field.key];
        return (
          <label
            key={field.key}
            className={[styles.boolLabel, value && styles.boolLabelActive].filter(Boolean).join(' ')}
          >
            <input
              type="checkbox"
              className={styles.boolCheck}
              checked={Boolean(value)}
              onChange={e => onChange?.(field.key, e.target.checked || null)}
            />
            {field.label ?? field.key}
          </label>
        );
      })}

      {schema.filter((f) => f.type === 'date-range' && !f.hidden).map(field => {
        const range = (filters[field.key] ?? null) as DateRangeValue;
        const startVal = range?.start ? formatDateInput(range.start) : '';
        const endVal   = range?.end   ? formatDateInput(range.end)   : '';

        return (
          <div key={field.key} className={styles.dateRange}>
            <span className={styles.fieldLabel}>{field.label ?? 'Date'}</span>
            <input
              type="date"
              className={styles.dateInput}
              value={startVal}
              aria-label={`${field.label ?? 'Date'} from`}
              onChange={e => {
                const d = e.target.value ? new Date(e.target.value + 'T00:00:00') : null;
                onChange?.(field.key, d || range?.end ? { start: d, end: range?.end ?? null } : null);
              }}
            />
            <span className={styles.dateSep}>–</span>
            <input
              type="date"
              className={styles.dateInput}
              value={endVal}
              aria-label={`${field.label ?? 'Date'} to`}
              onChange={e => {
                const d = e.target.value ? new Date(e.target.value + 'T23:59:59') : null;
                onChange?.(field.key, d || range?.start ? { start: range?.start ?? null, end: d } : null);
              }}
            />
            {(startVal || endVal) && (
              <button
                className={styles.dateClear}
                onClick={() => onChange?.(field.key, null)}
                aria-label="Clear date range"
                type="button"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      {hasActiveFilters && (
        <button className={styles.clearAll} onClick={onClearAll} type="button">
          Clear filters
        </button>
      )}

      {activePills.length > 0 && (
        <div className={styles.activePills}>
          {activePills.map((pill, i) => {
            const schemaField = schema.find(f => f.key === pill.key);
            return (
              <span key={`${pill.key}-${i}`} className={styles.activePill}>
                {pill.fieldLabel}: {pill.displayValue ?? String(pill.value)}
                <button
                  className={styles.pillRemove}
                  onClick={() => {
                    const current = filters[pill.key];
                    if (current instanceof Set) {
                      const next = new Set(current);
                      next.delete(pill.value);
                      onChange?.(pill.key, next.size ? next : clearFilterValue(schemaField));
                    } else {
                      onClear?.(pill.key);
                    }
                  }}
                  aria-label={`Remove filter ${pill.fieldLabel}`}
                  type="button"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {onPillHoverTitleToggle && (
        <button
          className={[styles.hoverToggle, pillHoverTitle && styles.hoverToggleActive].filter(Boolean).join(' ')}
          onClick={() => onPillHoverTitleToggle(!pillHoverTitle)}
          aria-pressed={pillHoverTitle}
          title={pillHoverTitle ? 'Disable hover details projection' : 'Project date, category, resource, and notes when hovering events'}
          type="button"
        >
          Aa
        </button>
      )}
    </div>
  );
}
