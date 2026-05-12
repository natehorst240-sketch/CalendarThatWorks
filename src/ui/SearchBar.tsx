import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import styles from '../WorksCalendar.module.css';

export interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search events…' }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value resets (e.g. clearFilters)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setLocalValue(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(q), 200);
  }, [onChange]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') handleClear();
  }, [handleClear]);

  return (
    <div className={styles['searchBarWrap']} role="search">
      <Search size={14} className={styles['searchBarIcon']} aria-hidden="true" />
      <input
        type="search"
        className={styles['searchBarInput']}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search events"
        autoComplete="off"
        spellCheck={false}
      />
      {localValue && (
        <button
          type="button"
          className={styles['searchBarClear']}
          onClick={handleClear}
          aria-label="Clear search"
          title="Clear"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
