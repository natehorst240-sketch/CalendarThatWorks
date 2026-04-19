/**
 * ClearFiltersButton — resets every filter back to its default value.
 * Disabled when no filters are currently active.
 */
import { FilterX } from 'lucide-react';
import styles from './ProfileBar.module.css';

export default function ClearFiltersButton({
  hasActiveFilters,
  onClear,
}: {
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.headerBtn}
      onClick={onClear}
      disabled={!hasActiveFilters}
      title={hasActiveFilters ? 'Clear all filters' : 'No filters to clear'}
    >
      <FilterX size={13} />
      <span>Clear all filters</span>
    </button>
  );
}
