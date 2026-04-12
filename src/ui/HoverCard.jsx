import { useState, useRef, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { X, Clock, Tag, Anchor, FileText, StickyNote, Pencil } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import styles from './HoverCard.module.css';

export default function HoverCard({ event, config, note, onClose, onNoteSave, onNoteDelete, onEdit, anchor }) {
  const [noteText, setNoteText] = useState(note?.body || '');
  const [editing, setEditing] = useState(false);
  const cardRef = useRef(null);
  const trapRef = useFocusTrap(onClose);
  const hc = config?.hoverCard ?? {};

  // Close on click outside
  useEffect(() => {
    function handler(e) {
      if (cardRef.current && !cardRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function handleNoteSave() {
    onNoteSave?.({ eventId: event.id, body: noteText });
    setEditing(false);
  }

  const timeRangeText = event.allDay
    ? 'All day'
    : isSameDay(event.start, event.end)
      ? `${format(event.start, 'MMM d, h:mm a')} – ${format(event.end, 'h:mm a')}`
      : `${format(event.start, 'MMM d, h:mm a')} – ${format(event.end, 'MMM d, h:mm a')}`;

  return (
    <div ref={(node) => { cardRef.current = node; trapRef.current = node; }} className={styles.card} role="dialog" aria-modal="true" aria-label={`Event details: ${event.title}`}>
      {/* Color accent bar */}
      <div className={styles.accent} style={{ background: event.color }} />

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{event.title}</h3>
          {onEdit && (
            <button className={styles.editBtn} onClick={e => { e.stopPropagation(); onEdit(event); }} aria-label="Edit event" title="Edit">
              <Pencil size={13} />
            </button>
          )}
          <button className={styles.close} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {event.status && event.status !== 'confirmed' && (
          <div className={styles.statusBadge} data-status={event.status}>
            {event.status === 'tentative' ? 'Tentative' : 'Cancelled'}
          </div>
        )}

        {hc.showTime !== false && (
          <div className={styles.field}>
            <Clock size={13} className={styles.icon} />
            <span>{timeRangeText}</span>
          </div>
        )}

        {hc.showCategory !== false && event.category && (
          <div className={styles.field}>
            <Tag size={13} className={styles.icon} />
            <span className={styles.badge} style={{ '--badge-color': event.color }}>
              {event.category}
            </span>
          </div>
        )}

        {hc.showResource !== false && event.resource && (
          <div className={styles.field}>
            <Anchor size={13} className={styles.icon} />
            <span>{event.resource}</span>
          </div>
        )}

        {hc.showMeta !== false && event.meta && Object.entries(event.meta).length > 0 && (
          <div className={styles.metaBlock}>
            {Object.entries(event.meta).map(([k, v]) => (
              <div key={k} className={styles.metaRow}>
                <span className={styles.metaKey}>{k}</span>
                <span className={styles.metaVal}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {hc.showNotes !== false && onNoteSave && (
          <div className={styles.notesSection}>
            <div className={styles.notesHeader}>
              <StickyNote size={13} className={styles.icon} />
              <span>Notes</span>
              {!editing && (
                <button className={styles.editNoteBtn} onClick={() => setEditing(true)}>
                  {note ? 'Edit' : 'Add note'}
                </button>
              )}
            </div>

            {editing ? (
              <div className={styles.noteEdit}>
                <textarea
                  className={styles.noteTextarea}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                  autoFocus
                  rows={3}
                />
                <div className={styles.noteActions}>
                  <button className={styles.btnSave} onClick={handleNoteSave}>Save</button>
                  <button className={styles.btnCancel} onClick={() => { setEditing(false); setNoteText(note?.body || ''); }}>Cancel</button>
                  {note && (
                    <button className={styles.btnDelete} onClick={() => { onNoteDelete?.(note.id); onClose(); }}>Delete</button>
                  )}
                </div>
              </div>
            ) : (
              note?.body && <p className={styles.noteText}>{note.body}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
