/**
 * TimelineView.jsx — Horizontal employee / resource timeline.
 *
 * Layout:
 *   Rows    = employees (or resources, when no employees prop)
 *   Columns = days of the month
 *   Events  = horizontal bars spanning their day(s)
 *
 * Props:
 *   employees       Array<{ id, name, color?, role? }>
 *                   When provided, rows are employee-defined and matched via
 *                   event.resource === employee.id.  Pass [] to fall back to
 *                   resource-derived rows.
 *   onCallCategory  Category string that marks on-call shift events.
 *                   Default: 'on-call'.  These get a striped background style.
 *
 * Performance:
 *   Row virtualization — only rows inside the visible viewport ± OVERSCAN_ROWS
 *   are rendered.  The body container is sized to the full total height so the
 *   scrollbar is correct and each row is absolutely positioned at its offset.
 */
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, isToday, isWeekend,
  differenceInCalendarDays, startOfDay, addDays, min, max,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import EmployeeActionCard from '../ui/EmployeeActionCard';
import styles from './TimelineView.module.css';
import { buildGroupTree } from '../hooks/useGrouping.ts';
import { useTouchDnd } from '../hooks/useTouchDnd';
import { normalizeScheduleKind, SCHEDULE_KINDS } from '../core/scheduleModel';

// ─── Layout constants ─────────────────────────────────────────────────────────

const NAME_W   = 188;  // px — left column (wider to fit avatar + role)
const DAY_W    = 52;   // px — each day column
const LANE_H   = 26;   // px — each event lane
const LANE_GAP = 3;    // px — gap between lanes
const ROW_PAD  = 8;    // px — top/bottom padding per row

// Virtualization: rows above and below the visible area to keep rendered
const OVERSCAN_ROWS    = 3;
const COVERAGE_PILL_H  = 22;   // px — height of shift-coverage status pills
const COVERAGE_BAND    = COVERAGE_PILL_H + 6; // pill + gap above next band

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function employeeColor(emp, idx) {
  if (emp.color) return emp.color;
  return `hsl(${Math.round((idx * 137.508) % 360)}, 55%, 45%)`;
}

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

