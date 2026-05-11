import { Plus, Upload, Download } from 'lucide-react';
import { SubToolbar } from './SubToolbar';
import { DayWindowPills } from './DayWindowPills';
import { SidebarToggleButton } from './FilterGroupSidebar';
import ActiveFilterStrip from './ActiveFilterStrip';
import MonthView from '../views/MonthView';
import WeekView from '../views/WeekView';
import DayView from '../views/DayView';
import AgendaView from '../views/AgendaView';
import ScheduleView from '../views/ScheduleView';
import AssetsView from '../views/AssetsView';
import BaseGanttView from '../views/BaseGanttView';
import DispatchView from '../views/DispatchView';
import RequestQueueView from '../views/RequestQueueView';
import { exportVisibleEvents } from '../core/calendarViewConfig';
import { hasActiveFilters } from '../filters/filterState';
import styles from '../WorksCalendar.module.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseValue = any;

export interface CalendarViewGridProps {
  cal: LooseValue;
  ownerCfg: LooseValue;
  perms: LooseValue;
  schema: LooseValue;
  filterBarSchema: LooseValue;
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  sidebarGroupLevels: LooseValue;
  // Add buttons
  hasAddButton: boolean;
  hasScheduleTemplates: boolean;
  hasImport: boolean;
  profileLabels: LooseValue;
  visibleScheduleTemplates: LooseValue[];
  onScheduleTemplateAnalytics: LooseValue;
  // Events
  visibleEvents: LooseValue[];
  expandedEvents: LooseValue[];
  approvalRequestEvents: LooseValue;
  isEmpty: boolean;
  emptyState: LooseValue;
  sharedViewProps: LooseValue;
  // Swipe / edit
  swipeAreaRef: LooseValue;
  lastClickCoordsRef: LooseValue;
  editMode: boolean;
  // Groups
  activeGroupBy: LooseValue;
  activeSort: LooseValue;
  activeShowAllGroups: LooseValue;
  // People
  configuredEmployees: LooseValue[];
  // Assets / dispatch
  effectiveAssets: LooseValue;
  configuredBases: LooseValue;
  configuredRegions: LooseValue;
  locationLabel: string;
  assetsLabel: string;
  selectedBaseIds: string[];
  setSelectedBaseIds: LooseValue;
  categoriesConfig: LooseValue;
  rawPools: LooseValue;
  strictAssetFiltering: LooseValue;
  resolveResourceLabel: LooseValue;
  activeAssetsZoom: LooseValue;
  setActiveAssetsZoom: LooseValue;
  activeAssetsCollapsed: LooseValue;
  setActiveAssetsCollapsed: LooseValue;
  effectiveLocationProvider: LooseValue;
  renderAssetLocation: LooseValue;
  renderPoolLocation: LooseValue;
  renderAssetBadges: LooseValue;
  dispatchMissions: LooseValue;
  dispatchEvaluator: LooseValue;
  onDispatchAssign: LooseValue;
  onApprovalAction: LooseValue;
  canRequestAsset: boolean;
  // Handlers
  setFormEvent: LooseValue;
  setScheduleOpen: LooseValue;
  setImportOpen: LooseValue;
  setAssetRequestOpen: LooseValue;
  setActiveGroupBy: LooseValue;
  handleClearFilters: LooseValue;
  handleScheduleDateSelect: LooseValue;
  handlePoolDateSelect: LooseValue;
  handleEmployeeAddInternal: LooseValue;
  handleEmployeeDeleteInternal: LooseValue;
  handleShiftStatusChange: LooseValue;
  handleCoverageAssign: LooseValue;
  handleEmployeeAction: LooseValue;
  handleEventClick: LooseValue;
}

