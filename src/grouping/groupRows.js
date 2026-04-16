export function groupRows(rows, options = {}) {
  const {
    groupBy,
    fieldAccessor,
    collapsedGroups = new Set(),
    groupHeaderHeight = 36,
  } = options;

  if (!groupBy || !fieldAccessor || rows.length === 0) {
    return { flatRows: rows, groupOrder: [] };
  }

  const groupMap = new Map();
  for (const row of rows) {
    const val = fieldAccessor(row);
    const key = val != null && val !== '' ? String(val) : '(Ungrouped)';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(row);
  }

  // Insertion order preserved; (Ungrouped) sorted last
  const groupOrder = [...groupMap.keys()].sort((a, b) => {
    if (a === '(Ungrouped)') return 1;
    if (b === '(Ungrouped)') return -1;
    return 0;
  });

  const flatRows = [];
  for (const groupKey of groupOrder) {
    const members = groupMap.get(groupKey);
    const collapsed = collapsedGroups.has(groupKey);
    flatRows.push({
      _type: 'groupHeader',
      groupKey,
      groupLabel: groupKey,
      collapsed,
      rowH: groupHeaderHeight,
      count: members.length,
    });
    if (!collapsed) {
      flatRows.push(...members);
    }
  }

  return { flatRows, groupOrder };
}
