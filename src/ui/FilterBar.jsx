/**
 * FilterBar — schema-driven filter controls.
 *
 * Renders one pill group per multi-select field in the schema, a text search
 * input for text fields, active filter pills, and renderers for select,
 * boolean, and date-range field types.
 *
 * New (schema-driven) props:
 *   schema        — FilterField[]          from filterSchema.ts
 *   items         — CalendarEvent[]        used by field.getOptions()
 *   onChange      — (key, value) => void   generic field setter
 *   onClear       — (key) => void          clear one field
 *   onClearAll    — () => void             clear everything
 *
 * Source-store props (optional, for colored source pills):
 *   sources       — CalendarSource[]       full list from useSourceStore
 */
import { Search, X } from 'lucide-react';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema.js';
import { isEmptyFilterValue, buildActiveFilterPills } from '../filters/filterState.js';
import styles from './FilterBar.module.css';

// ── Helper ────────────────────────────────────────────────────────────────────

function formatDateInput(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

// ── Source pill (colored dot + label + type badge) ────────────────────────────

function SourcePill({ label, color, type, enabled = true, active, onClick }) {
  const truncated = label && label.length > 20 ? label.slice(0, 19) + '…' : label;
  return (
    <button
      className={[styles.sourcePill, active && styles.active].filter(Boolean).join(' ')}
      style={{
        ...(active ? { background: color, borderColor: color } : {}),
        ...(!enabled ? { opacity: 0.5 } : {}),
      }}
      onClick={onClick}
      title={label}
    >
      <span className={styles.sourceDot} style={{ background: color }} />
      <span className={styles.sourceLabel}>{truncated}</span>
      {type && <span className={styles.sourceType}>{type}</span>}
    </button>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

export default function FilterBar({
  // Schema-driven interface
  schema       = DEFAULT_FILTER_SCHEMA,
  filters      = {},
  items        = [],
  onChange,
  onClear,
  onClearAll,

  // Source store data (for color dots and enabled state on source pills)
  sources      = [],

  // Pill hover title toggle (shows large floating title on pill hover in month view)
  pillHoverTitle         = false,
  onPillHoverTitleToggle = undefined,
}) {
  // Toggle a value inside a multi-select filter field
  function handleToggle(fieldKey, value) {
    const current = filters[fieldKey];
    const next = current instanceof Set ? new Set(current) : new Set();
    next.has(value) ? next.delete(value) : next.add(value);
    onChange?.(fieldKey, next);
  }

  const hasActiveFilters = schema.some(field => !isEmptyFilterValue(filters[field.key]));

  // All active filter values as removable pills.
  // date-range and text fields are already skipped inside buildActiveFilterPills
  // because they have their own inline controls with clear buttons.
  const activePills = buildActiveFilterPills(filters, schema);

  return (
    <div className={styles.bar}>
      {/* ── Multi-select pill groups (one per schema field) ── */}
      {schema.map(field => {
        if (field.type !== 'multi-select') return null;

        // Evaluate hidden flag
        if (typeof field.hidden === 'function') {
          if (field.hidden({ items, filters })) return null;
        } else if (field.hidden) {
          return null;
        }

        // Compute options
        const options = field.getOptions
          ? field.getOptions(items)
          : (field.options ?? []);
        if (!options.length) return null;

        const activeValues = filters[field.key] ?? new Set();
        const isSourceField = field.key === 'sources';

        return (
          <div key={field.key} className={styles.pillGroup}>
            {options.map(opt => {
              const active = activeValues instanceof Set
                ? activeValues.has(opt.value)
                : (activeValues ?? []).includes(opt.value);

              if (isSourceField) {
                // Source pills get color dots from the source store
                const src = sources.find(s => s.id === opt.value);
                return (
                  <SourcePill
                    key={String(opt.value)}
                    label={opt.label}
                    color={src?.color ?? opt.color ?? '#3b82f6'}
                    type={src?.type}
                    enabled={src?.enabled !== false}
                    active={active}
                    onClick={() => handleToggle(field.key, opt.value)}
                  />
                );
              }

              return (
                <button
                  key={String(opt.value)}
                  className={[
                    styles.pill,
                    field.key === 'resources' && styles.resource,
                    active && styles.active,
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleToggle(field.key, opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        );
      })}

      {/* ── Active filter pills (for select, boolean, etc.) ── */}
      {activePills.length > 0 && (
        <div className={styles.activePills}>
          {activePills.map((pill, i) => (
            <span key={`${pill.key}-${i}`} className={styles.activePill}>
              {pill.fieldLabel}: {pill.displayValue ?? pill.value}
              <button
                className={styles.pillRemove}
                onClick={() => onClear?.(pill.key)}
                aria-label={`Remove filter ${pill.fieldLabel}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Text / search inputs ── */}
      {schema
        .filter(field => field.type === 'text' && !field.hidden)
        .map(field => {
          const value = filters[field.key] ?? '';
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
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

      {/* ── Select inputs ── */}
      {schema.filter(f => f.type === 'select' && !f.hidden).map(field => {
        const options = field.getOptions ? field.getOptions(items) : (field.options ?? []);
        const value = filters[field.key] ?? '';
        return (
          <select key={field.key} className={styles.selectInput}
            value={value}
            onChange={e => onChange?.(field.key, e.target.value || null)}>
            <option value="">{field.placeholder ?? `All ${field.label ?? field.key}`}</option>
            {options.map(opt => (
              <option key={String(opt.value)} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      })}

      {/* ── Boolean (checkbox) fields ── */}
      {schema.filter(f => f.type === 'boolean' && !f.hidden).map(field => {
        const value = filters[field.key];
        return (
          <label key={field.key} className={styles.boolLabel}>
            <input type="checkbox" className={styles.boolCheck}
              checked={Boolean(value)}
              onChange={e => onChange?.(field.key, e.target.checked || null)}
            />
            {field.label ?? field.key}
          </label>
        );
      })}

      {/* ── Date range fields ── */}
      {schema.filter(f => f.type === 'date-range' && !f.hidden).map(field => {
        const range = filters[field.key];
        const startVal = range?.start ? formatDateInput(range.start) : '';
        const endVal   = range?.end   ? formatDateInput(range.end)   : '';
        return (
          <div key={field.key} className={styles.dateRange}>
            <input type="date" className={styles.dateInput} value={startVal}
              aria-label={`${field.label ?? 'Date'} from`}
              onChange={e => {
                const d = e.target.value ? new Date(e.target.value + 'T00:00:00') : null;
                onChange?.(field.key, d || range?.end ? { start: d, end: range?.end ?? null } : null);
              }}
            />
            <span className={styles.dateSep}>–</span>
            <input type="date" className={styles.dateInput} value={endVal}
              aria-label={`${field.label ?? 'Date'} to`}
              onChange={e => {
                const d = e.target.value ? new Date(e.target.value + 'T23:59:59') : null;
                onChange?.(field.key, d || range?.start ? { start: range?.start ?? null, end: d } : null);
              }}
            />
            {(startVal || endVal) && (
              <button className={styles.clearSearch} onClick={() => onChange?.(field.key, null)} aria-label="Clear date range">
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      {/* ── Clear all ── */}
      {hasActiveFilters && (
        <button className={styles.clearAll} onClick={onClearAll}>
          Clear filters
        </button>
      )}

      {/* ── Aa pill hover-title toggle ── */}
      {onPillHoverTitleToggle && (
        <button
          className={[styles.hoverToggle, pillHoverTitle && styles.hoverToggleActive].filter(Boolean).join(' ')}
          onClick={onPillHoverTitleToggle}
          aria-pressed={pillHoverTitle}
          title={pillHoverTitle ? 'Disable hover details projection' : 'Project date, category, resource, and notes when hovering events'}
        >
          Aa
        </button>
      )}
    </div>
  );
}
