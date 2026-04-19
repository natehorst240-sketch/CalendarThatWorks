/**
 * AssetsView.jsx — Horizontal resource (asset) timeline / Gantt view.
 *
 * Phase 1 Sprint 2 skeleton. Cloned from TimelineView but stripped of
 * employee-specific shift coverage / on-call / action-card machinery.
 *
 * Key responsibilities:
 *   - Rows derived from event.resource (one row per distinct asset).
 *   - Horizontal pill bars sized by duration and laid out with
 *     first-fit lane packing (shared algorithm with TimelineView).
 *   - Assets timeline always renders in day-scale gantt mode.
 *   - Sticky left asset column: registration + sublabel + banner slot.
 *     Location banner is a placeholder in Sprint 2; Sprint 3 wires the
 *     real LocationProvider.
 *   - Category hue comes from categoriesConfig / DEFAULT_CATEGORIES,
 *     then falls back to the event's explicit color / colorRules.
 *   - Approval-stage visuals read from event.meta.approvalStage.stage
 *     (5 states per Phase 0 contract).
 */
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, isToday, isWeekend,
  differenceInCalendarDays, startOfDay, addDays, min, max,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import styles from './AssetsView.module.css';
import { buildGroupTree } from '../hooks/useGrouping.ts';
import GroupHeader from '../ui/GroupHeader.tsx';
import { useResourceLocations } from '../hooks/useResourceLocations.ts';
import { DEFAULT_CATEGORIES } from '../types/assets.ts';
import AuditDrawer from './AuditDrawer';
import ApprovalActionMenu, { allowedActionsFor } from '../ui/ApprovalActionMenu';

const AUDIT_STAGES = new Set(['denied', 'pending_higher']);

// ─── Layout constants ─────────────────────────────────────────────────────────

const NAME_W   = 220;  // px — asset column (registration + sublabel + banner)
const LANE_H   = 26;   // px — each event lane
const LANE_GAP = 3;    // px — gap between lanes
const ROW_PAD  = 8;    // px — top/bottom padding per row
const OVERSCAN_ROWS = 3;

// Zoom level → pixels per day. Sprint 2 keeps the visible range = current
// month; later sprints may expand the range at coarser zooms.
const DAY_PX_PER_DAY = 80;

