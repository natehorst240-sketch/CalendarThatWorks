/**
 * InlineEventEditor — lightweight event customization popover.
 *
 * Activated when the owner clicks an event in Edit Mode.
 * Lets owners tweak title, color, bold, and size without opening the full form.
 */
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './InlineEventEditor.module.css';

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981',
  '#8b5cf6', '#ec4899', '#06b6d4', '#64748b',
];

export default function InlineEventEditor({ event, x, y, onSave, onClose }) {
  const [title, setTitle] = useState(event.title ?? '');
  const [color, setColor] = useState(event.color ?? PRESET_COLORS[0]);
  const [bold,  setBold]  = useState(!!(event.meta?._display?.bold));
  const [large, setLarge] = useState(!!(event.meta?._display?.large));
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function handleKeyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
  }

  function handleSave() {
    onSave({
      title: title.trim() || '(untitled)',
      color,
      meta: {
        ...(event.meta ?? {}),
        _display: { bold, large },
      },
    });
  }

  // Clamp position to stay within viewport
  const CARD_W = 252;
  const CARD_H = 260;
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const px = Math.min(x + 8, vw - CARD_W - 12);
  const py = y + 16 + CARD_H > vh ? Math.max(8, y - CARD_H - 8) : y + 16;

  const styleLabel = bold && large ? 'Bold + Priority'
    : bold  ? 'Bold text'
    : large ? 'Priority size'
    : 'Normal';

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      style={{ left: px, top: py }}
      role="dialog"
      aria-label="Edit event appearance"
      onKeyDown={handleKeyDown}
    >
      <div className={styles.header}>
        <span className={styles.headerLabel}>Customize Event</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      {/* Title */}
      <input
        ref={inputRef}
        className={styles.titleInput}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Event title…"
        aria-label="Event title"
      />

      {/* Color swatches */}
      <div className={styles.colorRow} role="group" aria-label="Event color">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            className={[styles.colorSwatch, color === c && styles.colorActive].filter(Boolean).join(' ')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
          />
        ))}
      </div>

      {/* Style toggles */}
      <div className={styles.styleRow}>
        <button
          className={[styles.styleBtn, bold && styles.styleBtnActive].filter(Boolean).join(' ')}
          onClick={() => setBold(v => !v)}
          aria-pressed={bold}
          title="Bold text"
        >
          <strong>B</strong>
        </button>
        <button
          className={[styles.styleBtn, large && styles.styleBtnActive].filter(Boolean).join(' ')}
          onClick={() => setLarge(v => !v)}
          aria-pressed={large}
          title="Priority size — makes this event stand out"
        >
          <span aria-hidden="true">★</span>
        </button>
        <span className={styles.styleHint}>{styleLabel}</span>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.saveBtn} onClick={handleSave}>Save</button>
        <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
