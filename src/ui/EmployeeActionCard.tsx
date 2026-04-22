import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './EmployeeActionCard.module.css';

/**
 * EmployeeActionCard — fixed-position popover shown when an employee name is
 * clicked in the TimelineView.
 *
 * Props:
 *   emp        { id, name, role? }   — the employee whose row was clicked
 *   anchorRect DOMRect               — bounding rect of the name cell (for positioning)
 *   onAction   (action) => void      — called with 'pto' | 'unavailable' | 'availability' | 'schedule'
 *   onClose    () => void
 */
export default function EmployeeActionCard({ emp, anchorRect, onAction, onClose }: any) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Start invisible so we can measure before revealing
  const [pos, setPos] = useState({ top: anchorRect.bottom + 4, left: anchorRect.left, visible: false });

  // Close on outside click or Escape
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Measure card and clamp to viewport before first paint
  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const card = cardRef.current.getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    const gap  = 8;

    let top  = anchorRect.bottom + 4;
    let left = anchorRect.left;

    // Flip above anchor if it would overflow bottom
    if (top + card.height > vh - gap) top = anchorRect.top - card.height - 4;
    // Clamp vertical
    if (top < gap) top = gap;

    // Clamp horizontal
    if (left + card.width > vw - gap) left = vw - card.width - gap;
    if (left < gap) left = gap;

    setPos({ top, left, visible: true });
  }, [anchorRect]);

  // Auto-focus first button once visible
  useEffect(() => {
    if (pos.visible) {
      cardRef.current?.querySelector('button')?.focus();
    }
  }, [pos.visible]);

  function handleAction(action: string) {
    onAction(action);
    onClose();
  }

  return (
    <div
      ref={cardRef}
      className={styles.card}
      style={{ top: pos.top, left: pos.left, visibility: pos.visible ? 'visible' : 'hidden' }}
      role="menu"
      aria-label={`Actions for ${emp.name}`}
    >
      <div className={styles.header}>
        <span className={styles.empName}>{emp.name}</span>
        {emp.role && <span className={styles.empRole}>{emp.role}</span>}
      </div>
      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={() => handleAction('schedule')}
        >
          Create Schedule
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => handleAction('pto')}
        >
          Request PTO
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => handleAction('unavailable')}
        >
          Mark Unavailable
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => handleAction('availability')}
        >
          Set Availability
        </button>
      </div>
    </div>
  );
}
