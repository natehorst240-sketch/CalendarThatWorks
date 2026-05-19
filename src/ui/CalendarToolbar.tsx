import type { Dispatch, SetStateAction } from 'react';
import SearchBar from './SearchBar';
import TimezonePicker from './TimezonePicker';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Sparkles } from 'lucide-react';
import type { EventTemplateV1 } from '../api/v1/templates';
import { AppHeader } from './AppHeader';
import { ViewSwitcher } from './ViewSwitcher';
import { DatePickerDropdown } from './DatePickerDropdown';
import { DayWindowPills } from './DayWindowPills';
import type { ViewDef } from '../core/calendarViewConfig';
import { captureSavedViewFields } from '../core/viewScope';
import { buildActiveFilterPills, buildFilterSummary } from '../filters/filterState';
import { useCalendarSetup } from '../hooks/useCalendarSetup';
import { useOwnerConfig } from '../hooks/useOwnerConfig';
import { useSavedViews } from '../hooks/useSavedViews';
import type { SaveViewOptions } from '../hooks/useSavedViews';
import type { SavedViewCaptureField } from '../core/viewScope';
import type { InlineEditTarget } from '../hooks/useModalState';
import type { CalendarApi, WorksCalendarProps } from '../WorksCalendar.types';
import type { NormalizedEvent } from '../types/events';
import type { FilterField } from '../filters/filterSchema';
import type { SidebarTab } from './FilterGroupSidebar';
import type { GroupByInput } from '../hooks/useNormalizedConfig';
import styles from '../WorksCalendar.module.css';

type CalendarHandle = ReturnType<typeof useCalendarSetup>['cal'];
type OwnerCfgHandle = ReturnType<typeof useOwnerConfig>;
type SavedViewsHandle = ReturnType<typeof useSavedViews>;
type CaptureCtx = Pick<SaveViewOptions, SavedViewCaptureField>;

export interface CalendarToolbarProps {
  cal: CalendarHandle;
  ownerCfg: OwnerCfgHandle;
  api: CalendarApi;
  renderToolbar?: WorksCalendarProps['renderToolbar'];
  renderSavedViewsBar?: WorksCalendarProps['renderSavedViewsBar'];
  renderFilterBar?: WorksCalendarProps['renderFilterBar'];
  focusChips?: unknown;
  logoSrc?: string | undefined;
  logoAlt?: string | undefined;
  devMode: boolean;
  calendarTitle: string;
  fetchLoading: boolean;
  editMode: boolean;
  setEditMode: Dispatch<SetStateAction<boolean>>;
  setInlineEditTarget: (target: InlineEditTarget | null) => void;
  setHelpOpen: (v: boolean) => void;
  savedViews: SavedViewsHandle;
  savedViewActiveId: string | null;
  savedViewDirty: boolean;
  handleApplyView: (savedView: { id: string; [key: string]: unknown }) => void;
  handleDeleteView: (id: string) => void;
  handleClearFilters: () => void;
  savedViewCaptureCtx: CaptureCtx;
  activeGroupBy: GroupByInput | null;
  VIEWS: readonly ViewDef[];
  setSidebarOpen: (v: boolean) => void;
  setSidebarInitialTab: Dispatch<SetStateAction<SidebarTab>>;
  handleScopeClick: () => void;
  schema: FilterField[];
  filterBarSchema: FilterField[];
  scopedEvents: readonly NormalizedEvent[];
  locationLabel: string;
  assetsLabel: string;
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hasAddButton?: boolean;
  hideEventTemplates?: boolean;
  eventTemplates?: EventTemplateV1[];
  showSearch?: boolean;
  showTimezonePicker?: boolean;
  displayTimezone?: string;
  onTimezoneChange?: (tz: string) => void;
}

function getDateLabel(view: string, currentDate: Date, weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  switch (view) {
    case 'day':
      return format(currentDate, 'EEEE, MMMM d, yyyy');
    case 'week': {
      const ws = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
      const we = endOfWeek(currentDate,   { weekStartsOn: weekStartDay });
      const sameMo = ws.getMonth() === we.getMonth();
      const sameYr = ws.getFullYear() === we.getFullYear();
      if (sameMo)  return `${format(ws, 'MMM d')} – ${format(we, 'd, yyyy')}`;
      if (sameYr)  return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
      return `${format(ws, 'MMM d, yyyy')} – ${format(we, 'MMM d, yyyy')}`;
    }
    default:
      return format(currentDate, 'MMMM yyyy');
  }
}

