import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Bookmark, Filter, Settings } from 'lucide-react';
import { LeftRail, type LeftRailAction } from './LeftRail';
import { RightPanel, RightPanelSection, CrewOnShiftList } from './RightPanel';
import { MapPeekWidget } from './MapPeekWidget';
import { isScheduleWorkflowEvent } from '../core/scheduleModel';
import type { NormalizedEvent } from '../types/events';
import type { EmployeeRecord } from '../WorksCalendar.types';
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
}

export function CalendarLeftRail({ ownerCfg, leftRailExtras, setSidebarInitialTab, setSidebarOpen }: CalendarLeftRailProps) {
  return (
    <LeftRail
      actions={[
        { id: 'saved-views', label: 'Saved views', hint: 'Manage your view library', icon: <Bookmark size={18} aria-hidden="true" />, onClick: () => { setSidebarInitialTab('saved'); setSidebarOpen(true); } },
        { id: 'focus', label: 'Focus filters', hint: 'Narrow the calendar by region, base, role, or category', icon: <Filter size={18} aria-hidden="true" />, onClick: () => { setSidebarInitialTab('focus'); setSidebarOpen(true); } },
        ...(ownerCfg.isOwner ? [{ id: 'settings', label: 'Settings', hint: 'Calendar configuration', icon: <Settings size={18} aria-hidden="true" />, onClick: () => ownerCfg.setConfigOpen(true) }] : []),
        ...(leftRailExtras ?? []).filter((extra) => !['saved-views', 'focus', 'settings'].includes(extra.id)),
      ]}
    />
  );
}

interface CalendarRightPanelProps {
  showMapWidget: boolean;
  expandedEvents: readonly NormalizedEvent[];
  handleEventClick: (event: NormalizedEvent) => void;
  onMapWidgetOpenChange: ((open: boolean) => void) | undefined;
  mapStyle: string | undefined;
  configuredEmployees: EmployeeRecord[];
  onShiftIds: ReadonlySet<string>;
  rightPanelExtras: ReactNode;
}

export function CalendarRightPanel({
  showMapWidget, expandedEvents, handleEventClick,
  onMapWidgetOpenChange, mapStyle, configuredEmployees, onShiftIds, rightPanelExtras,
}: CalendarRightPanelProps) {
  return (
    <RightPanel>
      {showMapWidget && (
        <RightPanelSection title="Region map">
          <MapPeekWidget
            events={expandedEvents.filter(ev => !isScheduleWorkflowEvent(ev)) as never}
            onEventClick={handleEventClick as never}
            {...(onMapWidgetOpenChange ? { onOpenChange: onMapWidgetOpenChange } : {})}
            {...(mapStyle ? { mapStyle } : {})}
          />
        </RightPanelSection>
      )}
      <RightPanelSection title="Crew on shift">
        <CrewOnShiftList employees={configuredEmployees} onShiftIds={onShiftIds} />
      </RightPanelSection>
      {rightPanelExtras}
    </RightPanel>
  );
}
