import { Trash2, X, CheckSquare } from 'lucide-react';
import styles from './BulkActionBar.module.css';

export interface BulkActionBarProps {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll?: () => void;
  totalCount?: number;
}

export default function BulkActionBar({ count, onDelete, onClear, onSelectAll, totalCount }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className={styles['bar']} role="toolbar" aria-label="Bulk actions">
      <span className={styles['count']}>
        {count} selected{totalCount !== undefined ? ` of ${totalCount}` : ''}
      </span>
      {onSelectAll && totalCount !== undefined && count < totalCount && (
        <button
          type="button"
          className={styles['action']}
          onClick={onSelectAll}
          title="Select all visible events"
        >
          <CheckSquare size={14} aria-hidden="true" />
          Select all
        </button>
      )}
      <button
        type="button"
        className={[styles['action'], styles['danger']].join(' ')}
        onClick={onDelete}
        title="Delete selected events"
      >
        <Trash2 size={14} aria-hidden="true" />
        Delete
      </button>
      <button
        type="button"
        className={styles['clearBtn']}
        onClick={onClear}
        aria-label="Clear selection"
        title="Clear selection"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
