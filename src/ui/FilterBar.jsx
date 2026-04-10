import { useState, useEffect, useRef } from 'react';
import { Search, X, Bookmark, Trash2, Plus } from 'lucide-react';
import styles from './FilterBar.module.css';

export default function FilterBar({
  categories, resources,
  filters,
  onToggleCategory, onToggleResource,
  onSearch, onClear,
  // Source filter props (optional)
  sources        = [],
  filterSources,
  onToggleSource = () => {},
  // Saved views props (optional)
  savedViews     = [],
  onSaveView     = () => {},
  onLoadView     = () => {},
  onDeleteView   = () => {},
}) {
  const activeSources = filterSources ?? filters.sources ?? new Set();

  const hasActiveFilters =
    filters.categories.size > 0 ||
    filters.resources.size > 0 ||
    activeSources.size > 0 ||
    (filters.search && filters.search.trim());

  // ── Views dropdown state ────────────────────────────────────────
  const [viewsOpen,    setViewsOpen]    = useState(false);
  const [savingView,   setSavingView]   = useState(false);
  const [viewName,     setViewName]     = useState('');
  const viewsRef   = useRef(null);
  const inputRef   = useRef(null);

  // Close on outside click
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

  // Auto-focus the save input when it appears
  useEffect(() => {
    if (savingView && inputRef.current) {
      inputRef.current.focus();
    }
  }, [savingView]);

  function handleSave() {
    const name = viewName.trim();
    if (!name) return;
    onSaveView(name);
    setViewName('');
    setSavingView(false);
    setViewsOpen(false);
  }

  function handleViewInputKeyDown(e) {
    if (e.key === 'Enter') { handleSave(); }
    if (e.key === 'Escape') { setSavingView(false); setViewName(''); }
  }

  // ── Truncate source label ───────────────────────────────────────
  function truncate(str, max = 20) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  return (
    <div className={styles.bar}>
      {/* Source pills */}
      {sources.filter(s => s.label).length > 0 && (
        <div className={styles.pillGroup}>
          {sources.filter(s => s.label).map(source => {
            const isActive = activeSources.has(source.id);
            return (
              <button
                key={source.id}
                className={[
                  styles.sourcePill,
                  isActive && styles.active,
                ].filter(Boolean).join(' ')}
                style={isActive
                  ? { background: source.color, borderColor: source.color }
                  : undefined}
                onClick={() => onToggleSource(source.id)}
                title={source.label}
                {...(!source.enabled && { style: { ...(isActive ? { background: source.color, borderColor: source.color } : {}), opacity: 0.5 } })}
              >
                <span
                  className={styles.sourceDot}
                  style={{ background: source.color }}
                />
                <span className={styles.sourceLabel}>{truncate(source.label)}</span>
                <span className={styles.sourceType}>{source.type}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Category pills */}
      {categories.length > 0 && (
        <div className={styles.pillGroup}>
          {categories.map(cat => (
            <button
              key={cat}
              className={[styles.pill, filters.categories.has(cat) && styles.active].filter(Boolean).join(' ')}
              onClick={() => onToggleCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Resource pills */}
      {resources.length > 0 && (
        <div className={styles.pillGroup}>
          {resources.map(res => (
            <button
              key={res}
              className={[styles.pill, styles.resource, filters.resources.has(res) && styles.active].filter(Boolean).join(' ')}
              onClick={() => onToggleResource(res)}
            >
              {res}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className={styles.searchWrap}>
        <Search size={14} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.search}
          placeholder="Search events…"
          value={filters.search || ''}
          onChange={e => onSearch(e.target.value)}
        />
        {filters.search && (
          <button className={styles.clearSearch} onClick={() => onSearch('')} aria-label="Clear search">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Views dropdown */}
      <div style={{ position: 'relative' }} ref={viewsRef}>
        <button
          className={styles.viewsBtn}
          onClick={(e) => { e.stopPropagation(); setViewsOpen(o => !o); }}
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
                  aria-label={`Delete view "${view.name}"`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {savedViews.length > 0 && <div className={styles.viewsDivider} />}

            {savingView ? (
              <div style={{ padding: '4px 6px' }}>
                <input
                  ref={inputRef}
                  className={styles.saveViewInput}
                  placeholder="View name…"
                  value={viewName}
                  onChange={e => setViewName(e.target.value)}
                  onKeyDown={handleViewInputKeyDown}
                />
                <button
                  className={styles.saveViewBtn}
                  onClick={handleSave}
                  style={{ marginTop: 4 }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                className={styles.saveViewBtn}
                onClick={() => setSavingView(true)}
              >
                <Plus size={12} />
                Save current view…
              </button>
            )}
          </div>
        )}
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button className={styles.clearAll} onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
