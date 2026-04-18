function buildSingleAccessor(fieldName, mode) {
  if (mode === 'employee') {
    return (row) => {
      const val = row.emp?.[fieldName];
      if (val != null) return val;
      return row.emp?.meta?.[fieldName] ?? null;
    };
  }

  // resource mode: read from first event's fields
  return (row) => {
    const firstEvent = row.events?.[0];
    if (!firstEvent) return null;
    const val = firstEvent[fieldName];
    if (val != null) return val;
    return firstEvent.meta?.[fieldName] ?? null;
  };
}

/**
 * Accepts a single field name OR an array of field names.
 *   "role"                 → single accessor fn
 *   ["role", "shift"]      → array of accessor fns (one per grouping level)
 */
export function buildFieldAccessor(fieldName, mode) {
  if (Array.isArray(fieldName)) {
    return fieldName.map(f => buildSingleAccessor(f, mode));
  }
  return buildSingleAccessor(fieldName, mode);
}
