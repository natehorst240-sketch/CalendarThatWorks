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
import { useCalendarContext, resolveColor } from '../core/CalendarContext.js';
import EmployeeActionCard from '../ui/EmployeeActionCard.jsx';
import styles from './TimelineView.module.css';
import { useGrouping } from '../hooks/useGrouping.js';
import { buildFieldAccessor } from '../grouping/buildFieldAccessor.js';

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimelineView({
  currentDate,
  events,
  onEventClick,
  onDateSelect,
  employees = [],
  onCallCategory = 'on-call',
  onEmployeeAdd,
  onEmployeeDelete,
  onShiftStatusChange,
  onCoverageAssign,
  onEmployeeAction,
  groupBy,
}) {
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
  const nameInputRef                    = useRef(null);
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
    onEmployeeAdd?.({ id: `emp-${Date.now()}`, name: trimmed, role: addRole.trim() || undefined });
    setAddName('');
    setAddRole('');
    setAddFormOpen(false);
  }, [addName, addRole, onEmployeeAdd]);

  // ── Row source: employees list OR derive from event resources ──────────────

  const useEmployees = employees && employees.length > 0;

  const resourceList = useMemo(() => {
    if (useEmployees) return null; // not used
    const set = new Set();
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
        const isOnCallEv = ev.category === onCallCategory || ev.meta?.onCall === true;
        if (!isOnCallEv || !ev.meta?.shiftStatus || !ev.meta?.coveredBy) return;
        const coverId = String(ev.meta.coveredBy);
        if (!coveringMap.has(coverId)) coveringMap.set(coverId, []);
        const origEmp = employees.find(e => e.id === (ev.resource ?? ''));
        const clampedStart = max([startOfDay(ev.start), monthStart]);
        const clampedEnd   = min([startOfDay(ev.end),   monthEnd]);
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
      return employees.map((emp, idx) => {
        const eventsForRow = events.filter(e => (e.resource ?? '') === emp.id);
        const { events: laned, laneCount } = assignLanes(eventsForRow, monthStart, monthEnd);

        const coveringPills  = coveringMap.get(emp.id) ?? [];
        const hasStatusPills = laned.some(ev =>
          (ev.category === onCallCategory || ev.meta?.onCall === true) && !!ev.meta?.shiftStatus
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
  }, [useEmployees, employees, resourceList, events, monthStart.toISOString(), monthEnd.toISOString(), onCallCategory, totalDays]);

  // ── Grouping ───────────────────────────────────────────────────────────────
  const GROUP_HEADER_H = 36;
  const fieldAccessor = useMemo(
    () => groupBy ? buildFieldAccessor(groupBy, useEmployees ? 'employee' : 'resource') : null,
    [groupBy, useEmployees],
  );
  const { flatRows, groupOrder, collapsedGroups, toggleGroup, isGrouped } = useGrouping(rows, {
    groupBy, fieldAccessor, groupHeaderHeight: GROUP_HEADER_H,
  });

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

  if (rows.length === 0) {
    if (ctx?.emptyState) return <>{ctx.emptyState}</>;
    return (
      <div className={styles.empty}>
        <p>No {useEmployees ? 'employees' : 'events'} to display in {format(currentDate, 'MMMM yyyy')}.</p>
      </div>
    );
  }

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
                <input
                  className={styles.addPersonInput}
                  placeholder="Role (optional)"
                  value={addRole}
                  onChange={e => setAddRole(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitAddForm(); if (e.key === 'Escape') setAddFormOpen(false); }}
                />
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
              return (
                <div
                  key={`gh-${rowData.groupKey}`}
                  className={styles.groupHeaderRow}
                  style={{ position: 'absolute', top: topOffset, left: 0, right: 0, height: rowData.rowH }}
                  role="row"
                  aria-rowindex={rowIdx + 2}
                >
                  <div className={styles.groupHeaderCell} style={{ width: NAME_W + totalDays * DAY_W }}>
                    <button
                      className={styles.groupToggleBtn}
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
                    .filter(ev => (ev.category === onCallCategory || ev.meta?.onCall === true) && ev.meta?.shiftStatus)
                    .map(ev => {
                      const left  = ev._dayStart * DAY_W + 2;
                      const width = Math.max(DAY_W - 4, (ev._dayEnd - ev._dayStart + 1) * DAY_W - 4);
                      const top   = baseH + 3;
                      const isCovered = !!ev.meta?.coveredBy;
                      const coveredByEmp = isCovered
                        ? employees.find(e => e.id === String(ev.meta.coveredBy))
                        : null;
                      const coveredByName = coveredByEmp?.name ?? 'Someone';

                      if (isCovered) {
                        return (
                          <div
                            key={`sp-${ev.id}`}
                            className={[styles.coveragePill, styles.coveragePillCovered].join(' ')}
                            style={{ left, top, width, height: COVERAGE_PILL_H }}
                            title={`Shift covered by ${coveredByName}`}
                          >
                            ✓ Shift covered by {coveredByName}
                          </div>
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
          <p className={styles.coverPopoverTitle}>Who will cover this shift?</p>
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
