/**
 * ImportPreview — confirm + import parsed iCal events.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import styles from './ImportPreview.module.css';

export default function ImportPreview({ events, onImport, onClose }: any) {
  const [selected, setSelected] = useState(() => new Set(events.map((_, i) => i)));

  function toggle(i) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === events.length) setSelected(new Set());
    else setSelected(new Set(events.map((_, i) => i)));
  }

  function handleImport() {
    const toImport = events.filter((_, i) => selected.has(i));
    onImport?.(toImport);
    onClose();
  }

  const allSelected = selected.size === events.length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Import Events</h2>
          <span className={styles.count}>{events.length} event{events.length !== 1 ? 's' : ''} found</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.selectAll}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            {allSelected ? 'Deselect all' : 'Select all'}
          </label>
          <span className={styles.selectedCount}>{selected.size} selected</span>
        </div>

        <div className={styles.list}>
          {events.map((ev, i) => {
            const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
            return (
              <label key={i} className={[styles.item, selected.has(i) && styles.itemSelected].filter(Boolean).join(' ')}>
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  className={styles.checkbox}
                />
                <div className={styles.evInfo}>
                  <span className={styles.evTitle}>{ev.title}</span>
                  <span className={styles.evDate}>
                    {isValid(start) ? format(start, 'MMM d, yyyy') : '—'}
                    {ev.category && ` · ${ev.category}`}
                    {ev.status && ev.status !== 'confirmed' && (
                      <span className={styles.statusBadge} data-status={ev.status}>
                        {ev.status}
                      </span>
                    )}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.importBtn}
            onClick={handleImport}
            disabled={selected.size === 0}
          >
            Import {selected.size > 0 ? selected.size : ''} event{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function isValid(d) {
  return d instanceof Date && !isNaN(d.getTime());
}
