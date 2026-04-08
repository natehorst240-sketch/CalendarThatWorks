/**
 * ProfileBar.jsx — Saved-view profile chips with add/rename/delete/resave.
 */
import { useState, useRef, useEffect } from 'react';
import { Plus, Bookmark, BookmarkCheck, Pencil, Trash2, RefreshCw, Check, X } from 'lucide-react';
import { PROFILE_COLORS } from '../core/profileStore.js';
import styles from './ProfileBar.module.css';

export default function ProfileBar({
  profiles,
  activeProfile,
  activeId,
  isDirty,
  categories,
  resources,
  onApply,
  onAdd,
  onResave,
  onUpdate,
  onDelete,
}) {
  const [saveOpen,    setSaveOpen]    = useState(false);
  const [manageId,    setManageId]    = useState(null); // which profile is being managed
  const scrollRef = useRef(null);

  if (profiles.length === 0 && !saveOpen) {
    // Collapsed state — just a small "Save view" prompt
    return (
      <div className={styles.collapsed}>
        <button className={styles.saveHint} onClick={() => setSaveOpen(true)}>
          <Bookmark size={13} />
          Save current view as a profile…
        </button>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      {/* Profile chip strip */}
      <div className={styles.strip} ref={scrollRef}>
        {profiles.map(p => (
          <ProfileChip
            key={p.id}
            profile={p}
            isActive={p.id === activeId}
            isDirty={isDirty && p.id === activeId}
            isManaging={manageId === p.id}
            onApply={() => { onApply(p); setManageId(null); setSaveOpen(false); }}
            onManageToggle={() => setManageId(manageId === p.id ? null : p.id)}
            onResave={() => { onResave(p.id); setManageId(null); }}
            onDelete={() => { onDelete(p.id); setManageId(null); }}
            onRename={(name) => { onUpdate(p.id, { name }); setManageId(null); }}
            onColorChange={(color) => onUpdate(p.id, { color })}
            categories={categories}
            resources={resources}
          />
        ))}

        {/* Add button (inline in strip when profiles exist) */}
        {!saveOpen && (
          <button className={styles.addChip} onClick={() => { setSaveOpen(true); setManageId(null); }}
            title="Save current filters as a new profile">
            <Plus size={13} />
            Save view
          </button>
        )}
      </div>

      {/* Save form */}
      {saveOpen && (
        <SaveForm
          onSave={(opts) => { onAdd(opts); setSaveOpen(false); }}
          onCancel={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Profile Chip ─────────────────────────────────────────────── */
function ProfileChip({ profile, isActive, isDirty, isManaging, onApply, onManageToggle,
  onResave, onDelete, onRename, onColorChange, categories, resources }) {

  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal]   = useState(profile.name);
  const chipRef = useRef(null);

  // Close manage panel on outside click
  useEffect(() => {
    if (!isManaging) return;
    function handler(e) {
      if (chipRef.current && !chipRef.current.contains(e.target)) {
        onManageToggle();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isManaging, onManageToggle]);

  const color = profile.color ?? '#64748b';

  // Build a summary string for the tooltip
  const summary = buildSummary(profile);

  return (
    <div ref={chipRef} className={styles.chipWrap}>
      <button
        className={[
          styles.chip,
          isActive && styles.active,
          isDirty  && styles.dirty,
        ].filter(Boolean).join(' ')}
        style={{ '--chip-color': color }}
        onClick={onApply}
        title={summary}
      >
        {isActive
          ? <BookmarkCheck size={12} className={styles.chipIcon} />
          : <Bookmark size={12} className={styles.chipIcon} />
        }
        <span className={styles.chipName}>{profile.name}</span>
        {isDirty && <span className={styles.dirtyDot} title="Filters changed since saved" />}
        {profile.view && (
          <span className={styles.viewTag}>{profile.view.slice(0,3)}</span>
        )}

        {/* Manage toggle (pencil) */}
        <span
          className={styles.manageBtn}
          onClick={e => { e.stopPropagation(); onManageToggle(); }}
          role="button"
          tabIndex={0}
          aria-label="Manage profile"
          onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onManageToggle())}
        >
          <Pencil size={10} />
        </span>
      </button>

      {/* Manage panel */}
      {isManaging && (
        <div className={styles.managePanel}>
          {/* Filter summary */}
          <div className={styles.summaryBlock}>
            <FilterSummary profile={profile} categories={categories} resources={resources} />
          </div>

          {/* Rename */}
          {renaming ? (
            <div className={styles.renameRow}>
              <input
                className={styles.renameInput}
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onRename(nameVal); setRenaming(false); }
                  if (e.key === 'Escape') { setNameVal(profile.name); setRenaming(false); }
                }}
                autoFocus
              />
              <button className={styles.iconBtn} onClick={() => { onRename(nameVal); setRenaming(false); }}>
                <Check size={13} />
              </button>
              <button className={styles.iconBtn} onClick={() => { setNameVal(profile.name); setRenaming(false); }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <button className={styles.manageLine} onClick={() => setRenaming(true)}>
              <Pencil size={12} /> Rename
            </button>
          )}

          {/* Color picker */}
          <div className={styles.colorRow}>
            {PROFILE_COLORS.map(c => (
              <button
                key={c}
                className={[styles.colorDot, profile.color === c && styles.colorDotActive].filter(Boolean).join(' ')}
                style={{ background: c }}
                onClick={() => onColorChange(c)}
                aria-label={`Set color ${c}`}
              />
            ))}
          </div>

          {/* Resave current filters */}
          <button className={styles.manageLine} onClick={onResave}>
            <RefreshCw size={12} /> Update with current filters
          </button>

          {/* Delete */}
          <button className={[styles.manageLine, styles.danger].join(' ')} onClick={onDelete}>
            <Trash2 size={12} /> Delete profile
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Filter Summary (inside manage panel) ─────────────────────── */
function FilterSummary({ profile }) {
  const { categories = [], resources = [], search = '' } = profile.filters ?? {};
  const hasFilters = categories.length || resources.length || search;

  if (!hasFilters) {
    return <p className={styles.summaryNone}>No filters — matches all events</p>;
  }

  return (
    <div className={styles.summary}>
      {categories.length > 0 && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Categories</span>
          <span className={styles.summaryTags}>
            {categories.map(c => <span key={c} className={styles.tag}>{c}</span>)}
          </span>
        </div>
      )}
      {resources.length > 0 && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Resources</span>
          <span className={styles.summaryTags}>
            {resources.map(r => <span key={r} className={styles.tag}>{r}</span>)}
          </span>
        </div>
      )}
      {search && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Search</span>
          <span className={styles.summaryTags}>
            <span className={styles.tag}>"{search}"</span>
          </span>
        </div>
      )}
      {profile.view && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Pinned view</span>
          <span className={styles.summaryTags}>
            <span className={styles.tag}>{profile.view}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Save Form ────────────────────────────────────────────────── */
function SaveForm({ onSave, onCancel }) {
  const [name,     setName]     = useState('');
  const [color,    setColor]    = useState(PROFILE_COLORS[0]);
  const [pinView,  setPinView]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    onSave({ name: trimmed, color, pinView });
  }

  return (
    <div className={styles.saveForm}>
      <input
        ref={inputRef}
        className={styles.nameInput}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Profile name, e.g. Agusta Inspections…"
      />

      {/* Color row */}
      <div className={styles.colorRow}>
        {PROFILE_COLORS.map(c => (
          <button
            key={c}
            className={[styles.colorDot, color === c && styles.colorDotActive].filter(Boolean).join(' ')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Choose color ${c}`}
          />
        ))}
      </div>

      <label className={styles.pinRow}>
        <input type="checkbox" checked={pinView} onChange={e => setPinView(e.target.checked)} />
        Also pin the current view (month/week/day…)
      </label>

      <div className={styles.saveActions}>
        <button className={styles.btnSave} onClick={handleSave} disabled={!name.trim()}>
          Save profile
        </button>
        <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */
function buildSummary(profile) {
  const { categories = [], resources = [], search = '' } = profile.filters ?? {};
  const parts = [];
  if (categories.length) parts.push(`Categories: ${categories.join(', ')}`);
  if (resources.length)  parts.push(`Resources: ${resources.join(', ')}`);
  if (search)            parts.push(`Search: "${search}"`);
  if (profile.view)      parts.push(`View: ${profile.view}`);
  return parts.length ? parts.join(' · ') : 'No filters applied';
}
