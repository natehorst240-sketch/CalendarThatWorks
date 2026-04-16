export function buildFieldAccessor(fieldName, mode) {
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