export default function CalendarViewGrid({
  cal, ownerCfg, perms, schema, filterBarSchema: _filterBarSchema,
  sidebarOpen, setSidebarOpen, sidebarGroupLevels,
  hasAddButton, hasScheduleTemplates, hasImport, profileLabels,
  visibleScheduleTemplates, onScheduleTemplateAnalytics,
  visibleEvents, expandedEvents, approvalRequestEvents, isEmpty, emptyState,
  sharedViewProps, swipeAreaRef, lastClickCoordsRef, editMode,
  activeGroupBy, activeSort, activeShowAllGroups,
  configuredEmployees, effectiveAssets, configuredBases, configuredRegions,
  locationLabel, assetsLabel, selectedBaseIds, setSelectedBaseIds,
  categoriesConfig, rawPools, strictAssetFiltering, resolveResourceLabel,
  activeAssetsZoom, setActiveAssetsZoom, activeAssetsCollapsed, setActiveAssetsCollapsed,
  effectiveLocationProvider, renderAssetLocation, renderPoolLocation, renderAssetBadges,
  dispatchMissions, dispatchEvaluator, onDispatchAssign, onApprovalAction, canRequestAsset,
  setFormEvent, setScheduleOpen, setImportOpen, setAssetRequestOpen, setActiveGroupBy,
  handleClearFilters, handleScheduleDateSelect, handlePoolDateSelect,
  handleEmployeeAddInternal, handleEmployeeDeleteInternal, handleShiftStatusChange,
  handleCoverageAssign, handleEmployeeAction, handleEventClick,
}: CalendarViewGridProps) {
  return (
    <div className={styles['mainPane']}>
      <div className={styles['calendarCard']}>
        <SubToolbar
          leftSlot={<>
            <SidebarToggleButton
              isOpen={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              filterCount={hasActiveFilters(cal.filters, schema) ? 1 : 0}
              groupCount={sidebarGroupLevels.length}
            />
            {hasAddButton && cal.view !== 'schedule' && (
              <button
                className={styles['addBtn']}
                onClick={() => setFormEvent({})}
                aria-label={`Add new ${profileLabels.event.toLowerCase()}`}
                title={profileLabels.event === 'Event' ? undefined : `Create a new ${profileLabels.event.toLowerCase()}`}
              >
                <Plus size={14} aria-hidden="true" />
                <span className={styles['addBtnLabel']}> New {profileLabels.event}</span>
              </button>
            )}
            {hasAddButton && hasScheduleTemplates && (
              <button
                className={styles['addBtn']}
                onClick={() => {
                  setScheduleOpen(true);
                  onScheduleTemplateAnalytics?.({
                    event: 'schedule_dialog_opened',
                    at: new Date().toISOString(),
                    templateCount: visibleScheduleTemplates.length,
                  });
                }}
                aria-label="Add schedule from template"
              >
                <Plus size={14} aria-hidden="true" /><span className={styles['addBtnLabel']}> Add Schedule</span>
              </button>
            )}
          </>}
          centerSlot={
            (cal.view === 'schedule' || cal.view === 'base' || cal.view === 'assets')
              ? <DayWindowPills value={cal.dayWindow} onChange={cal.setDayWindow} />
              : null
          }
          rightSlot={<>
            {hasImport && (
              <button className={styles['exportBtn']} onClick={() => setImportOpen(true)} aria-label="Import .ics calendar">
                <Upload size={15} aria-hidden="true" />
              </button>
            )}
            <button className={styles['exportBtn']} onClick={() => exportVisibleEvents(visibleEvents)} aria-label="Export to Excel">
              <Download size={15} aria-hidden="true" />
            </button>
          </>}
        />
        <ActiveFilterStrip
          filters={cal.filters as Record<string, unknown>}
          schema={schema}
          onChange={(key, value) => cal.setFilter(key, value)}
          onClear={(key) => cal.clearFilter(key)}
          onClearAll={handleClearFilters}
        />
        <div
          ref={swipeAreaRef}
          className={styles['viewArea']}
          onClickCapture={editMode ? (e) => {
            lastClickCoordsRef.current = { x: e.clientX, y: e.clientY };
          } : undefined}
        >
          {isEmpty && emptyState ? (
            <div className={styles['emptyStateWrap']}>{emptyState}</div>
          ) : (
            <>
              {cal.view === 'month'    && <MonthView    {...sharedViewProps} />}
              {cal.view === 'week'     && <WeekView     {...sharedViewProps} />}
              {cal.view === 'day'      && <DayView      {...sharedViewProps} />}
              {cal.view === 'agenda'   && <AgendaView   currentDate={cal.currentDate} events={visibleEvents} onEventClick={handleEventClick} onEventGroupChange={sharedViewProps.onEventGroupChange} groupBy={activeGroupBy} sort={activeSort} showAllGroups={activeShowAllGroups} employees={configuredEmployees} />}
              {cal.view === 'schedule' && (
                <ScheduleView
                  currentDate={cal.currentDate}
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                  onEventGroupChange={sharedViewProps.onEventGroupChange}
                  onDateSelect={handleScheduleDateSelect}
                  employees={configuredEmployees}
                  onEmployeeAdd={perms.canManagePeople ? handleEmployeeAddInternal : undefined}
                  onEmployeeDelete={perms.canManagePeople ? handleEmployeeDeleteInternal : undefined}
                  onShiftStatusChange={handleShiftStatusChange}
                  onCoverageAssign={handleCoverageAssign}
                  onEmployeeAction={handleEmployeeAction}
                  groupBy={activeGroupBy}
                  sort={activeSort}
                  roles={ownerCfg.config?.['team']?.roles ?? []}
                  bases={ownerCfg.config?.['team']?.bases ?? []}
                  dayWindow={cal.dayWindow}
                />
              )}
              {cal.view === 'base' && (
                <BaseGanttView
                  currentDate={cal.currentDate}
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                  employees={configuredEmployees}
                  assets={effectiveAssets ?? []}
                  bases={configuredBases}
                  regions={configuredRegions}
                  locationLabel={locationLabel}
                  assetsLabel={assetsLabel}
                  selectedBaseIds={selectedBaseIds}
                  onBaseSelectionChange={setSelectedBaseIds}
                  dayWindow={cal.dayWindow}
                />
              )}
              {cal.view === 'assets' && (
                <AssetsView
                  currentDate={cal.currentDate}
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                  onDateSelect={handleScheduleDateSelect}
                  onPoolDateSelect={handlePoolDateSelect}
                  groupBy={activeGroupBy}
                  onGroupByChange={setActiveGroupBy}
                  categoriesConfig={categoriesConfig ?? ownerCfg.config?.['categoriesConfig']}
                  assets={effectiveAssets}
                  pools={rawPools ?? []}
                  strictAssetFiltering={strictAssetFiltering}
                  resolveResourceLabel={resolveResourceLabel}
                  zoomLevel={activeAssetsZoom}
                  onZoomChange={setActiveAssetsZoom}
                  collapsedGroups={activeAssetsCollapsed}
                  onCollapsedGroupsChange={setActiveAssetsCollapsed}
                  locationProvider={effectiveLocationProvider}
                  renderAssetLocation={renderAssetLocation}
                  renderPoolLocation={renderPoolLocation}
                  renderAssetBadges={renderAssetBadges}
                  onEditAssets={ownerCfg.isOwner ? () => ownerCfg.openConfigToTab('assets') : undefined}
                  onRequestAsset={canRequestAsset ? () => setAssetRequestOpen(true) : undefined}
                  approvalsConfig={ownerCfg.config?.['approvals']}
                  onApprovalAction={onApprovalAction}
                  label={assetsLabel}
                  dayWindow={cal.dayWindow}
                />
              )}
              {cal.view === 'dispatch' && (
                <DispatchView
                  events={expandedEvents}
                  employees={configuredEmployees}
                  assets={effectiveAssets ?? []}
                  bases={configuredBases}
                  locationLabel={locationLabel}
                  label={assetsLabel}
                  onEventClick={handleEventClick}
                  missions={dispatchMissions}
                  evaluateForMission={dispatchEvaluator}
                  onAssign={onDispatchAssign}
                  onAsOfChange={cal.setCurrentDate}
                />
              )}
              {cal.view === 'requests' && (
                <RequestQueueView
                  events={approvalRequestEvents as never}
                  approvalsConfig={ownerCfg.config?.['approvals'] as Record<string, unknown> | undefined}
                  onApprovalAction={onApprovalAction}
                  onEventClick={handleEventClick}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