const APPROVAL_STAGES = new Set([
  'requested', 'approved', 'finalized', 'pending_higher', 'denied',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * First-fit lane packing for horizontal Gantt bars. Clips each event to the
 * visible month window, sorts by start then end, and assigns `_lane` to the
 * earliest slot that's free at the event's start day. Returns the clipped
 * events plus the max lane count so the row can size its height.
 */
function assignLanes(events, monthStart, monthEnd) {
  const clipped = events
    .filter(e => startOfDay(e.start) <= monthEnd && startOfDay(e.end) >= monthStart)
    .map(e => ({
      ...e,
      _dayStart: differenceInCalendarDays(
        max([startOfDay(e.start), monthStart]),
        monthStart,
      ),
      _dayEnd: differenceInCalendarDays(
        min([startOfDay(e.end), monthEnd]),
        monthStart,
      ),
    }))
    .sort((a, b) => a._dayStart - b._dayStart || a._dayEnd - b._dayEnd);

  const laneEnd = [];
  for (const ev of clipped) {
    let placed = false;
    for (let i = 0; i < laneEnd.length; i++) {
      if (laneEnd[i] < ev._dayStart) {
        ev._lane = i;
        laneEnd[i] = ev._dayEnd;
        placed = true;
        break;
      }
    }
    if (!placed) {
      ev._lane = laneEnd.length;
      laneEnd.push(ev._dayEnd);
    }
  }

  return { events: clipped, laneCount: Math.max(1, laneEnd.length) };
}

/**
 * Builds a Map of category id → hex color from CategoriesConfig.categories
 * (falling back to DEFAULT_CATEGORIES when the prop is empty). Used by
 * resolveAssetColor to look up the pill hue for a given event.
 */
function buildCategoryColorMap(categoriesConfig) {
  const map = new Map();
  const defs = categoriesConfig?.categories?.length
    ? categoriesConfig.categories
    : DEFAULT_CATEGORIES;
  for (const def of defs) {
    if (def?.id && def?.color) map.set(def.id, def.color);
  }
  return map;
}

/**
 * Resolves the pill hue for an event with the documented priority chain:
 * context colorRules > categoriesConfig > event.color > undefined (falls
 * through to CSS default).
 */
function resolveAssetColor(ev, categoryColorMap, colorRules) {
  const ruleColor = resolveColor(ev, colorRules);
  if (ruleColor) return ruleColor;
  if (ev.category && categoryColorMap.has(ev.category)) {
    return categoryColorMap.get(ev.category);
  }
  return ev.color;
}

/**
 * Returns the 5-state approval stage id when the event's meta has a known
 * value, otherwise null. Unknown strings are treated as null so the pill
 * renders without a stage-specific CSS class.
 */
function getApprovalStage(ev) {
  const stage = ev?.meta?.approvalStage?.stage;
  return APPROVAL_STAGES.has(stage) ? stage : null;
}

/**
 * Maps an ApprovalStageId to the CSS module class that styles the pill for
 * that stage. Returns '' for null/unknown stages.
 */
function approvalClass(stage) {
  switch (stage) {
    case 'requested':      return styles.stageRequested;
    case 'approved':       return styles.stageApproved;
    case 'finalized':      return styles.stageFinalized;
    case 'pending_higher': return styles.stagePendingHigher;
    case 'denied':         return styles.stageDenied;
    default:               return '';
  }
}

/**
 * Short uppercase label rendered inside a pill to communicate stages that
 * aren't self-evident from title + color (requested / finalized / pending).
 * Approved and denied skip the prefix — approved is the "happy path" and
 * denied is already communicated via strikethrough + fade.
 */
function approvalPrefix(stage) {
  if (stage === 'requested')      return 'REQUESTED';
  if (stage === 'finalized')      return 'FINALIZED';
  if (stage === 'pending_higher') return 'PENDING';
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AssetsView({
  currentDate,
  events: eventsProp,
  onEventClick,
  onDateSelect,
  groupBy,
  onGroupByChange,
  categoriesConfig,
  locationProvider,
  renderAssetLocation,
  collapsedGroups: collapsedGroupsProp,
  onCollapsedGroupsChange,
  assets,
  onEditAssets,
  onRequestAsset,
  approvalsConfig,
  onApprovalAction,
  resolveResourceLabel,
  strictAssetFiltering = false,
}: any) {
  const ctx = useCalendarContext();

  const [auditEvent, setAuditEvent] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const drawerOpenerRef = useRef(null);
  const [approvalMenu, setApprovalMenu] = useState(null);
  const approvalMenuOpenerRef = useRef(null);

  const openApprovalMenu = useCallback((ev, stage, trigger) => {
    const rect = trigger?.getBoundingClientRect?.();
    approvalMenuOpenerRef.current = trigger ?? null;
    setApprovalMenu({
      event: ev,
      stage,
      anchorRect: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null,
    });
  }, []);

  const closeApprovalMenu = useCallback(() => {
    setApprovalMenu(null);
    const opener = approvalMenuOpenerRef.current;
    if (opener && typeof opener.focus === 'function') {
      requestAnimationFrame(() => opener.focus());
    }
    approvalMenuOpenerRef.current = null;
  }, []);

  const handleApprovalActionInternal = useCallback((action) => {
    if (!approvalMenu) return;
    onApprovalAction?.(approvalMenu.event, action);
  }, [approvalMenu, onApprovalAction]);

  const announce = useCallback((msg) => {
    // Appending a zero-width space forces a diff so screen readers re-read
    // even when the same message fires twice in a row.
    setAnnouncement(prev => (prev === msg ? msg + '\u200b' : msg));
  }, []);

  const openAudit = useCallback((ev, opener) => {
    drawerOpenerRef.current = opener ?? null;
    setAuditEvent(ev);
    announce(`Audit history opened for ${ev.title}`);
  }, [announce]);

  const closeAudit = useCallback(() => {
    setAuditEvent(null);
    announce('Audit history closed');
    const opener = drawerOpenerRef.current;
    if (opener && typeof opener.focus === 'function') {
      requestAnimationFrame(() => opener.focus());
    }
    drawerOpenerRef.current = null;
  }, [announce]);

  const activeZoom = 'day';
  const pxPerDay   = DAY_PX_PER_DAY;

  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const days       = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart.toISOString()],
  );
  const totalDays = days.length;

  const categoryColorMap = useMemo(
    () => buildCategoryColorMap(categoriesConfig),
    [categoriesConfig],
  );

  const pillStyle = categoriesConfig?.pillStyle ?? 'hue';

  // ── Keyboard grid navigation ───────────────────────────────────────────────
  const [focusedCell, setFocusedCell] = useState({ rowIdx: 0, dayIdx: 0 });
  const lastKeyNavCell = useRef(false);
  const gridRef        = useRef(null);
  const wrapRef        = useRef(null);

  // ── Virtualization ─────────────────────────────────────────────────────────
  const [scrollState, setScrollState] = useState({ top: 0, height: 2000, left: 0, width: 1200 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScrollState({
      top:    el.scrollTop,
      height: el.clientHeight || 2000,
      left:   el.scrollLeft,
      width:  el.clientWidth  || 1200,
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);

  // Keep the current day in view for the gantt timeline by centering the
  // selected date whenever the month/day scale changes.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const todayIdx = Math.min(
      Math.max(differenceInCalendarDays(startOfDay(currentDate), monthStart), 0),
      Math.max(totalDays - 1, 0),
    );
    const dayCenter = (todayIdx + 0.5) * pxPerDay;
    const targetLeft = Math.max(dayCenter - wrap.clientWidth / 2, 0);
    wrap.scrollLeft = targetLeft;
  }, [currentDate, monthStart, totalDays, pxPerDay]);

  // ── Row source ──
  // When `assets` is provided (first-class registry from owner config),
  // rows come from the registry in its declared order. Any event.resource
  // value not present in the registry falls into an "(Unassigned)" row.
  // When `assets` is absent/empty, preserve the legacy behavior: derive
  // rows from the distinct event.resource values alphabetically.
  const assetRegistry = useMemo(() => {
    return Array.isArray(assets) && assets.length > 0 ? assets : null;
  }, [assets]);

  // id → { label, meta, group } lookup for rendering.
  const assetById = useMemo(() => {
    const map = new Map();
    if (assetRegistry) {
      for (const a of assetRegistry) {
        if (a && typeof a.id === 'string' && a.id) map.set(a.id, a);
      }
    }
    return map;
  }, [assetRegistry]);

  // Strict filtering — when on and a registry is provided, keep only events
  // whose resource matches a registered asset id. Drops both foreign-id events
  // (e.g. employee IDs in a unified calendar) and null/empty-resource events
  // (e.g. team-wide meetings that belong on Schedule, not Assets).
  const events = useMemo(() => {
    if (!strictAssetFiltering || !assetRegistry) return eventsProp;
    return eventsProp.filter(e => {
      const r = e.resource;
      return r != null && r !== '' && assetById.has(r);
    });
  }, [strictAssetFiltering, assetRegistry, assetById, eventsProp]);

  // Toolbar sort order. "registry" preserves declared order (default when a
  // registry is present); "label" / "group" / "lastEvent" resort the rows
  // without mutating the registry itself.
  const [sortMode, setSortMode] = useState('registry');

  // Most recent event end-date per resource (used by the "Last event date"
  // sort). Missing resources sort to the bottom.
  const lastEventByResource = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const key = e.resource ?? '(Unassigned)';
      const ts = e.end instanceof Date ? e.end.getTime() : 0;
      const prev = map.get(key);
      if (prev === undefined || ts > prev) map.set(key, ts);
    }
    return map;
  }, [events]);

  const applySort = useCallback((ids) => {
    if (sortMode === 'registry' || !assetRegistry) return ids;
    const byId = assetById;
    const labelOf = (id) => byId.get(id)?.label ?? id;
    const groupOf = (id) => byId.get(id)?.group ?? '';
    const lastOf  = (id) => lastEventByResource.get(id) ?? -Infinity;
    const copy = [...ids];
    copy.sort((a, b) => {
      // Always keep "(Unassigned)" at the end.
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      if (sortMode === 'label')     return labelOf(a).localeCompare(labelOf(b));
      if (sortMode === 'group')     return groupOf(a).localeCompare(groupOf(b)) || labelOf(a).localeCompare(labelOf(b));
      if (sortMode === 'lastEvent') return lastOf(b) - lastOf(a);
      return 0;
    });
    return copy;
  }, [sortMode, assetRegistry, assetById, lastEventByResource]);

  const resourceList = useMemo(() => {
    if (assetRegistry) {
      const ordered = assetRegistry.map(a => a.id);
      const orderedSet = new Set(ordered);
      const hasOrphan = events.some(e => !orderedSet.has(e.resource ?? '(Unassigned)'));
      const base = hasOrphan ? [...ordered, '(Unassigned)'] : ordered;
      return applySort(base);
    }
    const set = new Set<string>();
    events.forEach(e => set.add(e.resource ?? '(Unassigned)'));
    return [...set].sort((a, b) => {
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      return a.localeCompare(b);
    });
  }, [assetRegistry, events, applySort]);

  // GroupBy options exposed by the toolbar: fixed asset fields + every
  // distinct `meta.*` key seen across the registry. Empty-string value
  // maps to "no grouping".
  const groupByOptions = useMemo(() => {
    const opts = [{ value: '', label: 'None' }];
    if (!assetRegistry) return opts;
    opts.push({ value: 'group', label: 'Group' });
    const metaKeys = new Set();
    for (const a of assetRegistry) {
      if (a?.meta && typeof a.meta === 'object') {
        for (const k of Object.keys(a.meta)) metaKeys.add(k);
      }
    }
    for (const k of [...metaKeys].sort()) {
      opts.push({ value: `meta.${k}`, label: `Meta: ${k}` });
    }
    return opts;
  }, [assetRegistry]);

  const currentGroupByValue = typeof groupBy === 'string' ? groupBy : '';
  const showToolbar = Boolean(assetRegistry) || Boolean(onEditAssets) || Boolean(onRequestAsset);

  // ── Live locations (via LocationProvider) ──────────────────────────────────
  const locations = useResourceLocations(resourceList, locationProvider);

  /**
   * Build one asset row for `resource` given a scoped `subsetEvents`.
   * Row height is computed from the laned events so rows stay tight when
   * most events are filtered into a different group bucket.
   */
  const buildAssetRow = useCallback((resource, subsetEvents) => {
    // "(Unassigned)" bucket catches any event whose resource isn't in the
    // registry (or is missing entirely). Registry rows keep exact-id match.
    const matchesRow = assetRegistry
      ? (e) => {
          const r = e.resource ?? '(Unassigned)';
          if (resource === '(Unassigned)') return !assetById.has(r);
          return r === resource;
        }
      : (e) => (e.resource ?? '(Unassigned)') === resource;
    const resEvents = subsetEvents.filter(matchesRow);
    const { events: laned, laneCount } = assignLanes(resEvents, monthStart, monthEnd);
    const rowH = Math.max(
      laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2,
      ROW_PAD * 2 + LANE_H + 16,
    );
    const firstWithMeta = resEvents.find(e => e.meta?.assetSublabel || e.meta?.sublabel);
    const registryEntry = assetById.get(resource) ?? null;
    const sublabel = firstWithMeta?.meta?.assetSublabel
      ?? firstWithMeta?.meta?.sublabel
      ?? registryEntry?.meta?.sublabel
      ?? null;
    const label = registryEntry?.label
      ?? (resource !== '(Unassigned)' ? resolveResourceLabel?.(resource) : null)
      ?? resource;
    return {
      _type: 'assetRow',
      key: resource,
      resource,
      label,
      sublabel,
      events: laned,
      laneCount,
      rowH,
    };
  }, [monthStart.toISOString(), monthEnd.toISOString(), assetRegistry, assetById, resolveResourceLabel]);

  const sortResourceKeys = useCallback((keys) => {
    return [...keys].sort((a, b) => {
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      return a.localeCompare(b);
    });
  }, []);

  // ── Grouping (TS engine) ───────────────────────────────────────────────────
  const GROUP_HEADER_H = 36;

  const isGrouped = groupBy != null && (
    typeof groupBy === 'string' ? true : Array.isArray(groupBy) ? groupBy.length > 0 : true
  );

  const groupTree = useMemo(() => {
    if (!isGrouped) return null;
    return buildGroupTree(events, groupBy);
  }, [isGrouped, events, groupBy]);

  // Collapse state — controlled via props when provided, otherwise local.
  const [collapsedLocal, setCollapsedLocal] = useState(() => new Set());
  const collapsedControlled = collapsedGroupsProp instanceof Set
    ? collapsedGroupsProp
    : (Array.isArray(collapsedGroupsProp) ? new Set(collapsedGroupsProp) : null);
  const collapsedGroups = collapsedControlled ?? collapsedLocal;

  const toggleGroup = useCallback((path) => {
    if (collapsedControlled && onCollapsedGroupsChange) {
      const next = new Set(collapsedControlled);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      onCollapsedGroupsChange(next);
      return;
    }
    setCollapsedLocal(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      if (onCollapsedGroupsChange) onCollapsedGroupsChange(next);
      return next;
    });
  }, [collapsedControlled, onCollapsedGroupsChange]);

  // Count every leaf event reachable under a group (respecting nested trees).
  const countEvents = useCallback((node) => {
    if (!node.children || node.children.length === 0) return node.events.length;
    return node.children.reduce((sum, c) => sum + countEvents(c), 0);
  }, []);

  // Flat list of rows for virtualization: interleaves groupHeader pseudo-rows
  // with asset rows scoped to the leaf group's events.
  const flatRows = useMemo(() => {
    if (!groupTree) {
      return resourceList.map(r => buildAssetRow(r, events));
    }
    const out = [];
    const walk = (nodes, parentPath) => {
      nodes.forEach((node, i) => {
        const path = parentPath ? `${parentPath}/${node.key}` : node.key;
        const collapsed = collapsedGroups.has(path);
        out.push({
          _type: 'groupHeader',
          groupPath: path,
          groupLabel: node.label,
          field: node.field,
          depth: node.depth,
          collapsed,
          count: countEvents(node),
          posInSet: i + 1,
          setSize: nodes.length,
          rowH: GROUP_HEADER_H,
        });
        if (collapsed) return;
        if (node.children && node.children.length > 0) {
          walk(node.children, path);
        } else {
          // Leaf: build one asset row per distinct resource in this bucket.
          const leafResources = new Set();
          for (const ev of node.events) {
            leafResources.add(ev.resource ?? '(Unassigned)');
          }
          for (const resource of sortResourceKeys(leafResources)) {
            const row = buildAssetRow(resource, node.events);
            // Disambiguate keys when an asset appears in multiple groups.
            out.push({ ...row, key: `${path}::${resource}`, groupPath: path });
          }
        }
      });
    };
    walk(groupTree, '');
    return out;
  }, [groupTree, collapsedGroups, events, resourceList, buildAssetRow, countEvents, sortResourceKeys]);

  // ── Cumulative row offsets ─────────────────────────────────────────────────
  const rowOffsets = useMemo(() => {
    const offsets = [0];
    for (const row of flatRows) offsets.push(offsets[offsets.length - 1] + row.rowH);
    return offsets;
  }, [flatRows]);

  const totalBodyH = rowOffsets[flatRows.length] ?? 0;

  const [visStart, visEnd] = useMemo(() => {
    const { top, height } = scrollState;
    const viewH = height || 2000;
    let s = 0;
    let e = flatRows.length - 1;
    // Binary search for first visible row
    let lo = 0, hi = flatRows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rowOffsets[mid + 1] <= top) { s = mid + 1; lo = mid + 1; } else hi = mid - 1;
    }
    // Binary search for last visible row
    lo = 0; hi = flatRows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rowOffsets[mid] < top + viewH) { e = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return [
      Math.max(0, s - OVERSCAN_ROWS),
      Math.min(flatRows.length - 1, e + OVERSCAN_ROWS),
    ];
  }, [scrollState, rowOffsets, flatRows.length]);

  // Horizontal column virtualization: only render day columns in the viewport.
  const OVERSCAN_COLS = 2;
  const [visColStart, visColEnd] = useMemo(() => {
    const { left, width } = scrollState;
    // The sticky name column (NAME_W px) is always visible; content starts after it.
    const contentLeft = Math.max(0, left - NAME_W);
    const s = Math.floor(contentLeft / pxPerDay);
    const e = Math.ceil((left + width - NAME_W) / pxPerDay);
    return [
      Math.max(0, s - OVERSCAN_COLS),
      Math.min(totalDays - 1, e + OVERSCAN_COLS),
    ];
  }, [scrollState, pxPerDay, totalDays]);

  // ── Keyboard handler ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastKeyNavCell.current) return;
    lastKeyNavCell.current = false;
    const { rowIdx, dayIdx } = focusedCell;

    const wrap = wrapRef.current;
    if (wrap && rowOffsets.length > rowIdx + 1) {
      const rowTop    = rowOffsets[rowIdx];
      const rowBottom = rowOffsets[rowIdx + 1];
      if (rowTop < wrap.scrollTop) {
        wrap.scrollTop = rowTop;
      } else if (rowBottom > wrap.scrollTop + wrap.clientHeight) {
        wrap.scrollTop = rowBottom - wrap.clientHeight;
      }
    }

    const isHeader = flatRows[rowIdx]?._type === 'groupHeader';
    const selector = isHeader
      ? `#assets-gh-${rowIdx}`
      : `[data-cell="${rowIdx}-${dayIdx}"]`;
    const tryFocus = () => {
      const el = gridRef.current?.querySelector(selector);
      el?.focus({ preventScroll: false });
    };
    tryFocus();
    if (!gridRef.current?.querySelector(selector)) {
      requestAnimationFrame(tryFocus);
    }
  }, [focusedCell, rowOffsets, flatRows]);

  const handleCellKeyDown = useCallback((e, ri, di, cellRowEvents, resourceId) => {
    const maxRi = flatRows.length - 1;
    const maxDi = totalDays - 1;
    let nextRi = ri, nextDi = di;
    let move = false;
    switch (e.key) {
      case 'ArrowLeft':  nextDi = Math.max(0, di - 1);     move = true; break;
      case 'ArrowRight': nextDi = Math.min(maxDi, di + 1); move = true; break;
      case 'ArrowUp':    nextRi = Math.max(0, ri - 1);     move = true; break;
      case 'ArrowDown':  nextRi = Math.min(maxRi, ri + 1); move = true; break;
      case 'Home': nextDi = 0;     move = true; break;
      case 'End':  nextDi = maxDi; move = true; break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const hit = cellRowEvents.find(ev => ev._dayStart <= di && ev._dayEnd >= di);
        if (hit) {
          const hitStage = getApprovalStage(hit);
          if (AUDIT_STAGES.has(hitStage)) openAudit(hit, e.currentTarget);
          else onEventClick?.(hit);
        } else {
          const dayDate = days[di];
          onDateSelect?.(startOfDay(dayDate), addDays(startOfDay(dayDate), 1), resourceId);
        }
        return;
      }
      default: return;
    }
    if (move) {
      e.preventDefault();
      lastKeyNavCell.current = true;
      setFocusedCell({ rowIdx: nextRi, dayIdx: nextDi });
    }
  }, [flatRows.length, totalDays, onEventClick, onDateSelect, days, openAudit]);

  /**
   * Header-row keyboard handling:
   *   ArrowUp / ArrowDown — traverse to the previous / next row (header or
   *     data). Preserves `dayIdx` so landing back on a data cell keeps the
   *     column.
   *   ArrowLeft  — if the group is expanded, collapse it; otherwise no-op.
   *   ArrowRight — if the group is collapsed, expand it; otherwise move to
   *     the first child row so the tree pattern flows naturally.
   */
  const handleHeaderArrowKey = useCallback((rowIdx, key) => {
    const row = flatRows[rowIdx];
    if (!row || row._type !== 'groupHeader') return;
    const maxRi = flatRows.length - 1;
    if (key === 'ArrowUp') {
      if (rowIdx <= 0) return;
      lastKeyNavCell.current = true;
      setFocusedCell(prev => ({ rowIdx: rowIdx - 1, dayIdx: prev.dayIdx }));
      return;
    }
    if (key === 'ArrowDown') {
      if (rowIdx >= maxRi) return;
      lastKeyNavCell.current = true;
      setFocusedCell(prev => ({ rowIdx: rowIdx + 1, dayIdx: prev.dayIdx }));
      return;
    }
    if (key === 'ArrowLeft') {
      if (!row.collapsed) toggleGroup(row.groupPath);
      return;
    }
    if (key === 'ArrowRight') {
      if (row.collapsed) { toggleGroup(row.groupPath); return; }
      if (rowIdx >= maxRi) return;
      lastKeyNavCell.current = true;
      setFocusedCell(prev => ({ rowIdx: rowIdx + 1, dayIdx: prev.dayIdx }));
    }
  }, [flatRows, toggleGroup]);

  // ── Toolbar (declared above the empty-state branch so owners can still
  // reach the Edit-assets deep-link when the registry has no rows yet) ──
  const toolbarNode = showToolbar && (
    <div className={styles.toolbar} role="toolbar" aria-label="Assets view controls">
      <div className={styles.toolbarGroup}>
        <label className={styles.toolbarLabel} htmlFor="assets-group-by">Group by</label>
        <select
          id="assets-group-by"
          className={styles.toolbarSelect}
          value={currentGroupByValue}
          onChange={(e) => onGroupByChange?.(e.target.value || null)}
          disabled={!onGroupByChange || groupByOptions.length <= 1}
        >
          {groupByOptions.map(o => (
            <option key={o.value || '__none'} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className={styles.toolbarGroup}>
        <label className={styles.toolbarLabel} htmlFor="assets-sort-by">Sort by</label>
        <select
          id="assets-sort-by"
          className={styles.toolbarSelect}
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value)}
          disabled={!assetRegistry}
        >
          <option value="registry">Registry order</option>
          <option value="label">Label</option>
          <option value="group">Group</option>
          <option value="lastEvent">Last event date</option>
        </select>
      </div>
      <div className={styles.toolbarSpacer} />
      {onRequestAsset && (
        <button
          type="button"
          className={styles.toolbarBtnPrimary}
          onClick={onRequestAsset}
          aria-label="Request asset"
        >
          Request Asset
        </button>
      )}
      {onEditAssets && (
        <button
          type="button"
          className={styles.toolbarBtn}
          onClick={onEditAssets}
          aria-label="Edit assets"
        >
          Edit assets
        </button>
      )}
    </div>
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  if (resourceList.length === 0) {
    return (
      <div className={styles.wrap} ref={wrapRef} data-zoom={activeZoom}>
        {toolbarNode}
        {ctx?.emptyState
          ? ctx.emptyState
          : (
            <div className={styles.empty}>
              <p>No assets to display in {format(currentDate, 'MMMM yyyy')}.</p>
            </div>
          )}
      </div>
    );
  }

  const dayColW = pxPerDay;
  const showDayAbbr = dayColW >= 24;
  const showDayNum  = dayColW >= 12;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrap} ref={wrapRef} data-zoom={activeZoom}>
      {toolbarNode}
      <div
        className={styles.inner}
        style={{ width: NAME_W + totalDays * dayColW }}
        role="grid"
        aria-label={`Assets timeline for ${format(currentDate, 'MMMM yyyy')}`}
        aria-rowcount={flatRows.length + 1}
        aria-colcount={totalDays + 1}
        ref={gridRef}
      >
        {/* ── Sticky header ── */}
        <div className={styles.headerRow} role="row" aria-rowindex={1}>
          <div
            className={styles.cornerCell}
            style={{ width: NAME_W, minWidth: NAME_W }}
            role="columnheader"
            aria-label={`Assets — ${format(currentDate, 'MMMM yyyy')}`}
          >
            <span className={styles.cornerTitle}>
              {format(currentDate, 'MMM yyyy')}
            </span>
          </div>
          <div
            className={styles.dayHeads}
            role="presentation"
            style={{ position: 'relative', width: totalDays * dayColW, flexShrink: 0 }}
          >
            {days.slice(visColStart, visColEnd + 1).map((day, relDi) => {
              const di = visColStart + relDi;
              return (
                <div
                  key={format(day, 'yyyy-MM-dd')}
                  role="columnheader"
                  aria-label={`${format(day, 'EEEE, MMMM d')}${isToday(day) ? ', today' : ''}`}
                  aria-colindex={di + 2}
                  className={[
                    styles.dayHead,
                    isToday(day)   && styles.todayHead,
                    isWeekend(day) && styles.weekendHead,
                  ].filter(Boolean).join(' ')}
                  style={{ position: 'absolute', left: di * dayColW, width: dayColW }}
                >
                  {showDayNum && (
                    <span className={styles.dayNum} aria-hidden="true">{format(day, 'd')}</span>
                  )}
                  {showDayAbbr && (
                    <span className={styles.dayAbbr} aria-hidden="true">{format(day, 'EEE')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div
          className={styles.body}
          role="presentation"
          style={{ position: 'relative', height: totalBodyH }}
        >
          {flatRows.slice(visStart, visEnd + 1).map((rowData, relIdx) => {
            const rowIdx = visStart + relIdx;

            if (rowData._type === 'groupHeader') {
              const topOffset = rowOffsets[rowIdx];
              return (
                <div
                  key={`gh-${rowData.groupPath}`}
                  className={styles.groupHeaderRow}
                  style={{ position: 'absolute', top: topOffset, left: 0, right: 0, height: rowData.rowH }}
                  role="row"
                  aria-rowindex={rowIdx + 2}
                  data-depth={rowData.depth}
                  data-group-path={rowData.groupPath}
                  data-header-idx={rowIdx}
                >
                  <div
                    className={styles.groupHeaderCell}
                    style={{ width: NAME_W + totalDays * dayColW }}
                  >
                    <GroupHeader
                      id={`assets-gh-${rowIdx}`}
                      label={rowData.groupLabel}
                      count={rowData.count}
                      depth={rowData.depth}
                      collapsed={rowData.collapsed}
                      onToggle={() => toggleGroup(rowData.groupPath)}
                      posInSet={rowData.posInSet}
                      setSize={rowData.setSize}
                      fieldLabel={rowData.field}
                      onArrowKey={(key) => handleHeaderArrowKey(rowIdx, key)}
                    />
                  </div>
                </div>
              );
            }

            const { key, resource, label, sublabel, events: rowEvents, rowH } = rowData;
            const displayLabel = label ?? resource;
            const topOffset = rowOffsets[rowIdx];
            const locationData = locations.get(resource) ?? null;

            return (
              <div
                key={key}
                className={styles.row}
                style={{
                  position: 'absolute',
                  top:      topOffset,
                  left:     0,
                  right:    0,
                  height:   rowH,
                  minHeight: rowH,
                }}
                role="row"
                aria-rowindex={rowIdx + 2}
              >
                {/* Sticky asset cell — row header */}
                <div
                  className={styles.nameCell}
                  style={{ width: NAME_W, minWidth: NAME_W, height: rowH }}
                  role="rowheader"
                  aria-label={displayLabel}
                  data-resource={resource}
                >
                  <div className={styles.assetMeta}>
                    <span className={styles.assetRegistration}>{displayLabel}</span>
                    {sublabel && (
                      <span className={styles.assetSublabel}>{sublabel}</span>
                    )}
                  </div>
                  <div
                    className={styles.locationBanner}
                    aria-label={locationData
                      ? `Asset location: ${locationData.text} (${locationData.status})`
                      : 'Asset location'}
                    data-status={locationData?.status ?? 'placeholder'}
                  >
                    {renderAssetLocation
                      ? renderAssetLocation(locationData, { id: resource })
                      : locationData
                        ? <span className={styles.locationText}>{locationData.text}</span>
                        : <span className={styles.locationPlaceholder}>Location —</span>
                    }
                  </div>
                </div>

                {/* Event zone */}
                <div
                  className={styles.eventZone}
                  style={{ width: totalDays * dayColW, height: rowH, position: 'relative' }}
                  role="presentation"
                >
                  {days.slice(visColStart, visColEnd + 1).map((day, relDi) => {
                    const di = visColStart + relDi;
                    return (
                      <div
                        key={di}
                        className={[
                          styles.dayCol,
                          isToday(day)   && styles.todayCol,
                          isWeekend(day) && styles.weekendCol,
                        ].filter(Boolean).join(' ')}
                        style={{ left: di * dayColW, width: dayColW, height: rowH }}
                      />
                    );
                  })}

                  {days.slice(visColStart, visColEnd + 1).map((day, relDi) => {
                    const di = visColStart + relDi;
                    const isFocused  = focusedCell.rowIdx === rowIdx && focusedCell.dayIdx === di;
                    const resourceId = resource;
                    const cellHasEvent = rowEvents.some(ev => ev._dayStart <= di && ev._dayEnd >= di);
                    return (
                      <div
                        key={`kbcell-${di}`}
                        role="gridcell"
                        tabIndex={isFocused ? 0 : -1}
                        data-cell={`${rowIdx}-${di}`}
                        aria-label={`${resource}, ${format(day, 'MMMM d')}${isToday(day) ? ', today' : ''}${cellHasEvent ? '' : ', empty — click to create'}`}
                        aria-rowindex={rowIdx + 2}
                        aria-colindex={di + 2}
                        className={styles.kbCell}
                        style={{ left: di * dayColW, width: dayColW, top: 0, height: rowH }}
                        onKeyDown={e => handleCellKeyDown(e, rowIdx, di, rowEvents, resourceId)}
                        onClick={() => {
                          setFocusedCell({ rowIdx, dayIdx: di });
                          if (!cellHasEvent) {
                            onDateSelect?.(startOfDay(day), addDays(startOfDay(day), 1), resourceId);
                          }
                        }}
                      />
                    );
                  })}

                  {/* Event pills */}
                  {rowEvents.map(ev => {
                    const evColor = resolveAssetColor(ev, categoryColorMap, ctx?.colorRules);
                    const left    = ev._dayStart * dayColW + 2;
                    const width   = Math.max(dayColW - 4, (ev._dayEnd - ev._dayStart + 1) * dayColW - 4);
                    const top     = ROW_PAD + ev._lane * (LANE_H + LANE_GAP);
                    const stage       = getApprovalStage(ev);
                    const onClick = (e) => {
                      if (AUDIT_STAGES.has(stage)) openAudit(ev, e.currentTarget);
                      else onEventClick?.(ev);
                    };
                    const prefix      = approvalPrefix(stage);
                    const statusClass = ev.status === 'cancelled' ? styles.cancelled
                      : ev.status === 'tentative' ? styles.tentative : '';

                    const approvalActions = stage
                      ? allowedActionsFor(stage, approvalsConfig)
                      : [];
                    const showCaret = approvalActions.length > 0
                      && typeof onApprovalAction === 'function';

                    const ariaLabel = [
                      ev.title,
                      ev.category && `category ${ev.category}`,
                      stage && `stage ${stage.replace('_', ' ')}`,
                      ev.status && ev.status !== 'confirmed' && ev.status,
                    ].filter(Boolean).join(', ');

                    return (
                      <div key={ev.id} style={{ display: 'contents' }}>
                        <button
                          className={[
                            styles.event,
                            styles[`pill_${pillStyle}`] || styles.pill_hue,
                            approvalClass(stage),
                            statusClass,
                          ].filter(Boolean).join(' ')}
                          style={{ left, top, width, height: LANE_H, '--ev-color': evColor }}
                          onClick={onClick}
                          aria-label={ariaLabel}
                          data-stage={stage || undefined}
                        >
                          {prefix && (
                            <span className={styles.stagePrefix} aria-hidden="true">{prefix}</span>
                          )}
                          <span className={styles.evTitle}>{ev.title}</span>
                          {(ev._dayEnd - ev._dayStart + 1) * dayColW >= 60 && ev.category && (
                            <span className={styles.evCat} aria-hidden="true">{ev.category}</span>
                          )}
                        </button>
                        {showCaret && (
                          <button
                            className={styles.stageCaret}
                            style={{
                              left: left + width - 18,
                              top:  top + (LANE_H - 16) / 2,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openApprovalMenu(ev, stage, e.currentTarget);
                            }}
                            aria-haspopup="menu"
                            aria-expanded={approvalMenu?.event?.id === ev.id}
                            aria-label={`Approval actions for ${ev.title}`}
                            data-stage={stage}
                          >
                            ▾
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AuditDrawer
        event={auditEvent}
        onClose={closeAudit}
        approvalsConfig={approvalsConfig}
        onAction={
          auditEvent && typeof onApprovalAction === 'function'
            ? (action) => onApprovalAction(auditEvent, action)
            : undefined
        }
      />
      {approvalMenu && (
        <ApprovalActionMenu
          stage={approvalMenu.stage}
          approvalsConfig={approvalsConfig}
          anchorRect={approvalMenu.anchorRect}
          onAction={handleApprovalActionInternal}
          onClose={closeApprovalMenu}
          labelledBy={undefined}
        />
      )}
      <div
        className={styles.srOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="assets-announcer"
      >
        {announcement}
      </div>
    </div>
  );
}
