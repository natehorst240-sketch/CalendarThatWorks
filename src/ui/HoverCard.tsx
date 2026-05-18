import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { isSameDay } from 'date-fns';
import { X, Clock, Tag, Anchor, StickyNote, Pencil, MessageSquare, Send } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import EventStatusBadge from './EventStatusBadge';
import { createId } from 'works-calendar-engine';
import { useCalendarContext } from '../core/CalendarContext';
import { formatInTimezone, tzOffsetLabel } from 'works-calendar-engine';
import type { EventComment } from '../types/events';
import styles from './HoverCard.module.css';

type HoverCardEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color?: string | undefined;
  status?: unknown;
  lifecycle?: unknown;
  category?: string | null | undefined;
  resource?: string | null | undefined;
  meta?: Record<string, unknown> | undefined;
  comments?: readonly EventComment[] | undefined;
  allDay?: boolean | undefined;
  [key: string]: unknown;
};

type HoverCardProps = {
  event: HoverCardEvent;
  config?: { hoverCard?: { showTime?: boolean; showCategory?: boolean; showResource?: boolean; showMeta?: boolean; showNotes?: boolean } } | null | undefined;
  note?: { id?: string; body?: string; [key: string]: unknown } | null | undefined;
  onClose: () => void;
  onNoteSave?: ((payload: Record<string, unknown>) => void) | null | undefined;
  onNoteDelete?: ((id: string) => void) | null | undefined;
  onEdit?: ((event: HoverCardEvent) => void) | null | undefined;
  onCommentAdd?: ((event: HoverCardEvent, comment: EventComment) => void) | null | undefined;
  currentUserName?: string | undefined;
  anchor?: unknown;
  resolveResourceLabel?: ((resource: string) => string) | undefined;
};

