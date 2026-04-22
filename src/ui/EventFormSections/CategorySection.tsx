import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import styles from '../EventForm.module.css';

/**
 * CategorySection — category dropdown + "add category" inline flow.
 *
 * Props:
 *   value         string    — current category value
 *   allCats       string[]  — all available category names
 *   onAddCategory (name) => void | undefined  — omit to hide the + button
 *   onChange      (value) => void
 */
export function CategorySection({ value, allCats, onAddCategory, onChange }: any) {
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const newCatRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (addCatOpen) newCatRef.current?.focus();
  }, [addCatOpen]);

  function submitNewCat() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    onAddCategory?.(trimmed);
    setNewCatName('');
    setAddCatOpen(false);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="ef-category">
        Category
        {onAddCategory && (
          <button
            type="button"
            className={styles.addCatBtn}
            onClick={() => setAddCatOpen((v: boolean) => !v)}
            title="Add category"
            aria-label="Add category"
          >
            <Plus size={11} />
          </button>
        )}
      </label>

      {addCatOpen && (
        <div className={styles.addCatRow}>
          <input
            ref={newCatRef}
            className={styles.addCatInput}
            placeholder="New category name"
            value={newCatName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewCatName(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') { e.preventDefault(); submitNewCat(); }
              if (e.key === 'Escape') setAddCatOpen(false);
            }}
          />
          <button type="button" className={styles.addCatSave} onClick={submitNewCat}>
            Add
          </button>
        </div>
      )}

      <select
        id="ef-category"
        className={styles.select}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">— none —</option>
        {allCats.map((c: string) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