// Matches any event that represents a shift or on-call bar, whether it was
// tagged via category (legacy seed events) or via meta.kind / meta.onCall
// (events created by ScheduleEditorForm or mirrored coverage).  Used so the
// shift-status pills render for user-created shifts, not just seeded ones.
function isShiftOrOnCallLikeEvent(ev, onCallCategory) {
  const kind = normalizeScheduleKind(ev?.meta?.kind ?? ev?.kind);
  return ev?.category === onCallCategory
    || ev?.meta?.onCall === true
    || kind === SCHEDULE_KINDS.SHIFT
    || kind === SCHEDULE_KINDS.ON_CALL;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimelineView({
  currentDate,
  events,
  onEventClick,
  onEventGroupChange,
  onDateSelect,
  employees = [],
  onCallCategory = 'on-call',
  onEmployeeAdd,
  onEmployeeDelete,
  onShiftStatusChange,
  onCoverageAssign,
  onEmployeeAction,
  groupBy,
  sort,
  roles = [],
  bases = [],
}: any) {
  const ctx        = useCalendarContext();

  // ── Shift coverage menu state ─────────────────────────────────────────────
  const [shiftMenu, setShiftMenu] = useState(null); // { ev, rect } | null
  const [coverMenu, setCoverMenu] = useState(null); // { ev, rect } | null
  const [empCard,   setEmpCard]   = useState(null); // { emp, rect } | null
  const shiftMenuRef = useRef(null);
  const coverMenuRef = useRef(null);

  const triggerEmployeeAction = useCallback((empId, action, options = {}) => {
    if (!onEmployeeAction) return false;
    onEmployeeAction(empId, typeof action === 'string' ? { type: action, ...options } : action);
    return true;
  }, [onEmployeeAction]);

  const anyMenuOpen = !!(shiftMenu || coverMenu);
  useEffect(() => {
    if (!anyMenuOpen) return;
    function handler(e) {
      if (shiftMenuRef.current && !shiftMenuRef.current.contains(e.target)) setShiftMenu(null);
      if (coverMenuRef.current && !coverMenuRef.current.contains(e.target)) setCoverMenu(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anyMenuOpen]);

  // ── Add-person form state ─────────────────────────────────────────────────
  const [addFormOpen, setAddFormOpen]   = useState(false);
  const [addName,     setAddName]       = useState('');
  const [addRole,     setAddRole]       = useState('');
  const [addBase,     setAddBase]       = useState('');
  const nameInputRef                    = useRef(null);

  // ── Base filter ───────────────────────────────────────────────────────────
  const [baseFilter, setBaseFilter]     = useState('');
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const days       = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart.toISOString()],
  );
  const totalDays = days.length;

  // ── Keyboard grid navigation ───────────────────────────────────────────────
  const [focusedCell, setFocusedCell] = useState({ rowIdx: 0, dayIdx: 0 });
  const lastKeyNavCell = useRef(false);
  const gridRef        = useRef(null); // ref on .inner (for querySelector)
  const wrapRef        = useRef(null); // ref on .wrap (scroll container)

  // ── DnD: drag an event from one row to another to reassign it. ────────────
  // The drag source is the <button> around an event; the drop target is the
  // owning row.  dragRef carries { ev, sourceRowKey } across handler calls so
  // onDrop can skip same-row drops.
  const dragRef = useRef(null);
  const [dropTargetKey, setDropTargetKey] = useState(null);

  // Touch-drag pathway (mobile).  Mirrors the HTML5 DnD branch using long-press
  // + elementFromPoint hit-testing.  Drop targets are rows with `data-wc-drop`.
  const bindTouchDnd = useTouchDnd({
    enabled: !!onEventGroupChange,
    dropAttr: 'data-wc-drop',
    onStart: ({ ev, sourceRowKey }) => { dragRef.current = { ev, sourceRowKey }; },
    onOver:  (dropEl) => {
      const key = dropEl?.getAttribute('data-wc-drop') ?? null;
      setDropTargetKey(prev => (prev === key ? prev : key));
    },
    onDrop:  (dropEl, { ev, sourceRowKey }) => {
      dragRef.current = null;
      setDropTargetKey(null);
      if (!dropEl || !onEventGroupChange) return;
      const targetKey = dropEl.getAttribute('data-wc-drop');
      if (!targetKey || targetKey === sourceRowKey) return;
      // Row key is either the employee id (when `employees` is provided) or
      // the resource string.  `(Unassigned)` maps to null to clear the field.
      const isEmployeeRow = (employees ?? []).some(e => e.id === targetKey);
      const patch = { resource: isEmployeeRow
        ? targetKey
        : (targetKey === '(Unassigned)' ? null : targetKey),
      };
      onEventGroupChange(ev, patch);
    },
    onCancel: () => { dragRef.current = null; setDropTargetKey(null); },
  });

  // ── Virtualization: track scroll position + viewport size ─────────────────
  // Default height is large so that tests (clientHeight = 0) see all rows.
  const [scrollState, setScrollState] = useState({ top: 0, height: 2000 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const update = () => {
      setScrollState({
        top:    el.scrollTop,
        height: el.clientHeight || 2000,
      });
    };

    update(); // initial measurement

    el.addEventListener('scroll', update, { passive: true });

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null;
    ro?.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (addFormOpen) nameInputRef.current?.focus();
  }, [addFormOpen]);

  const submitAddForm = useCallback(() => {
    const trimmed = addName.trim();
    if (!trimmed) return;
    onEmployeeAdd?.({
      id:   `emp-${Date.now()}`,
      name: trimmed,
      role: addRole || undefined,
      base: addBase || undefined,
    });
    setAddName('');
    setAddRole('');
    setAddBase('');
    setAddFormOpen(false);
  }, [addName, addRole, addBase, onEmployeeAdd]);

  // ── Row source: employees list OR derive from event resources ──────────────

  // When a base filter is active, show only employees assigned to that base.
  const displayEmployees = useMemo(() => {
    if (!baseFilter || !employees?.length) return employees;
    return employees.filter(e => String(e.base ?? '') === baseFilter);
  }, [employees, baseFilter]);

  const useEmployees = employees && employees.length > 0;

  const resourceList = useMemo(() => {
    if (useEmployees) return null; // not used
    const set = new Set<string>();
    events.forEach(e => set.add(e.resource ?? '(Unassigned)'));
    return [...set].sort((a, b) => {
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      return a.localeCompare(b);
    });
  }, [useEmployees, events]);

  // Build row data
  const rows = useMemo(() => {
    // Pre-compute: which employee is covering which shifts (for covering-for pills)
    const coveringMap = new Map(); // empId → [{ ev, origEmpName, _dayStart, _dayEnd }]
    if (useEmployees) {
      events.forEach(ev => {
        if (!isShiftOrOnCallLikeEvent(ev, onCallCategory)) return;
        if (!ev.meta?.shiftStatus || !ev.meta?.coveredBy) return;
        const coverId = String(ev.meta.coveredBy);
        if (!coveringMap.has(coverId)) coveringMap.set(coverId, []);
        const origEmp = displayEmployees.find(e => String(e.id) === String(ev.resource ?? ''));
        // Clamp to the PTO request window (meta.requestStart/End) so the
        // "covering for" pill only spans the days actually needing coverage,
        // not the entire underlying shift.
        const reqStart = ev.meta?.requestStart ? new Date(ev.meta.requestStart) : ev.start;
        const reqEnd   = ev.meta?.requestEnd   ? new Date(ev.meta.requestEnd)   : ev.end;
        const clampedStart = max([startOfDay(reqStart), monthStart]);
        const clampedEnd   = min([startOfDay(reqEnd),   monthEnd]);
        if (clampedStart > clampedEnd) return;
        const ds = differenceInCalendarDays(clampedStart, monthStart);
        const de = differenceInCalendarDays(clampedEnd,   monthStart);
        coveringMap.get(coverId).push({
          ev,
          origEmpName: origEmp?.name ?? 'Someone',
          _dayStart:   Math.max(0, ds),
          _dayEnd:     Math.min(totalDays - 1, de),
        });
      });
    }

    if (useEmployees) {
      return displayEmployees.map((emp, idx) => {
        const eventsForRow = events.filter(e => String(e.resource ?? '') === String(emp.id));
        const { events: laned, laneCount } = assignLanes(eventsForRow, monthStart, monthEnd);

        const coveringPills  = coveringMap.get(String(emp.id)) ?? [];
        const hasStatusPills = laned.some(ev =>
          isShiftOrOnCallLikeEvent(ev, onCallCategory) && !!ev.meta?.shiftStatus
        );

        const baseH = Math.max(
          laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2,
          ROW_PAD * 2 + LANE_H + 16,
        );
        const extraH = (hasStatusPills ? COVERAGE_BAND : 0)
                     + (coveringPills.length > 0 ? COVERAGE_BAND : 0);

        return {
          key: emp.id, emp, empIdx: idx,
          events: laned, laneCount,
          rowH: baseH + extraH,
          baseH, coveringPills, hasStatusPills,
        };
      });
    }

    return resourceList.map(resource => {
      const resEvents = events.filter(
        e => (e.resource ?? '(Unassigned)') === resource,
      );
      const { events: laned, laneCount } = assignLanes(resEvents, monthStart, monthEnd);
      const rowH = laneCount * (LANE_H + LANE_GAP) + ROW_PAD * 2;
      return {
        key: resource, emp: null, empIdx: 0, resource,
        events: laned, laneCount,
        rowH, baseH: rowH, coveringPills: [], hasStatusPills: false,
      };
    });
  }, [useEmployees, displayEmployees, resourceList, events, monthStart.toISOString(), monthEnd.toISOString(), onCallCategory, totalDays]);

  // ── Grouping ───────────────────────────────────────────────────────────────
  // Routes through the TS event-level engine (buildGroupTree). TimelineView
  // rows are employees/resources, so we synthesize one pseudo-event per row
  // carrying the row's source fields; the engine buckets by those fields and
  // we walk the resulting tree to emit the legacy flatRows shape consumed by
  // the render path below.
  const GROUP_HEADER_H = 36;
  const isGrouped = groupBy != null && (
    (typeof groupBy === 'string' && groupBy.length > 0)
    || (Array.isArray(groupBy) && groupBy.length > 0)
  );

  const pseudoEvents = useMemo(() => {
    if (!isGrouped) return [];
    return rows.map(row => {
      const base = useEmployees ? (row.emp || {}) : (row.events?.[0] || {});
      return { ...base, meta: base.meta || {}, __row: row };
    });
  }, [isGrouped, rows, useEmployees]);

  const groupTree = useMemo(() => {
    if (!isGrouped) return [];
    return buildGroupTree(pseudoEvents, groupBy);
  }, [isGrouped, pseudoEvents, groupBy]);

  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const toggleGroup = useCallback((path) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const { flatRows, groupOrder } = useMemo(() => {
    if (!isGrouped || rows.length === 0 || groupTree.length === 0) {
      return { flatRows: rows, groupOrder: [] };
    }
    const out = [];
    const order = [];
    const countLeaves = (node) => {
      if (node.children.length === 0) return node.events.length;
      let s = 0;
      for (const c of node.children) s += countLeaves(c);
      return s;
    };
    const walk = (nodes, parentPath) => {
      for (const node of nodes) {
        const path = parentPath ? `${parentPath}/${node.key}` : node.key;
        order.push(path);
        const collapsed = collapsedGroups.has(path);
        out.push({
          _type:      'groupHeader',
          groupKey:   path,
          groupLabel: node.label,
          depth:      node.depth,
          collapsed,
          rowH:       GROUP_HEADER_H,
          count:      countLeaves(node),
        });
        if (collapsed) continue;
        if (node.children.length > 0) walk(node.children, path);
        else for (const ev of node.events) out.push(ev.__row);
      }
    };
    walk(groupTree, '');
    return { flatRows: out, groupOrder: order };
  }, [isGrouped, rows, groupTree, collapsedGroups]);

  // ── Cumulative row offsets (for absolute positioning + scroll math) ────────
  const rowOffsets = useMemo(() => {
    const offsets = [0];
    for (const row of flatRows) offsets.push(offsets[offsets.length - 1] + row.rowH);
    return offsets;
  }, [flatRows]);

  const totalBodyH = rowOffsets[flatRows.length] ?? 0;

  // ── Visible row window ─────────────────────────────────────────────────────
  const [visStart, visEnd] = useMemo(() => {
    const { top, height } = scrollState;
    const viewH = height || 2000;
    let s = 0;
    let e = flatRows.length - 1;
    for (let i = 0; i < flatRows.length; i++) {
      if (rowOffsets[i + 1] <= top) s = i + 1;
    }
    for (let i = flatRows.length - 1; i >= 0; i--) {
      if (rowOffsets[i] < top + viewH) { e = i; break; }
    }
    return [
      Math.max(0, s - OVERSCAN_ROWS),
      Math.min(flatRows.length - 1, e + OVERSCAN_ROWS),
    ];
  }, [scrollState, rowOffsets, flatRows.length]);

  // ── Keyboard grid navigation ───────────────────────────────────────────────

  useEffect(() => {
    if (!lastKeyNavCell.current) return;
    lastKeyNavCell.current = false;
    const { rowIdx, dayIdx } = focusedCell;

    // Scroll the target row into the visible viewport if needed
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

    // Focus the keyboard cell — try immediately (works when row already rendered),
    // then via rAF after any scroll-triggered re-render.
    const tryFocus = () => {
      const el = gridRef.current?.querySelector(`[data-cell="${rowIdx}-${dayIdx}"]`);
      el?.focus({ preventScroll: false });
    };
    tryFocus();
    if (!gridRef.current?.querySelector(`[data-cell="${rowIdx}-${dayIdx}"]`)) {
      requestAnimationFrame(tryFocus);
    }
  }, [focusedCell, rowOffsets]);

  const handleCellKeyDown = useCallback((e, ri, di, cellRowEvents, resourceId) => {
    const maxRi = flatRows.length - 1;
    const maxDi = totalDays - 1;
    let nextRi = ri, nextDi = di;
    let move = false;
    switch (e.key) {
      case 'ArrowLeft':  nextDi = Math.max(0, di - 1);     move = true; break;
      case 'ArrowRight': nextDi = Math.min(maxDi, di + 1); move = true; break;
      case 'ArrowUp': {
        nextRi = ri - 1;
        while (nextRi >= 0 && flatRows[nextRi]?._type === 'groupHeader') nextRi--;
        nextRi = Math.max(0, nextRi);
        if (flatRows[nextRi]?._type === 'groupHeader') nextRi = ri;
        move = true; break;
      }
      case 'ArrowDown': {
        nextRi = ri + 1;
        while (nextRi <= maxRi && flatRows[nextRi]?._type === 'groupHeader') nextRi++;
        nextRi = Math.min(maxRi, nextRi);
        if (flatRows[nextRi]?._type === 'groupHeader') nextRi = ri;
        move = true; break;
      }
      case 'Home':       nextDi = 0;                        move = true; break;
      case 'End':        nextDi = maxDi;                    move = true; break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        // Activate the first event whose day range includes di
        const hit = cellRowEvents.find(ev => ev._dayStart <= di && ev._dayEnd >= di);
        if (hit) {
          onEventClick?.(hit);
        } else {
          // Empty cell — trigger creation for this resource + day
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
  }, [flatRows, totalDays, onEventClick, onDateSelect, days]);

  // ── Empty state ────────────────────────────────────────────────────────────
  // When a base filter is active and the filter bar can offer recovery, keep
  // the chrome mounted so the user can clear the filter. Without this branch
  // the view short-circuits into a bare empty message and traps the user in
  // the filtered view (issue #192).
  const filterTrappedEmpty = useEmployees
    && bases.length > 0
    && baseFilter !== ''
    && rows.length === 0
    && (employees?.length ?? 0) > 0;

  if (rows.length === 0 && !filterTrappedEmpty) {
    if (ctx?.emptyState) return <>{ctx.emptyState}</>;
    return (
      <div className={styles.empty}>
        <p>No {useEmployees ? 'employees' : 'events'} to display in {format(currentDate, 'MMMM yyyy')}.</p>
      </div>
    );
  }

  const activeBaseName = filterTrappedEmpty
    ? (bases.find(b => b.id === baseFilter)?.name ?? baseFilter)
    : '';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div
        className={styles.inner}
        style={{ width: NAME_W + totalDays * DAY_W }}
        role="grid"
        aria-label={`Timeline for ${format(currentDate, 'MMMM yyyy')}`}
        aria-rowcount={flatRows.length + 1}
        aria-colcount={totalDays + 1}
        ref={gridRef}
      >

        {/* ── Sticky header ── */}
        <div className={styles.headerRow} role="row" aria-rowindex={1}>
          <div
            className={styles.cornerCell}
            style={{ width: NAME_W, minWidth: NAME_W, position: 'relative' }}
            role="columnheader"
            aria-label={format(currentDate, 'MMMM yyyy')}
          >
            {format(currentDate, 'MMMM yyyy')}
            {onEmployeeAdd && (
              <button
                className={styles.addPersonBtn}
                onClick={() => setAddFormOpen(v => !v)}
                title="Add person"
                aria-label="Add person"
              >+</button>
            )}
            {/* Add-person form dropdown */}
            {addFormOpen && (
              <div className={styles.addPersonForm} role="dialog" aria-label="Add person">
                <input
                  ref={nameInputRef}
                  className={styles.addPersonInput}
                  placeholder="Name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitAddForm(); if (e.key === 'Escape') setAddFormOpen(false); }}
                />
                {roles.length > 0 ? (
                  <select
                    className={styles.addPersonInput}
                    value={addRole}
                    onChange={e => setAddRole(e.target.value)}
                  >
                    <option value="">— select role —</option>
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <input
                    className={styles.addPersonInput}
                    placeholder="Role"
                    value={addRole}
                    onChange={e => setAddRole(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitAddForm(); if (e.key === 'Escape') setAddFormOpen(false); }}
                  />
                )}
                {bases.length > 0 && (
                  <select
                    className={styles.addPersonInput}
                    value={addBase}
                    onChange={e => setAddBase(e.target.value)}
                  >
                    <option value="">— no base —</option>
                    {bases.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                <div className={styles.addPersonActions}>
                  <button className={styles.addPersonSave} onClick={submitAddForm}>Add</button>
                  <button className={styles.addPersonCancel} onClick={() => setAddFormOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          <div className={styles.dayHeads} role="presentation">
            {days.map((day, di) => (
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
                style={{ width: DAY_W, minWidth: DAY_W }}
              >
                <span className={styles.dayNum} aria-hidden="true">{format(day, 'd')}</span>
                <span className={styles.dayAbbr} aria-hidden="true">{format(day, 'EEE')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Base filter bar ── */}
        {bases.length > 0 && (
          <div className={styles.baseFilterBar} role="toolbar" aria-label="Filter by base">
            <button
              className={[styles.baseFilterBtn, !baseFilter && styles.baseFilterActive].filter(Boolean).join(' ')}
              onClick={() => setBaseFilter('')}
            >All</button>
            {bases.map(b => (
              <button
                key={b.id}
                className={[styles.baseFilterBtn, baseFilter === b.id && styles.baseFilterActive].filter(Boolean).join(' ')}
                onClick={() => setBaseFilter(prev => prev === b.id ? '' : b.id)}
              >{b.name}</button>
            ))}
          </div>
        )}

        {filterTrappedEmpty && (
          <div className={styles.filterEmptyState} role="status" aria-live="polite">
            <p>No employees assigned to <strong>{activeBaseName}</strong>.</p>
            <button
              type="button"
              className={styles.filterEmptyClear}
              onClick={() => setBaseFilter('')}
            >Show all locations</button>
          </div>
        )}

        {/* ── Body (virtualized rows) ── */}
        <div
          className={styles.body}
          role="presentation"
          style={{ position: 'relative', height: totalBodyH }}
        >
          {flatRows.slice(visStart, visEnd + 1).map((rowData, relIdx) => {
            const rowIdx  = visStart + relIdx;

            // Render group header pseudo-rows
            if (rowData._type === 'groupHeader') {
              const topOffset = rowOffsets[rowIdx];
              const depth = rowData.depth ?? 0;
              const indent = depth * 16; // matches GroupHeader's INDENT_PX_PER_LEVEL
              return (
                <div
                  key={`gh-${rowData.groupKey}`}
                  className={styles.groupHeaderRow}
                  style={{ position: 'absolute', top: topOffset, left: 0, right: 0, height: rowData.rowH }}
                  role="row"
                  aria-rowindex={rowIdx + 2}
                  aria-level={depth + 1}
                  data-depth={depth}
                >
                  <div className={styles.groupHeaderCell} style={{ width: NAME_W + totalDays * DAY_W }}>
                    <button
                      className={styles.groupToggleBtn}
                      style={{ paddingLeft: 8 + indent }}
                      onClick={() => toggleGroup(rowData.groupKey)}
                      aria-expanded={!rowData.collapsed}
                      aria-label={`${rowData.collapsed ? 'Expand' : 'Collapse'} group ${rowData.groupLabel}`}
                    >
                      <span className={styles.groupChevron} data-collapsed={rowData.collapsed || undefined}>&#9656;</span>
                      <span className={styles.groupLabel}>{rowData.groupLabel}</span>
                      <span className={styles.groupCount}>{rowData.count}</span>
                    </button>
                  </div>
                </div>
              );
            }

            const { key, emp, empIdx, resource, events: rowEvents, rowH, baseH, coveringPills, hasStatusPills } = rowData;
            const label = emp ? emp.name : resource;
            const color = emp ? employeeColor(emp, empIdx) : null;
            const topOffset = rowOffsets[rowIdx];

            // Drop-target wiring: only active when a consumer wires
            // onEventGroupChange.  The row owns both the visual highlight
            // and the drop handler.
            const rowDndEnabled = !!onEventGroupChange;
            const isDropTarget  = rowDndEnabled && dropTargetKey === key;
            const rowClassName  = [styles.row, isDropTarget && styles.dropTarget].filter(Boolean).join(' ');

            const onRowDragOver = rowDndEnabled
              ? (e) => {
                  if (!dragRef.current) return;
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                  if (dropTargetKey !== key) setDropTargetKey(key);
                }
              : undefined;
            const onRowDragLeave = rowDndEnabled
              ? () => { if (dropTargetKey === key) setDropTargetKey(null); }
              : undefined;
            const onRowDrop = rowDndEnabled
              ? (e) => {
                  e.preventDefault();
                  const drag = dragRef.current;
                  dragRef.current = null;
                  setDropTargetKey(null);
                  if (!drag || drag.sourceRowKey === key) return;
                  // Reassign the event to this row.  When rows are employees,
                  // key is the employee id; when rows are resource-derived,
                  // key is the resource string itself.
                  const patch = { resource: emp ? emp.id : (resource === '(Unassigned)' ? null : resource) };
                  onEventGroupChange(drag.ev, patch);
                }
              : undefined;

            return (
              <div
                key={key}
                className={rowClassName}
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
                data-drop-target={isDropTarget || undefined}
                data-wc-drop={rowDndEnabled ? key : undefined}
                onDragOver={onRowDragOver}
                onDragLeave={onRowDragLeave}
                onDrop={onRowDrop}
              >
                {/* Sticky name / employee cell — row header */}
                <div
                  className={styles.nameCell}
                  style={{ width: NAME_W, minWidth: NAME_W, height: rowH }}
                  role="rowheader"
                  aria-label={label}
                >
                  {emp ? (
                    /* Employee display: avatar + name + role */
                    <>
                      {onEmployeeAction ? (
                        <button
                          className={styles.empEntryBtn}
                          onClick={e => {
                            e.stopPropagation();
                            const rect = e.currentTarget.closest(`.${styles.nameCell}`)?.getBoundingClientRect()
                              ?? e.currentTarget.getBoundingClientRect();
                            setEmpCard({ emp, rect });
                          }}
                          title={`Primary workflow: open employee actions for ${emp.name}`}
                          aria-label={`Actions for ${emp.name}`}
                          aria-haspopup="dialog"
                        >
                          <div
                            className={styles.empAvatar}
                            style={{ background: color }}
                            aria-hidden="true"
                          >
                            {emp.avatar
                              ? <img src={emp.avatar} alt="" className={styles.empAvatarImg} />
                              : getInitials(emp.name)
                            }
                          </div>
                          <span className={styles.nameInfo}>
                            <span className={styles.empName}>{emp.name}</span>
                            {emp.role && <span className={styles.empRole}>{emp.role}</span>}
                            {emp.base && !baseFilter && (() => {
                              const b = bases.find(x => x.id === emp.base);
                              return b ? <span className={styles.empBase}>{b.name}</span> : null;
                            })()}
                          </span>
                        </button>
                      ) : (
                        <>
                          <div
                            className={styles.empAvatar}
                            style={{ background: color }}
                            aria-hidden="true"
                          >
                            {emp.avatar
                              ? <img src={emp.avatar} alt="" className={styles.empAvatarImg} />
                              : getInitials(emp.name)
                            }
                          </div>
                          <div className={styles.nameInfo}>
                            <span className={styles.empName}>{emp.name}</span>
                            {emp.role && <span className={styles.empRole}>{emp.role}</span>}
                            {emp.base && !baseFilter && (() => {
                              const b = bases.find(x => x.id === emp.base);
                              return b ? <span className={styles.empBase}>{b.name}</span> : null;
                            })()}
                          </div>
                        </>
                      )}
                      {onEmployeeDelete && (
                        <button
                          className={styles.removeEmpBtn}
                          onClick={e => { e.stopPropagation(); onEmployeeDelete(emp.id); }}
                          title={`Secondary action: remove ${emp.name}`}
                          aria-label={`Remove ${emp.name}`}
                        >×</button>
                      )}
                    </>
                  ) : (
                    <span className={styles.resourceName}>{label}</span>
                  )}
                </div>

                {/* Event zone — contains day background bands + keyboard cells + event bars */}
                <div
                  className={styles.eventZone}
                  style={{ width: totalDays * DAY_W, height: rowH, position: 'relative' }}
                  role="presentation"
                >
                  {/* Day column backgrounds (pointer-events: none in CSS) */}
                  {days.map((day, di) => (
                    <div
                      key={di}
                      className={[
                        styles.dayCol,
                        isToday(day)   && styles.todayCol,
                        isWeekend(day) && styles.weekendCol,
                      ].filter(Boolean).join(' ')}
                      style={{ left: di * DAY_W, width: DAY_W, height: rowH }}
                    />
                  ))}

                  {/* Per-day keyboard cells — keyboard-navigable and mouse-clickable for creation */}
                  {days.map((day, di) => {
                    const isFocused    = focusedCell.rowIdx === rowIdx && focusedCell.dayIdx === di;
                    const resourceId   = emp ? emp.id : resource;
                    const cellHasEvent = rowEvents.some(ev => ev._dayStart <= di && ev._dayEnd >= di);
                    return (
                      <div
                        key={`kbcell-${di}`}
                        role="gridcell"
                        tabIndex={isFocused ? 0 : -1}
                        data-cell={`${rowIdx}-${di}`}
                        aria-label={`${label}, ${format(day, 'MMMM d')}${isToday(day) ? ', today' : ''}${cellHasEvent ? '' : ', empty — click to create'}`}
                        aria-rowindex={rowIdx + 2}
                        aria-colindex={di + 2}
                        className={styles.kbCell}
                        style={{ left: di * DAY_W, width: DAY_W, top: 0, height: rowH }}
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

                  {/* Event bars */}
                  {rowEvents.map(ev => {
                    const isOnCall = ev.category === onCallCategory || ev.meta?.onCall === true;
                    const evColor  = isOnCall
                      ? (color ?? resolveColor(ev, ctx?.colorRules))
                      : resolveColor(ev, ctx?.colorRules);

                    const left    = ev._dayStart * DAY_W + 2;
                    const width   = Math.max(DAY_W - 4, (ev._dayEnd - ev._dayStart + 1) * DAY_W - 4);
                    const top     = ROW_PAD + ev._lane * (LANE_H + LANE_GAP);
                    const onClick = () => onEventClick?.(ev);

                    const statusClass = ev.status === 'cancelled' ? styles.cancelled
                      : ev.status === 'tentative' ? styles.tentative : '';
                    const ariaLabel = `${ev.title}${ev.category ? `, ${ev.category}` : ''}${ev.status && ev.status !== 'confirmed' ? `, ${ev.status}` : ''}`;

                    // Event-level DnD: each event button is a drag source when
                    // onEventGroupChange is wired.  On-call/coverage toggles
                    // stay draggable too — dragging is separate from clicking.
                    const evDndEnabled = rowDndEnabled;
                    const onEvDragStart = evDndEnabled
                      ? (e) => {
                          dragRef.current = { ev, sourceRowKey: key };
                          if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = 'move';
                            try { e.dataTransfer.setData('text/plain', String(ev.id)); } catch {}
                          }
                        }
                      : undefined;
                    const onEvDragEnd = evDndEnabled
                      ? () => { dragRef.current = null; setDropTargetKey(null); }
                      : undefined;
                    const onEvTouchStart = evDndEnabled
                      ? (e) => bindTouchDnd(e, { ev, sourceRowKey: key })
                      : undefined;

                    if (ctx?.renderEvent) {
                      const custom = ctx.renderEvent(ev, {
                        view: 'timeline', isCompact: true, onClick, color: evColor,
                      });
                      if (custom != null) {
                        return (
                          <div
                            key={ev.id}
                            className={[styles.event, isOnCall && styles.onCall, statusClass].filter(Boolean).join(' ')}
                            style={{ left, top, width, height: LANE_H, '--ev-color': evColor }}
                            role="button" tabIndex={0} aria-label={ariaLabel}
                            draggable={evDndEnabled || undefined}
                            onDragStart={onEvDragStart}
                            onDragEnd={onEvDragEnd}
                            onTouchStart={onEvTouchStart}
                            onClick={onClick}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
                          >
                            {custom}
                          </div>
                        );
                      }
                    }

                    // On-call events: wrapper div so we can nest the status-toggle button
                    if (isOnCall && onShiftStatusChange) {
                      const hasStatus = !!ev.meta?.shiftStatus;
                      return (
                        <div
                          key={ev.id}
                          className={[styles.eventWrap, styles.onCall, statusClass].filter(Boolean).join(' ')}
                          style={{ left, top, width, height: LANE_H, '--ev-color': evColor }}
                        >
                          <button
                            className={[styles.event, styles.eventFill, styles.onCall, statusClass].filter(Boolean).join(' ')}
                            style={{ '--ev-color': evColor }}
                            draggable={evDndEnabled || undefined}
                            onDragStart={onEvDragStart}
                            onDragEnd={onEvDragEnd}
                            onTouchStart={onEvTouchStart}
                            onClick={onClick}
                            aria-label={ariaLabel}
                          >
                            <span className={styles.onCallIcon} aria-hidden="true">🌙</span>
                            <span className={styles.evTitle}>{ev.title}</span>
                            {hasStatus && (
                              <span className={styles.shiftStatusBadge}>
                                {ev.meta.shiftStatus === 'pto' ? 'PTO' : 'Unavail.'}
                              </span>
                            )}
                          </button>
                          <button
                            className={[styles.shiftStatusBtn, hasStatus && styles.hasStatus].filter(Boolean).join(' ')}
                            onClick={e => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setShiftMenu(prev => prev?.ev?.id === ev.id ? null : { ev, rect });
                            }}
                            title="Shift-only availability shortcut"
                            aria-label="Set shift availability"
                          >
                            {hasStatus ? '⚠' : '▾'}
                          </button>
                        </div>
                      );
                    }

                    // Default (non-on-call or no callback)
                    return (
                      <button
                        key={ev.id}
                        className={[styles.event, isOnCall && styles.onCall, statusClass].filter(Boolean).join(' ')}
                        style={{ left, top, width, height: LANE_H, '--ev-color': evColor }}
                        draggable={evDndEnabled || undefined}
                        onDragStart={onEvDragStart}
                        onDragEnd={onEvDragEnd}
                        onTouchStart={onEvTouchStart}
                        onClick={onClick}
                        aria-label={ariaLabel}
                      >
                        {isOnCall
                          ? <span className={styles.onCallIcon} aria-hidden="true">🌙</span>
                          : <span className={styles.evDot} aria-hidden="true" />
                        }
                        <span className={styles.evTitle}>{ev.title}</span>
                        {!isOnCall && (ev._dayEnd - ev._dayStart + 1) >= 3 && ev.category && (
                          <span className={styles.evCat} aria-hidden="true">{ev.category}</span>
                        )}
                      </button>
                    );
                  })}

                  {/* ── Shift coverage status pills (below event lanes) ── */}
                  {rowEvents
                    .filter(ev => isShiftOrOnCallLikeEvent(ev, onCallCategory) && ev.meta?.shiftStatus)
                    .map(ev => {
                      const reqStart = ev.meta?.requestStart ? new Date(ev.meta.requestStart) : ev.start;
                      const reqEnd   = ev.meta?.requestEnd   ? new Date(ev.meta.requestEnd)   : ev.end;
                      // Use startOfDay (matches assignLanes) so this pill spans the same
                      // day range as the PTO/unavailable event pill it mirrors.
                      const pillDayStart = differenceInCalendarDays(max([startOfDay(reqStart), monthStart]), monthStart);
                      const pillDayEnd   = differenceInCalendarDays(min([startOfDay(reqEnd), monthEnd]), monthStart);
                      const left  = pillDayStart * DAY_W + 2;
                      const width = Math.max(DAY_W - 4, (pillDayEnd - pillDayStart + 1) * DAY_W - 4);
                      const top   = baseH + 3;
                      const isCovered = !!ev.meta?.coveredBy;
                      const coveredByEmp = isCovered
                        ? employees.find(e => String(e.id) === String(ev.meta.coveredBy))
                        : null;
                      const coveredByName = coveredByEmp?.name ?? 'Someone';

                      if (isCovered) {
                        return (
                          <button
                            key={`sp-${ev.id}`}
                            className={[styles.coveragePill, styles.coveragePillCovered].join(' ')}
                            style={{ left, top, width, height: COVERAGE_PILL_H }}
                            onClick={e => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setCoverMenu(prev => prev?.ev?.id === ev.id ? null : { ev, rect });
                            }}
                            title={`Shift covered by ${coveredByName}`}
                            aria-label={`Shift covered by ${coveredByName} — click to edit coverage`}
                          >
                            ✓ Shift covered by {coveredByName}
                          </button>
                        );
                      }
                      return (
                        <button
                          key={`sp-${ev.id}`}
                          className={[styles.coveragePill, styles.coveragePillUncovered].join(' ')}
                          style={{ left, top, width, height: COVERAGE_PILL_H }}
                          onClick={e => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCoverMenu(prev => prev?.ev?.id === ev.id ? null : { ev, rect });
                          }}
                          aria-label="Shift not covered — click to assign coverage"
                          title="Click to assign coverage"
                        >
                          ⚠ Shift not covered / Available
                        </button>
                      );
                    })
                  }

                  {/* ── Covering-for pills (for the employee covering someone else) ── */}
                  {coveringPills.map(({ ev: covEv, origEmpName, _dayStart, _dayEnd }) => {
                    const left  = _dayStart * DAY_W + 2;
                    const width = Math.max(DAY_W - 4, (_dayEnd - _dayStart + 1) * DAY_W - 4);
                    const top   = baseH + 3 + (hasStatusPills ? COVERAGE_BAND : 0);
                    return (
                      <div
                        key={`cf-${covEv.id}`}
                        className={[styles.coveragePill, styles.coveragePillCovering].join(' ')}
                        style={{ left, top, width, height: COVERAGE_PILL_H }}
                        title={`On call (covering for ${origEmpName})`}
                      >
                        📞 On call (covering for {origEmpName})
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* ── Shift status dropdown menu ── */}
      {shiftMenu && (
        <div
          ref={shiftMenuRef}
          className={styles.shiftMenu}
          style={{ top: shiftMenu.rect.bottom + 4, left: shiftMenu.rect.left }}
        >
          <button
            className={styles.shiftMenuItem}
            onClick={() => {
              const handled = triggerEmployeeAction(
                shiftMenu.ev.resource ?? shiftMenu.ev.employeeId,
                'pto',
                { source: 'shift-quick-action', sourceShift: shiftMenu.ev },
              );
              if (!handled) onShiftStatusChange?.(shiftMenu.ev, 'pto');
              setShiftMenu(null);
            }}
          >
            Shift-only shortcut: Mark PTO
          </button>
          <button
            className={styles.shiftMenuItem}
            onClick={() => {
              const handled = triggerEmployeeAction(
                shiftMenu.ev.resource ?? shiftMenu.ev.employeeId,
                'unavailable',
                { source: 'shift-quick-action', sourceShift: shiftMenu.ev },
              );
              if (!handled) onShiftStatusChange?.(shiftMenu.ev, 'unavailable');
              setShiftMenu(null);
            }}
          >
            Shift-only shortcut: Mark Unavailable
          </button>
          {shiftMenu.ev.meta?.shiftStatus && (
            <>
              <div className={styles.shiftMenuDivider} />
              <button className={[styles.shiftMenuItem, styles.shiftMenuItemClear].join(' ')} onClick={() => { onShiftStatusChange?.(shiftMenu.ev, null); setShiftMenu(null); }}>
                ✕ Clear Status
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Coverage picker popover ── */}
      {coverMenu && (
        <div
          ref={coverMenuRef}
          className={styles.coverPopover}
          style={{ top: coverMenu.rect.bottom + 4, left: coverMenu.rect.left }}
        >
          <p className={styles.coverPopoverTitle}>
            {coverMenu.ev?.meta?.coveredBy ? 'Edit shift coverage' : 'Who will cover this shift?'}
          </p>
          {coverMenu.ev?.meta?.coveredBy && (
            <button
              className={styles.coverEmpBtn}
              onClick={() => { onCoverageAssign?.(coverMenu.ev, null); setCoverMenu(null); }}
            >
              ✕ Remove coverage (mark shift as available)
            </button>
          )}
          {employees.filter(e => e.id !== (coverMenu.ev.resource ?? '')).length === 0 ? (
            <p className={styles.coverPopoverEmpty}>No other employees available.</p>
          ) : (
            employees
              .filter(e => e.id !== (coverMenu.ev.resource ?? ''))
              .map((emp, idx) => (
                <button
                  key={emp.id}
                  className={styles.coverEmpBtn}
                  onClick={() => { onCoverageAssign?.(coverMenu.ev, emp.id); setCoverMenu(null); }}
                >
                  <span
                    className={styles.coverEmpAvatar}
                    style={{ background: employeeColor(emp, idx) }}
                    aria-hidden="true"
                  >
                    {emp.avatar
                      ? <img src={emp.avatar} alt="" className={styles.coverEmpAvatarImg} />
                      : getInitials(emp.name)
                    }
                  </span>
                  {emp.name}{emp.role ? ` — ${emp.role}` : ''}
                </button>
              ))
          )}
        </div>
      )}

      {/* ── Employee action card ── */}
      {empCard && onEmployeeAction && (
        <EmployeeActionCard
          emp={empCard.emp}
          anchorRect={empCard.rect}
          onAction={action => onEmployeeAction(empCard.emp.id, action)}
          onClose={() => setEmpCard(null)}
        />
      )}
    </div>
  );
}
