import type { Dispatch, SetStateAction } from 'react';
import SearchBar from './SearchBar';
import TimezonePicker from './TimezonePicker';
import { useEffect, useRef, useState } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Sparkles, ChevronDown, Plus } from 'lucide-react';
import type { EventTemplateV1 } from '../api/v1/templates';
import { BUILT_IN_EVENT_TEMPLATES } from '../core/engine/recurrence/templates';
import { AppHeader } from './AppHeader';
import ProfileBar from './ProfileBar';
import FocusChips, { DEFAULT_FOCUS_CHIPS } from './FocusChips';
import type { FocusChipDef } from './FocusChips';
import { ALL_VIEWS } from '../core/calendarViewConfig';
import type { ViewDef } from '../core/calendarViewConfig';
import { captureSavedViewFields } from '../core/viewScope';
import { hasActiveFilters, buildActiveFilterPills, buildFilterSummary } from '../filters/filterState';
import { VIEW_SHORTCUT_KEYS } from '../hooks/useKeyboardShortcuts';
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

// view id → keyboard shortcut digit (inverse of VIEW_SHORTCUT_KEYS), used to
// advertise the binding on each view button via aria-keyshortcuts.
const VIEW_SHORTCUT_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_SHORTCUT_KEYS).map(([key, id]) => [id, key]),
);

type CalendarHandle = ReturnType<typeof useCalendarSetup>['cal'];
type OwnerCfgHandle = ReturnType<typeof useOwnerConfig>;
type SavedViewsHandle = ReturnType<typeof useSavedViews>;
type SavedViewArg = Parameters<SavedViewsHandle['saveView']>[2];
type CaptureCtx = Pick<SaveViewOptions, SavedViewCaptureField>;

