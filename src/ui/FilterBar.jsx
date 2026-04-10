/**
 * FilterBar — schema-driven filter controls.
 *
 * Renders one pill group per multi-select field in the schema, a text search
 * input for text fields, a saved-views dropdown, and a clear-all button.
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
 *
 * Saved views props (optional):
 *   savedViews    — SavedView[]
 *   onSaveView    — (name) => void
 *   onLoadView    — (id) => void
 *   onDeleteView  — (id) => void
 */
import { useState, useEffect, useRef } from 'react';
import { Search, X, Bookmark, Trash2, Plus } from 'lucide-react';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema.js';
import { isEmptyFilterValue } from '../filters/filterState.js';
import styles from './FilterBar.module.css';

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

  // Saved views
  savedViews   = [],
  onSaveView   = () => {},
  onLoadView   = () => {},
  onDeleteView = () => {},
}) {
  const [viewsOpen,  setViewsOpen]  = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [viewName,   setViewName]   = useState('');
  const viewsRef = useRef(null);
  const inputRef = useRef(null);

  // Close views dropdown on outside click
  useEffect(() => {
    if (!viewsOpen) return;
    function handleClick(e) {
      if (viewsRef.current && !viewsRef.current.contains(e.target)) {
        setViewsOpen(false);
        setSavingView(false);
        setViewName('');
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [viewsOpen]);

  useEffect(() => {
    if (savingView && inputRef.current) inputRef.current.focus();
  }, [savingView]);

  function handleSave() {
    const name = viewName.trim();
    if (!name) return;
    onSaveView(name);
    setViewName('');
    setSavingView(false);
    setViewsOpen(false);
  }

  // Toggle a value inside a multi-select filter field
  function handleToggle(fieldKey, value) {
    const current = filters[fieldKey];
    const next = current instanceof Set ? new Set(current) : new Set();
    next.has(value) ? next.delete(value) : next.add(value);
    onChange?.(fieldKey, next);
  }

  const hasActiveFilters = schema.some(field => !isEmptyFilterValue(filters[field.key]));

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

      {/* ── Views dropdown ── */}
      <div style={{ position: 'relative' }} ref={viewsRef}>
        <button
          className={styles.viewsBtn}
          onClick={e => { e.stopPropagation(); setViewsOpen(o => !o); }}
          aria-label="Saved views"
        >
          <Bookmark size={13} />
          Views
          {savedViews.length > 0 && (
            <span className={styles.viewsBadge}>{savedViews.length}</span>
          )}
        </button>

        {viewsOpen && (
          <div className={styles.viewsDropdown} onClick={e => e.stopPropagation()}>
            {savedViews.length === 0 && !savingView && (
              <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--wc-text-faint)' }}>
                No saved views yet.
              </div>
            )}

            {savedViews.map(view => (
              <div key={view.id} className={styles.viewRow}>
                <button
                  className={styles.viewName}
                  onClick={() => { onLoadView(view.id); setViewsOpen(false); }}
                  title={view.name}
                >
                  {view.name}
                </button>
                <button
                  className={styles.viewDeleteBtn}
                  onClick={() => onDeleteView(view.id)}
                  aria-label={`Delete view ${view.name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {savedViews.length > 0 && <div className={styles.viewsDivider} />}

            {savingView ? (
              <div style={{ padding: '4px 6px', display: 'flex', gap: 6 }}>
                <input
                  ref={inputRef}
                  value={viewName}
                  onChange={e => setViewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') { setSavingView(false); setViewName(''); }
                  }}
                  placeholder="View name…"
                  className={styles.saveViewInput}
                />
                <button
                  onClick={handleSave}
                  disabled={!viewName.trim()}
                  style={{
                    padding: '5px 10px', fontSize: 12, fontWeight: 600,
                    background: 'var(--wc-accent)', color: '#fff',
                    border: 'none', borderRadius: 6, cursor: viewName.trim() ? 'pointer' : 'not-allowed',
                    opacity: viewName.trim() ? 1 : 0.5, flexShrink: 0,
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                className={styles.saveViewBtn}
                onClick={() => setSavingView(true)}
              >
                <Plus size={12} /> Save current view…
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Clear all ── */}
      {hasActiveFilters && (
        <button className={styles.clearAll} onClick={onClearAll}>
          Clear filters
        </button>
      )}
    </div>
  );
}