export default function CalendarToolbar({
  cal, ownerCfg, api,
  renderToolbar, renderSavedViewsBar, renderFilterBar,
  logoSrc, logoAlt, devMode, calendarTitle, fetchLoading,
  editMode, setEditMode, setInlineEditTarget, setHelpOpen,
  savedViews, savedViewActiveId, savedViewDirty,
  handleApplyView, handleDeleteView, handleClearFilters,
  savedViewCaptureCtx, activeGroupBy,
  VIEWS, setSidebarOpen, setSidebarInitialTab,
  schema, filterBarSchema, scopedEvents, locationLabel, assetsLabel, weekStartDay,
  showSearch,
  showTimezonePicker, displayTimezone, onTimezoneChange,
}: CalendarToolbarProps) {
  // Voiding refs to unused props so TypeScript doesn't complain about the
  // legacy surface (these props are still accepted to keep the embedder
  // API stable; their content has moved to the LeftRail).
  void renderSavedViewsBar; void savedViews; void savedViewActiveId;
  void savedViewDirty; void handleApplyView; void handleDeleteView;
  void savedViewCaptureCtx; void activeGroupBy; void scopedEvents;
  void assetsLabel; void locationLabel; void captureSavedViewFields;
  void buildFilterSummary; void handleClearFilters; void schema;

  if (renderToolbar) {
    return <div className={styles['customToolbar']}>{renderToolbar(api)}</div>;
  }

  const dayWindowable = cal.view === 'schedule' || cal.view === 'base' || cal.view === 'assets';

  return (
    <>
      <AppHeader
        leftSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
            {logoSrc && (
              <img
                src={logoSrc}
                alt={logoAlt ?? ''}
                className={styles['logo']}
                aria-hidden={!logoAlt ? 'true' : undefined}
              />
            )}
            <ViewSwitcher
              views={VIEWS}
              currentView={cal.view}
              onViewChange={(id) => cal.setView(id as typeof cal.view)}
            />
          </div>
        }
        centerSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <DatePickerDropdown
              currentDate={cal.currentDate}
              label={getDateLabel(cal.view, cal.currentDate, weekStartDay)}
              onDateChange={cal.setCurrentDate}
              onToday={cal.goToToday}
              onPrev={() => cal.navigate(-1)}
              onNext={() => cal.navigate(1)}
              prevShortcut="k ArrowLeft"
              nextShortcut="j ArrowRight"
            />
            {dayWindowable && <DayWindowPills value={cal.dayWindow} onChange={cal.setDayWindow} />}
            {fetchLoading && <span className={styles['loadingDot']} title="Loading…" aria-label="Loading events" role="status" />}
            {calendarTitle && (
              <span className={styles['calendarTitle']} style={{ fontSize: 11, opacity: 0.7 }}>{calendarTitle}</span>
            )}
          </div>
        }
        rightSlot={
          <div className={styles['actions']}>
            {showTimezonePicker && onTimezoneChange && (
              <TimezonePicker
                {...(displayTimezone !== undefined ? { value: displayTimezone } : {})}
                onChange={onTimezoneChange}
              />
            )}
            {showSearch && (
              <SearchBar
                value={String(cal.filters?.['search'] ?? '')}
                onChange={(q) => cal.setFilter('search', q || null)}
              />
            )}
            {devMode && <span className={styles['devBadge']}>Dev</span>}
            {(ownerCfg.isOwner || devMode) && (
              <button
                className={[styles['wandBtn'], editMode && styles['wandBtnActive']].filter(Boolean).join(' ')}
                onClick={() => { setEditMode((v: boolean) => !v); setInlineEditTarget(null); }}
                aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode — click events to customize them'}
                title={editMode ? 'Exit edit mode' : 'Customize events'}
              >
                <Sparkles size={15} aria-hidden="true" />
                {editMode && <span className={styles['wandBtnLabel']}>Done</span>}
              </button>
            )}
          </div>
        }
        menuItems={[
          ...(ownerCfg.isOwner ? [
            { label: 'Settings',          sub: 'Calendar config, integrations', onClick: () => ownerCfg.setConfigOpen(true) },
            { label: 'Themes',            sub: 'Switch palette / appearance',   onClick: () => ownerCfg.openConfigToTab('theme') },
            { label: 'Advanced settings', sub: 'Smart views, fields, approvals', onClick: () => ownerCfg.openConfigToTab('smartViews') },
          ] : []),
          { label: 'Saved views',        sub: 'Manage your view library',      onClick: () => { setSidebarInitialTab('saved'); setSidebarOpen(true); } },
          { label: 'Keyboard shortcuts', sub: 'Quick reference',               onClick: () => setHelpOpen(true) },
          { label: 'Help & feedback',                                          onClick: () => window.open('https://github.com/WorksCalendar/CalendarThatWorks/issues', '_blank', 'noopener') },
        ]}
      />

      {/* Legacy embedder hook — host may still inject its own filter bar. */}
      {renderFilterBar && renderFilterBar({
        schema:          filterBarSchema,
        filters:         cal.filters,
        setFilter:       cal.setFilter,
        toggleFilter:    cal.toggleFilter,
        clearFilter:     cal.clearFilter,
        clearAllFilters: cal.clearFilters,
        activePills:     buildActiveFilterPills(cal.filters, filterBarSchema),
        items:           scopedEvents,
      })}
    </>
  );
}