export interface CalendarToolbarProps {
  cal: CalendarHandle;
  ownerCfg: OwnerCfgHandle;
  api: CalendarApi;
  renderToolbar?: WorksCalendarProps['renderToolbar'];
  renderSavedViewsBar?: WorksCalendarProps['renderSavedViewsBar'];
  renderFilterBar?: WorksCalendarProps['renderFilterBar'];
  focusChips?: FocusChipDef[] | boolean | undefined;
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

function QuickAddDropdown({ api, eventTemplates, hideEventTemplates }: {
  api: CalendarToolbarProps['api'];
  eventTemplates?: EventTemplateV1[];
  hideEventTemplates?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const templates: EventTemplateV1[] = eventTemplates && eventTemplates.length > 0
    ? eventTemplates
    : BUILT_IN_EVENT_TEMPLATES.map(t => ({
        id: t.id,
        name: t.label,
        defaults: t.defaults ?? {},
        ...(t.description ? { description: t.description } : {}),
      } as EventTemplateV1));

  if (hideEventTemplates || templates.length === 0) {
    return (
      <button
        type="button"
        className={styles['newBtn']}
        onClick={() => api.addEvent()}
        aria-label="New event"
        title="New event"
      >
        <Plus size={14} aria-hidden="true" />
        <span>New</span>
      </button>
    );
  }

  return (
    <div ref={ref} className={styles['quickAddWrap']}>
      <button
        type="button"
        className={styles['newBtn']}
        onClick={() => { api.addEvent(); }}
        aria-label="New blank event"
        title="New blank event"
      >
        <Plus size={14} aria-hidden="true" />
        <span>New</span>
      </button>
      <button
        type="button"
        className={styles['newBtnChevron']}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="New event from template"
        title="New from template"
      >
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles['quickAddDropdown']} role="menu" aria-label="Event templates">
          {templates.map(tpl => (
            <button
              key={tpl.id}
              type="button"
              role="menuitem"
              className={styles['quickAddItem']}
              onClick={() => {
                setOpen(false);
                const d = tpl.defaults ?? {};
                const patch: Parameters<typeof api.addEvent>[0] = {};
                if (d.title)    patch.title    = d.title;
                if (d.allDay)   patch.allDay   = d.allDay;
                if (d.category) patch.category = d.category;
                if (d.color)    patch.color    = d.color;
                if (d.meta)     patch.meta     = d.meta;
                if (d.rrule)    patch.rrule    = d.rrule;
                api.addEvent(patch);
              }}
            >
              <span className={styles['quickAddItemLabel']}>{tpl.name}</span>
              {tpl.description && (
                <span className={styles['quickAddItemDesc']}>{tpl.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarToolbar({
  cal, ownerCfg, api,
  renderToolbar, renderSavedViewsBar, renderFilterBar, focusChips,
  logoSrc, logoAlt, devMode, calendarTitle, fetchLoading,
  editMode, setEditMode, setInlineEditTarget, setHelpOpen,
  savedViews, savedViewActiveId, savedViewDirty,
  handleApplyView, handleDeleteView, handleClearFilters,
  savedViewCaptureCtx, activeGroupBy,
  VIEWS, setSidebarOpen, setSidebarInitialTab, handleScopeClick,
  schema, filterBarSchema, scopedEvents, locationLabel, assetsLabel, weekStartDay,
  hasAddButton, hideEventTemplates, eventTemplates, showSearch,
  showTimezonePicker, displayTimezone, onTimezoneChange,
}: CalendarToolbarProps) {
  return (
    <>
      {/* ── Toolbar ── */}
      {renderToolbar ? (
        <div className={styles['customToolbar']}>{renderToolbar(api)}</div>
      ) : (
        <AppHeader
          leftSlot={
            <div className={styles['navGroup']}>
              {logoSrc && (
                <img
                  src={logoSrc}
                  alt={logoAlt ?? ''}
                  className={styles['logo']}
                  aria-hidden={!logoAlt ? 'true' : undefined}
                />
              )}
              <button
                className={styles['navBtn']}
                onClick={() => cal.navigate(-1)}
                aria-label="Previous"
                aria-keyshortcuts="k ArrowLeft"
                title={`Previous ${cal.view}`}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button className={styles['todayBtn']} onClick={cal.goToToday} aria-keyshortcuts="t">Today</button>
              <button
                className={styles['navBtn']}
                onClick={() => cal.navigate(1)}
                aria-label="Next"
                aria-keyshortcuts="j ArrowRight"
                title={`Next ${cal.view}`}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <span className={styles['dateLabel']} aria-live="polite" aria-atomic="true">
                {getDateLabel(cal.view, cal.currentDate, weekStartDay)}
              </span>
              <span className={styles['calendarTitle']}>{calendarTitle}</span>
              {fetchLoading && <span className={styles['loadingDot']} title="Loading…" aria-label="Loading events" role="status" />}
            </div>
          }
          centerSlot={(() => {
            const calendarViews   = VIEWS.filter((v: ViewDef) => v.group === 'calendar');
            const operationsViews = VIEWS.filter((v: ViewDef) => v.group === 'operations');
            const renderBtn = (v: ViewDef) => (
              <button
                key={v.id}
                className={[styles['viewBtn'], cal.view === v.id && styles['activeView']].filter(Boolean).join(' ')}
                onClick={() => cal.setView(v.id)}
                aria-pressed={cal.view === v.id}
                aria-keyshortcuts={VIEW_SHORTCUT_BY_ID[v.id]}
                title={v.hint}
                data-wc-view-button={v.id}
              >
                {v.label}
              </button>
            );
            return (
              <div className={styles['viewGroup']} role="group" aria-label="Calendar view">
                {calendarViews.map(renderBtn)}
                {operationsViews.length > 0 && (
                  <span className={styles['viewGroupDivider']} aria-hidden="true" role="presentation" />
                )}
                {operationsViews.map(renderBtn)}
              </div>
            );
          })()}
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
              {hasAddButton && (
                <QuickAddDropdown
                  api={api}
                  {...(eventTemplates !== undefined ? { eventTemplates } : {})}
                  {...(hideEventTemplates !== undefined ? { hideEventTemplates } : {})}
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
      )}

      {/* ── Profile / Saved-views Bar ── */}
      {renderSavedViewsBar
        ? renderSavedViewsBar({
            views:       savedViews.views,
            activeId:    savedViewActiveId,
            isDirty:     savedViewDirty,
            applyView:   handleApplyView,
            saveView:    (name: string, opts: SavedViewArg) => savedViews.saveView(name, cal.filters, { view: cal.view, ...captureSavedViewFields(cal.view, savedViewCaptureCtx), ...opts }),
            updateView:  savedViews.updateView,
            resaveView:  (id: string) => savedViews.resaveView(id, cal.filters, cal.view, activeGroupBy, captureSavedViewFields(cal.view, savedViewCaptureCtx)),
            deleteView:  handleDeleteView,
            toggleStripVisibility: savedViews.toggleStripVisibility,
            clearFilters: cal.clearFilters,
            hasActiveFilters: hasActiveFilters(cal.filters, schema),
            currentFilters: cal.filters,
            currentView:    cal.view,
            schema,
            buildFilterSummary: (filters: Record<string, unknown>) => buildFilterSummary(filters, schema),
          })
        : (() => {
          const resolvedFocusChips: FocusChipDef[] | null = focusChips
            ? (Array.isArray(focusChips) ? focusChips : DEFAULT_FOCUS_CHIPS)
            : null;
          const activeCategories = cal.filters?.['categories'] as Set<string> | undefined;
          const tailSlot = resolvedFocusChips ? (
            <>
              <FocusChips
                chips={resolvedFocusChips}
                activeCategories={activeCategories}
                onCategoriesChange={(next: Set<string>) => cal.setFilter('categories', next)}
              />
              <button
                type="button"
                className={styles['scopePill']}
                onClick={handleScopeClick}
                title="Change scope"
              >
                <span>All regions</span>
                <span className={styles['scopePillChevron']} aria-hidden="true">›</span>
              </button>
            </>
          ) : null;
          return (
            <ProfileBar
              compact
              views={savedViews.views}
              activeId={savedViewActiveId}
              isDirty={savedViewDirty}
              schema={schema}
              currentView={cal.view}
              viewOrder={ALL_VIEWS.map(v => v.id)}
              enabledViews={VIEWS.map((v: ViewDef) => v.id)}
              locationLabel={locationLabel}
              assetsLabel={assetsLabel}
              hasActiveFilters={hasActiveFilters(cal.filters, schema)}
              tailSlot={tailSlot}
              onApply={handleApplyView}
              onAdd={({ name, color }: { name: string; color: string | undefined }) => {
                savedViews.saveView(name, cal.filters, { color: color ?? null, view: cal.view, ...captureSavedViewFields(cal.view, savedViewCaptureCtx) });
              }}
              onResave={(id: string) => savedViews.resaveView(id, cal.filters, cal.view, activeGroupBy, captureSavedViewFields(cal.view, savedViewCaptureCtx))}
              onUpdate={savedViews.updateView}
              onDelete={handleDeleteView}
              onToggleVisibility={savedViews.toggleStripVisibility}
              onClearFilters={handleClearFilters}
              onEditConditions={ownerCfg.isOwner ? (id: string) => ownerCfg.openConfigToTab('smartViews', { smartViewEditId: id }) : undefined}
            />
          );
        })()
      }

      {/* ── Filter Bar (legacy, kept for renderFilterBar override) ── */}
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
