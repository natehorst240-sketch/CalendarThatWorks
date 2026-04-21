import type { DragEvent, TouchEvent } from 'react';
import { useMemo, useState, useCallback, useRef } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, isSameDay, isToday, startOfDay,
} from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import { displayEndDay } from '../core/layout';
import { buildGroupTree } from '../hooks/useGrouping.ts';
import { useTouchDnd } from '../hooks/useTouchDnd';
import type { GroupByInput } from '../hooks/useNormalizedConfig.ts';
import type { NormalizedEvent } from '../types/events';
import type { CalendarViewEvent } from '../types/ui';
import GroupHeader from '../ui/GroupHeader.tsx';
import styles from './AgendaView.module.css';

type GroupTreeNode = {
  key: string;
  label: string;
  field: string;
  depth: number;
  events: CalendarViewEvent[];
  children: GroupTreeNode[];
};

type LeafEventEntry = {
  ev: CalendarViewEvent;
  nativePath: string;
  nativeLabel: string;
};

type AgendaViewProps = {
  currentDate: Date;
  events: CalendarViewEvent[];
  onEventClick?: (event: CalendarViewEvent) => void;
  onEventGroupChange?: (event: CalendarViewEvent, patch: Record<string, string | null>) => void;
  groupBy?: GroupByInput;
  sort?: unknown;
  showAllGroups?: boolean;
  employees?: Array<{ id?: string; name?: string; displayName?: string }>;
};

