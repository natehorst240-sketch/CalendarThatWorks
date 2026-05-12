import { useState, useRef, useEffect, useMemo } from 'react';
import { localTimezone, tzOffsetLabel } from '../core/engine/time/timezone';
import styles from './TimezonePicker.module.css';

export interface TimezonePickerProps {
  value?: string;
  onChange: (tz: string) => void;
}

function getAllTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
      'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo',
      'Asia/Shanghai', 'Australia/Sydney'];
  }
}

export default function TimezonePicker({ value, onChange }: TimezonePickerProps) {
  const now = useMemo(() => new Date(), []);
  const allZones = useMemo(() => getAllTimezones(), []);
  const effective = value ?? localTimezone();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? allZones.filter(z => z.toLowerCase().includes(q)) : allZones;
  }, [allZones, query]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 0); }
    else setQuery('');
  }, [open]);

  return (
    <div ref={rootRef} className={styles['root']}>
      <button
        type="button"
        className={styles['trigger']}
        onClick={() => setOpen(o => !o)}
        title="Change display timezone"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles['label']}>{effective.replace(/_/g, ' ')}</span>
        <span className={styles['offset']}>{tzOffsetLabel(now, effective)}</span>
      </button>

      {open && (
        <div className={styles['dropdown']} role="listbox">
          <input
            ref={inputRef}
            className={styles['search']}
            placeholder="Search timezone…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className={styles['list']}>
            {filtered.map(tz => (
              <button
                key={tz}
                type="button"
                role="option"
                aria-selected={tz === effective}
                className={`${styles['item']} ${tz === effective ? styles['itemActive'] : ''}`}
                onClick={() => { onChange(tz); setOpen(false); }}
              >
                <span className={styles['itemName']}>{tz.replace(/_/g, ' ')}</span>
                <span className={styles['itemOffset']}>{tzOffsetLabel(now, tz)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className={styles['empty']}>No timezones found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
