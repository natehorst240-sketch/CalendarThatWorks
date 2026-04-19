const UNGROUPED = '(Ungrouped)';

function bucketize(items, accessor) {
  const map = new Map();
  for (const item of items) {
    const val = accessor(item);
    const key = val != null && val !== '' ? String(val) : UNGROUPED;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  // Insertion order preserved; (Ungrouped) always sorts last.
  const order = [...map.keys()].sort((a, b) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    return 0;
  });
  return { map, order };
}

function emitLevel(items, accessors, level, parentPath, collapsedGroups, groupHeaderHeight, groupOrder, flatRows) {
  if (level >= accessors.length) {
    flatRows.push(...items);
    return;
  }
  const { map, order } = bucketize(items, accessors[level]);
  for (const key of order) {
    const path = parentPath ? `${parentPath}/${key}` : key;
    groupOrder.push(path);
    const bucket = map.get(key);
    const collapsed = collapsedGroups.has(path);
    // Total member count = count of leaf rows under this group, recursively.
    const count = bucket.length;
    flatRows.push({
      _type: 'groupHeader',
      groupKey: path,
      groupLabel: key,
      depth: level,
      collapsed,
      rowH: groupHeaderHeight,
      count,
    });
    if (!collapsed) {
      emitLevel(bucket, accessors, level + 1, path, collapsedGroups, groupHeaderHeight, groupOrder, flatRows);
    }
  }
}

/**
 * Flattens rows into a mixed-type list ready for virtualised rendering.
 * Supports single-level grouping (fieldAccessor is a fn) or multi-level
 * grouping (fieldAccessor is an array of fns, one per level).
 *
 * Returned flatRows interleave `_type: 'groupHeader'` pseudo-rows with
 * the input rows. Header rows carry `depth` (0 = top-level) and a
 * slash-joined `groupKey` path for collapse-state addressing.
 */
export function groupRows(rows, options: {
  groupBy?: unknown
  fieldAccessor?: unknown
  collapsedGroups?: Set<string>
  groupHeaderHeight?: number
} = {}) {
  const {
    groupBy,
    fieldAccessor,
    collapsedGroups = new Set<string>(),
    groupHeaderHeight = 36,
  } = options;

  if (!groupBy || !fieldAccessor || rows.length === 0) {
    return { flatRows: rows, groupOrder: [] };
  }

  const accessors = Array.isArray(fieldAccessor) ? fieldAccessor : [fieldAccessor];
  if (accessors.length === 0) {
    return { flatRows: rows, groupOrder: [] };
  }

  const flatRows = [];
  const groupOrder = [];
  emitLevel(rows, accessors, 0, '', collapsedGroups, groupHeaderHeight, groupOrder, flatRows);
  return { flatRows, groupOrder };
}
