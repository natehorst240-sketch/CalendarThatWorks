type AccessorRow = {
  emp?: Record<string, unknown> & { meta?: Record<string, unknown> };
  events?: Array<Record<string, unknown> & { meta?: Record<string, unknown> }>;
};

export type FieldAccessor = (row: AccessorRow) => unknown;

function buildSingleAccessor(fieldName: string, mode: string): FieldAccessor {
  if (mode === 'employee') {
    return (row: AccessorRow) => {
      const val = row.emp?.[fieldName];
      if (val != null) return val;
      return row.emp?.meta?.[fieldName] ?? null;
    };
  }

  // resource mode: read from first event's fields
  return (row: AccessorRow) => {
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
export function buildFieldAccessor(fieldName: string | string[], mode: string): FieldAccessor | FieldAccessor[] {
  if (Array.isArray(fieldName)) {
    return fieldName.map(f => buildSingleAccessor(f, mode));
  }
  return buildSingleAccessor(fieldName, mode);
}