export default function HoverCard({ event, config, note, onClose, onNoteSave, onNoteDelete, onEdit, onCommentAdd, currentUserName, anchor: _anchor, resolveResourceLabel }: HoverCardProps) {
  const [noteText, setNoteText] = useState(note?.body || '');
  const [editing, setEditing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const commentInputRef = useRef<HTMLInputElement>(null);
  const ctx = useCalendarContext();
  const displayTz = ctx?.displayTimezone ?? null;

  const comments: readonly EventComment[] = event?.comments ?? [];

  function handleCommentSubmit() {
    const text = commentText.trim();
    if (!text || !onCommentAdd) return;
    const newComment: EventComment = {
      id: createId(),
      author: currentUserName ?? 'You',
      text,
      timestamp: new Date().toISOString(),
    };
    onCommentAdd(event, newComment);
    setCommentText('');
  }

  function handleCommentKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(); }
  }
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const hc = config?.hoverCard ?? {};

  // Close on click outside
  useEffect(() => {
    function handler(e: globalThis.MouseEvent) {
      if (trapRef.current && !trapRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function handleNoteSave() {
    onNoteSave?.({ eventId: event.id, body: noteText });
    setEditing(false);
  }

  const fmt = (d: Date, pattern: string) => formatInTimezone(d, pattern, displayTz);
  const tzLabel = displayTz ? ` (${tzOffsetLabel(event.start, displayTz)})` : '';
  const timeRangeText = event.allDay
    ? 'All day'
    : isSameDay(event.start, event.end)
      ? `${fmt(event.start, 'MMM d, h:mm a')} – ${fmt(event.end, 'h:mm a')}${tzLabel}`
      : `${fmt(event.start, 'MMM d, h:mm a')} – ${fmt(event.end, 'MMM d, h:mm a')}${tzLabel}`;

  return (
    <div ref={trapRef} className={styles['card']} role="dialog" aria-modal="true" aria-label={`Event details: ${event.title}`}>
      {/* Color accent bar */}
      <div className={styles['accent']} style={{ background: event.color }} />

      <div className={styles['body']}>
        <div className={styles['titleRow']}>
          <h3 className={styles['title']}>{event.title}</h3>
          {onEdit && (
            <button className={styles['editBtn']} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEdit(event); }} aria-label="Edit event" title="Edit">
              <Pencil size={13} />
            </button>
          )}
          <button className={styles['close']} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {typeof event.status === 'string' && event.status && event.status !== 'confirmed' && (
          <div className={styles['statusBadge']} data-status={event.status}>
            {event.status === 'tentative' ? 'Tentative' : 'Cancelled'}
          </div>
        )}
        {event.lifecycle != null && (
          <div className={styles['lifecycleRow']}>
            <EventStatusBadge lifecycle={event.lifecycle as Parameters<typeof EventStatusBadge>[0]['lifecycle']} size="md" />
          </div>
        )}

        {hc.showTime !== false && (
          <div className={styles['field']}>
            <Clock size={13} className={styles['icon']} />
            <span>{timeRangeText}</span>
          </div>
        )}

        {hc.showCategory !== false && event.category && (
          <div className={styles['field']}>
            <Tag size={13} className={styles['icon']} />
            <span className={styles['badge']} style={{ '--badge-color': event.color } as React.CSSProperties}>
              {event.category}
            </span>
          </div>
        )}

        {hc.showResource !== false && event.resource && (
          <div className={styles['field']}>
            <Anchor size={13} className={styles['icon']} />
            <span>{resolveResourceLabel?.(event.resource) ?? event.resource}</span>
          </div>
        )}

        {hc.showMeta !== false && event.meta && Object.entries(event.meta).length > 0 && (
          <div className={styles['metaBlock']}>
            {Object.entries(event.meta).map(([k, v]) => (
              <div key={k} className={styles['metaRow']}>
                <span className={styles['metaKey']}>{k}</span>
                <span className={styles['metaVal']}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {hc.showNotes !== false && onNoteSave && (
          <div className={styles['notesSection']}>
            <div className={styles['notesHeader']}>
              <StickyNote size={13} className={styles['icon']} />
              <span>Notes</span>
              {!editing && (
                <button className={styles['editNoteBtn']} onClick={() => setEditing(true)}>
                  {note ? 'Edit' : 'Add note'}
                </button>
              )}
            </div>

            {editing ? (
              <div className={styles['noteEdit']}>
                <label htmlFor="hc-note" className={styles['srOnly']}>Event note</label>
                <textarea
                  id="hc-note"
                  className={styles['noteTextarea']}
                  value={noteText}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                  autoFocus
                  rows={3}
                />
                <div className={styles['noteActions']}>
                  <button className={styles['btnSave']} onClick={handleNoteSave}>Save</button>
                  <button className={styles['btnCancel']} onClick={() => { setEditing(false); setNoteText(note?.body || ''); }}>Cancel</button>
                  {note && note.id && (
                    <button className={styles['btnDelete']} onClick={() => { onNoteDelete?.(note.id as string); onClose(); }}>Delete</button>
                  )}
                </div>
              </div>
            ) : (
              note?.body && <p className={styles['noteText']}>{note.body}</p>
            )}
          </div>
        )}
        {/* Comment thread */}
        {onCommentAdd && (
          <div className={styles['commentsSection']}>
            <div className={styles['commentsHeader']}>
              <MessageSquare size={13} className={styles['icon']} />
              <span>Comments{comments.length > 0 ? ` (${comments.length})` : ''}</span>
            </div>
            {comments.length > 0 && (
              <div className={styles['commentList']}>
                {comments.map(c => (
                  <div key={c.id} className={styles['comment']}>
                    <span className={styles['commentAuthor']}>{c.author}</span>
                    <span className={styles['commentTime']}>
                      {fmt(new Date(c.timestamp), 'MMM d, h:mm a')}
                    </span>
                    <p className={styles['commentText']}>{c.text}</p>
                  </div>
                ))}
              </div>
            )}
            <div className={styles['commentInput']}>
              <input
                ref={commentInputRef}
                type="text"
                className={styles['commentField']}
                value={commentText}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCommentText(e.target.value)}
                onKeyDown={handleCommentKeyDown}
                placeholder="Add a comment… (Enter to send)"
                aria-label="Add comment"
              />
              <button
                type="button"
                className={styles['commentSendBtn']}
                onClick={handleCommentSubmit}
                disabled={!commentText.trim()}
                aria-label="Send comment"
                title="Send"
              >
                <Send size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