export default function AgendaView({
  currentDate,
  events,
  onEventClick,
  onEventGroupChange,
  groupBy,
  sort,
  showAllGroups = false,
  employees,
}: AgendaViewProps) {
  const ctx = useCalendarContext();

  // Resolve resource IDs (e.g. "emp-sarah") to display names (e.g. "Sarah Chen").
  // Falls back to the raw ID when no match — preserves fleet/asset datasets
  // where the resource ID is already the tail number or asset name.
  const resourceLabelFor = useMemo(() => {
    const list = Array.isArray(employees) ? employees : [];
    const byId = new Map(list.map((m) => [String(m.id), m.name || m.displayName || m.id]));
    return (id: string | number | null | undefined) => byId.get(String(id)) ?? String(id);
  }, [employees]);

  const days = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end   = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  // When an upstream `sort` is set, trust the incoming order and skip the
  // default chronological resort so user sort wins. When no sort is set,
  // keep the historical start-time ordering per day.
  const hasSort = Array.isArray(sort) ? sort.length > 0 : !!sort;

  // Multi-day events should appear on every day they cover, not just their
  // start day (#148). displayEndDay handles iCal's exclusive DTEND convention
  // and the midnight-boundary edge case used by MonthView. Clamp the end so
  // zero-duration all-day events (start === end) still render on their start day.
  const grouped = useMemo(() => {
    return days
      .map((day) => {
        const dayMs = day.getTime();
        const dayEvents = events.filter((e) => {
          const startMs = startOfDay(e.start).getTime();
          const endMs   = Math.max(displayEndDay(e).getTime(), startMs);
          return dayMs >= startMs && dayMs <= endMs;
        });
        return {
          day,
          events: hasSort
            ? dayEvents
            : [...dayEvents].sort((a, b) => a.start.getTime() - b.start.getTime()),
        };
      })
      .filter((g) => g.events.length > 0);
  }, [days, events, hasSort]);

  // Per-day group trees built from the event-level grouping engine. Pure —
  // no collapse state baked in; that lives in local React state below.
  const dayTrees = useMemo(() => {
    if (!groupBy) return null;
    return grouped.map(({ day, events: dayEvents }) => ({
      day,
      tree: buildGroupTree(dayEvents as never, groupBy) as GroupTreeNode[],
    }));
  }, [grouped, groupBy]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const toggleGroup = useCallback((path: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Active drag state: tracks the event being dragged and its native leaf path
  // so onDrop handlers can decide whether to emit a change.
  const dragRef = useRef<{ ev: CalendarViewEvent; nativePath: string | null } | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  // Walk a tree along a slashed path (relative to parentPath/day) and collect
  // the { field: value } patch implied by landing in that leaf. "(Ungrouped)"
  // keys map to null to clear the field.
  const resolveDropPatch = useCallback((tree: GroupTreeNode[] | null, targetPath: string | null, dayKey: string) => {
    if (!tree || !targetPath) return null;
    const parts = targetPath.split('/');
    if (parts[0] === dayKey) parts.shift();
    const patch: Record<string, string | null> = {};
    let level = tree;
    for (const keyPart of parts) {
      const match = level.find(g => g.key === keyPart);
      if (!match) return null;
      patch[match.field] = match.key === '(Ungrouped)' ? null : match.key;
      level = match.children;
    }
    return patch;
  }, []);

  // Touch-drag pathway (mobile).  Mirrors the HTML5 DnD branch above using
  // long-press + elementFromPoint hit-testing.  See useTouchDnd.
  const bindTouchDnd = useTouchDnd({
    enabled: !!onEventGroupChange,
    dropAttr: 'data-wc-drop',
    onStart: ({ ev, nativePath }: { ev: CalendarViewEvent; nativePath: string | null }) => { dragRef.current = { ev, nativePath }; },
    onOver:  (dropEl: Element | null) => {
      const path = dropEl?.getAttribute('data-wc-drop') ?? null;
      setDropTargetPath(prev => (prev === path ? prev : path));
    },
    onDrop:  (
      dropEl: Element | null,
      { ev, nativePath, dayTree, dayKey }: { ev: CalendarViewEvent; nativePath: string | null; dayTree: GroupTreeNode[] | null; dayKey: string },
    ) => {
      dragRef.current = null;
      setDropTargetPath(null);
      if (!dropEl || !onEventGroupChange) return;
      const targetPath = dropEl.getAttribute('data-wc-drop');
      if (!targetPath || targetPath === nativePath) return;
      const patch = resolveDropPatch(dayTree, targetPath, dayKey);
      if (patch) onEventGroupChange(ev, patch);
    },
    onCancel: () => { dragRef.current = null; setDropTargetPath(null); },
  });

  function renderEventItem(ev: CalendarViewEvent, opts: { crossGroup?: boolean; sourceLabel?: string | null; nativePath?: string | null; dayTree?: GroupTreeNode[] | null; dayKey?: string | null } = {}) {
    const { crossGroup = false, sourceLabel = null, nativePath = null, dayTree = null, dayKey = null } = opts;
    const color = resolveColor(ev as NormalizedEvent, ctx?.colorRules);
    const evStartDay = startOfDay(ev.start);
    const rawEndDay  = displayEndDay(ev);
    const evEndDay   = rawEndDay < evStartDay ? evStartDay : rawEndDay;
    const isMultiDay = !isSameDay(evStartDay, evEndDay);
    const onClick = () => onEventClick?.(ev);
    const statusClass = ev.status === 'cancelled' ? styles.cancelled
      : ev.status === 'tentative' ? styles.tentative : '';
    const className = [
      styles.event,
      statusClass,
      crossGroup && styles.crossGroup,
    ].filter(Boolean).join(' ');
    // Unique key per (event, render-slot) so cross-group duplication doesn't
    // collide with the native instance.
    const key = crossGroup ? `${ev.id}::${sourceLabel ?? ''}` : ev.id;

    // Only native (non-cross-group) renders are draggable — dragging a dimmed
    // shadow copy would be ambiguous.
    const dndEnabled = !!onEventGroupChange && !crossGroup && !!nativePath;
    const onDragStart = dndEnabled
      ? (e: DragEvent<HTMLElement>) => {
          dragRef.current = { ev, nativePath };
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(ev.id)); } catch {}
          }
        }
      : undefined;
    const onDragEnd = dndEnabled ? () => { dragRef.current = null; setDropTargetPath(null); } : undefined;
    const onTouchStart = dndEnabled
      ? (e: TouchEvent<HTMLElement>) => bindTouchDnd(e, { ev, nativePath, dayTree, dayKey })
      : undefined;

    if (ctx?.renderEvent) {
      const custom = ctx.renderEvent(ev as NormalizedEvent, { view: 'agenda', isCompact: true, onClick, color });
      if (custom != null) {
        return (
          <div
            key={key}
            className={className}
            data-cross-group={crossGroup || undefined}
            draggable={dndEnabled || undefined}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onTouchStart={onTouchStart}
            onClick={onClick}
          >
            {custom}
          </div>
        );
      }
    }

    return (
      <button
        key={key}
        className={className}
        data-cross-group={crossGroup || undefined}
        draggable={dndEnabled || undefined}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onTouchStart={onTouchStart}
        onClick={onClick}
        aria-label={crossGroup && sourceLabel ? `${ev.title} (from ${sourceLabel})` : undefined}
      >
        <span className={styles.evDot} style={{ background: color }} />
        <div className={styles.evBody}>
          <span className={styles.evTitle}>{ev.title}</span>
          <div className={styles.evMeta}>
            {!ev.allDay && !isMultiDay && (
              <span>{format(ev.start, 'h:mm a')} – {format(ev.end, 'h:mm a')}</span>
            )}
            {!ev.allDay && isMultiDay && (
              <span>{format(ev.start, 'MMM d, h:mm a')} → {format(ev.end, 'MMM d, h:mm a')}</span>
            )}
            {ev.allDay && !isMultiDay && <span>All day</span>}
            {ev.allDay && isMultiDay && (
              <span>All day · {format(evStartDay, 'MMM d')} → {format(evEndDay, 'MMM d')}</span>
            )}
            {ev.category && <span className={styles.cat}>{ev.category}</span>}
            {ev.resource && <span>{resourceLabelFor(ev.resource)}</span>}
            {crossGroup && sourceLabel && (
              <span className={styles.sourceBadge} aria-hidden="true">
                from {sourceLabel}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  // Count every leaf event reachable under a group (respecting nested trees).
  function countEvents(group: GroupTreeNode): number {
    if (group.children.length === 0) return group.events.length;
    return group.children.reduce((sum, c) => sum + countEvents(c), 0);
  }

  // Collect all leaf events in a tree, paired with their native path.
  function collectLeafEvents(tree: GroupTreeNode[], parentPath: string): LeafEventEntry[] {
    const out: LeafEventEntry[] = [];
    for (const group of tree) {
      const path = parentPath ? `${parentPath}/${group.key}` : group.key;
      if (group.children.length === 0) {
        for (const ev of group.events) out.push({ ev, nativePath: path, nativeLabel: group.label });
      } else {
        out.push(...collectLeafEvents(group.children, path));
      }
    }
    return out;
  }

  function renderGroupNode(
    group: GroupTreeNode,
    parentPath: string,
    posInSet: number,
    setSize: number,
    allLeafEvents: LeafEventEntry[],
    dayTree: GroupTreeNode[] | null,
  ) {
    const path = parentPath ? `${parentPath}/${group.key}` : group.key;
    const collapsed = collapsedGroups.has(path);
    const total = countEvents(group);
    const isLeaf = group.children.length === 0;

    // When showAllGroups is on, a leaf bucket renders every leaf event that
    // exists in this day's tree — with non-matching events marked crossGroup.
    const dayKey = path.split('/')[0];
    const renderedEvents = (() => {
      if (!isLeaf) return null;
      if (!showAllGroups) return group.events.map((ev) => renderEventItem(ev, { nativePath: path, dayTree, dayKey }));
      return allLeafEvents.map(({ ev, nativePath, nativeLabel }) => {
        const isNative = nativePath === path;
        return renderEventItem(ev, {
          crossGroup: !isNative,
          sourceLabel: isNative ? null : nativeLabel,
          nativePath,
          dayTree,
          dayKey,
        });
      });
    })();

    // Leaf groups are drop targets when onEventGroupChange is wired up.
    const dndEnabled = isLeaf && !!onEventGroupChange;
    const isDropTarget = dndEnabled && dropTargetPath === path;

    const onDragOver = dndEnabled
      ? (e: DragEvent<HTMLDivElement>) => {
          if (!dragRef.current) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          if (dropTargetPath !== path) setDropTargetPath(path);
        }
      : undefined;
    const onDragLeave = dndEnabled
      ? () => { if (dropTargetPath === path) setDropTargetPath(null); }
      : undefined;
    const onDrop = dndEnabled
      ? (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          const drag = dragRef.current;
          dragRef.current = null;
          setDropTargetPath(null);
          if (!drag) return;
          if (drag.nativePath === path) return;
          const patch = resolveDropPatch(dayTree, path, dayKey);
          if (!patch) return;
          onEventGroupChange(drag.ev, patch);
        }
      : undefined;

    const className = [styles.subGroup, isDropTarget && styles.dropTarget].filter(Boolean).join(' ');

    return (
      <div
        key={path}
        className={className}
        role="group"
        data-drop-target={isDropTarget || undefined}
        data-wc-drop={dndEnabled ? path : undefined}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <GroupHeader
          label={group.label}
          count={total}
          depth={group.depth}
          collapsed={collapsed}
          onToggle={() => toggleGroup(path)}
          posInSet={posInSet}
          setSize={setSize}
          fieldLabel={group.field}
        />
        {!collapsed && (
          isLeaf
            ? renderedEvents
            : group.children.map((child, i) =>
                renderGroupNode(child, path, i + 1, group.children.length, allLeafEvents, dayTree),
              )
        )}
      </div>
    );
  }

  if (grouped.length === 0) {
    if (ctx?.emptyState) return <>{ctx.emptyState}</>;
    return (
      <div className={styles.empty}>
        No events in {format(currentDate, 'MMMM yyyy')}
      </div>
    );
  }

  return (
    <div className={styles.agenda}>
      {grouped.map(({ day, events: dayEvents }, idx) => {
        const dayKey = format(day, 'yyyy-MM-dd');
        const tree = dayTrees?.[idx]?.tree ?? null;
        const allLeafEvents = tree ? collectLeafEvents(tree, dayKey) : [];
        return (
          <div key={dayKey} className={styles.group}>
            <div className={[styles.dateHead, isToday(day) && styles.today].filter(Boolean).join(' ')}>
              <span className={styles.dayName}>{format(day, 'EEE')}</span>
              <span className={styles.dayNum}>{format(day, 'd')}</span>
              <span className={styles.monthLabel}>{format(day, 'MMM yyyy')}</span>
            </div>
            <div className={styles.events} role={tree && tree.length > 0 ? 'tree' : undefined}>
              {tree && tree.length > 0
                ? tree.map((g, i) =>
                    renderGroupNode(g, dayKey, i + 1, tree.length, allLeafEvents, tree),
                  )
                : dayEvents.map((ev) => renderEventItem(ev))
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
