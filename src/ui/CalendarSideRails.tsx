import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Bookmark, CalendarPlus, Download, Filter, Plus, Settings, Sparkles, Upload } from 'lucide-react';
import { LeftRail, type LeftRailAction } from './LeftRail';
import { RightPanel, RightPanelSection, CrewOnShiftList } from './RightPanel';
import { exportVisibleEvents } from '../core/calendarViewConfig';
import type { EmployeeRecord } from '../WorksCalendar.types';
import type { NormalizedEvent } from '../types/events';
import type { SidebarTab } from './FilterGroupSidebar';

/** Slice of `useOwnerConfig`'s return that the rails need. */
interface OwnerCfgSlice {
  isOwner: boolean;
  setConfigOpen: Dispatch<SetStateAction<boolean>>;
}

interface CalendarLeftRailProps {
  ownerCfg: OwnerCfgSlice;
  leftRailExtras: readonly LeftRailAction[] | undefined;
  setSidebarInitialTab: Dispatch<SetStateAction<SidebarTab>>;
  setSidebarOpen: (v: boolean) => void;
  // ── Actions migrated from the deleted SubToolbar / AppHeader cluster ──
  hasAddButton?: boolean;
  hasScheduleTemplates?: boolean;
  hasImport?: boolean;
  visibleEvents: readonly NormalizedEvent[];
  onAddEvent: () => void;
  onAddSchedule: () => void;
  onOpenImport: () => void;
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

export function CalendarLeftRail({
  ownerCfg, leftRailExtras, setSidebarInitialTab, setSidebarOpen,
  hasAddButton, hasScheduleTemplates, hasImport, visibleEvents,
  onAddEvent, onAddSchedule, onOpenImport,
  editMode, onToggleEditMode,
}: CalendarLeftRailProps) {
  const builtIn: LeftRailAction[] = [
    ...(hasAddButton ? [{
      id: 'wc-add-event',
      label: 'Add new event',
      hint: 'Create a new event',
      icon: <Plus size={18} aria-hidden="true" />,
      onClick: onAddEvent,
    }] : []),
    ...(hasAddButton && hasScheduleTemplates ? [{
      id: 'wc-add-schedule',
      label: 'Add schedule from template',
      hint: 'Bulk-create events from a template',
      icon: <CalendarPlus size={18} aria-hidden="true" />,
      onClick: onAddSchedule,
    }] : []),
    { id: 'saved-views', label: 'Saved views', hint: 'Manage your view library', icon: <Bookmark size={18} aria-hidden="true" />, onClick: () => { setSidebarInitialTab('saved'); setSidebarOpen(true); } },
    { id: 'focus', label: 'Focus filters', hint: 'Narrow the calendar by region, base, role, or category', icon: <Filter size={18} aria-hidden="true" />, onClick: () => { setSidebarInitialTab('focus'); setSidebarOpen(true); } },
    ...(hasImport ? [{
      id: 'wc-import',
      label: 'Import .ics calendar',
      hint: 'Import events from a .ics file',
      icon: <Upload size={18} aria-hidden="true" />,
      onClick: onOpenImport,
    }] : []),
    {
      id: 'wc-export',
      label: 'Export to Excel',
      hint: 'Download visible events as .xlsx',
      icon: <Download size={18} aria-hidden="true" />,
      onClick: () => { void exportVisibleEvents([...visibleEvents]); },
    },
    ...(ownerCfg.isOwner && onToggleEditMode ? [{
      id: 'wc-edit-mode',
      label: editMode ? 'Exit edit mode' : 'Enter edit mode',
      hint: editMode ? 'Stop customizing events' : 'Customize events',
      icon: <Sparkles size={18} aria-hidden="true" />,
      ...(editMode ? { active: true } : {}),
      onClick: onToggleEditMode,
    }] : []),
    ...(ownerCfg.isOwner ? [{
      id: 'settings',
      label: 'Settings',
      hint: 'Calendar configuration',
      icon: <Settings size={18} aria-hidden="true" />,
      onClick: () => ownerCfg.setConfigOpen(true),
    }] : []),
  ];
  const reservedIds = new Set(builtIn.map((a) => a.id));
  return (
    <LeftRail
      actions={[
        ...builtIn,
        ...(leftRailExtras ?? []).filter((extra) => !reservedIds.has(extra.id)),
      ]}
    />
  );
}

interface CalendarRightPanelProps {
  configuredEmployees: EmployeeRecord[];
  onShiftIds: ReadonlySet<string>;
  rightPanelExtras: ReactNode;
}

export function CalendarRightPanel({
  configuredEmployees, onShiftIds, rightPanelExtras,
}: CalendarRightPanelProps) {
  // Only surface the "Crew on shift" section when there's actually a team
  // configured — otherwise an embedder with no employees (e.g. a solo
  // maintenance calendar) is stuck staring at a "No team members
  // configured yet" panel they can't act on.
  const hasCrew = configuredEmployees.length > 0;
  return (
    <RightPanel>
      {hasCrew && (
        <RightPanelSection title="Crew on shift">
          <CrewOnShiftList employees={configuredEmployees} onShiftIds={onShiftIds} />
        </RightPanelSection>
      )}
      {rightPanelExtras}
    </RightPanel>
  );
}

/** Whether the built-in right panel has anything to show. The host omits the
 *  panel entirely when this is false so the calendar reclaims the width
 *  instead of reserving space for an empty rail. */
export function hasRightPanelContent(
  configuredEmployees: readonly EmployeeRecord[],
  rightPanelExtras: ReactNode,
): boolean {
  return configuredEmployees.length > 0 || rightPanelExtras != null;
}
