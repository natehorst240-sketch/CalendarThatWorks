/**
 * WorksCalendar — main component.
 */
import {
  useState, useCallback, useEffect, useRef,
  useImperativeHandle, forwardRef, useMemo,
} from 'react';
import {
  format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, addMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Plus, Upload } from 'lucide-react';

import { useCalendar }        from './hooks/useCalendar.js';
import { useOwnerConfig }     from './hooks/useOwnerConfig.js';
import { useProfiles }        from './hooks/useProfiles.js';
import { useFetchEvents }     from './hooks/useFetchEvents.js';
import { useFeedEvents }      from './hooks/useFeedEvents.js';
import { useOccurrences }     from './hooks/useOccurrences.js';
import { useRealtimeEvents }  from './hooks/useRealtimeEvents.js';
import { CalendarContext }    from './core/CalendarContext.js';
import { normalizeEvents }    from './core/eventModel.js';
import { applyFilters, getCategories, getResources } from './filters/filterEngine.js';
import FilterBar              from './ui/FilterBar.jsx';
import ProfileBar             from './ui/ProfileBar.jsx';
import HoverCard              from './ui/HoverCard.jsx';
import OwnerLock              from './ui/OwnerLock.jsx';
import ConfigPanel            from './ui/ConfigPanel.jsx';
import EventForm              from './ui/EventForm.jsx';
import ImportZone             from './ui/ImportZone.jsx';
import MonthView              from './views/MonthView.jsx';
import WeekView               from './views/WeekView.jsx';
import DayView                from './views/DayView.jsx';
import AgendaView             from './views/AgendaView.jsx';
import ScheduleView           from './views/ScheduleView.jsx';
import TimelineView           from './views/TimelineView.jsx';
import { exportToExcel }      from './export/excelExport.js';

import styles from './WorksCalendar.module.css';

const VIEWS = [
  { id: 'month',    label: 'Month'    },
  { id: 'week',     label: 'Week'     },
  { id: 'day',      label: 'Day'      },
  { id: 'agenda',   label: 'Agenda'   },
  { id: 'schedule', label: 'Schedule' },
  { id: 'timeline', label: 'Timeline' },
];

/** Compute the visible [start, end] range for a given view + date. */
function viewRange(view, date, weekStartDay = 0) {
  switch (view) {
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: weekStartDay }), end: endOfWeek(date, { weekStartsOn: weekStartDay }) };
    case 'day':
      return { start: date, end: addDays(date, 1) };
    case 'schedule': {
      const s = startOfWeek(startOfMonth(date), { weekStartsOn: weekStartDay });
      return { start: s, end: addDays(s, 7 * 6) };
    }
    default: // month, agenda, timeline
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
}

export const WorksCalendar = forwardRef(function WorksCalendar(
  {
    // ── Data ──
    events:     rawEvents   = [],
    fetchEvents,
    icalFeeds,
    onImport,

    // ── Identity ──
    calendarId              = 'default',

    // ── Owner ──
    ownerPassword           = '',
    onConfigSave,

    // ── Notes ──
    notes       = {},
    onNoteSave,
    onNoteDelete,

    // ── Event callbacks ──
    onEventClick: onEventClickProp,
    onEventSave,
    onEventMove,
    onEventResize,
    onEventDelete,

    // ── Supabase realtime ──
    supabaseUrl,
    supabaseKey,
    supabaseTable,
    supabaseFilter,

    // ── Appearance ──
    theme       = 'light',
    colorRules,
    businessHours,

    // ── Custom rendering ──
    renderEvent,
    renderHoverCard,
    renderToolbar,
    emptyState,

    // ── UI toggles ──
    showAddButton           = false,
  },
  ref,
) {
  // ── View / date / filter state ───────────────────────────────────────────
  const cal      = useCalendar([]);
  const ownerCfg = useOwnerConfig({ calendarId, ownerPassword, onConfigSave });
  const weekStartDay = ownerCfg.config?.display?.weekStartDay ?? 0;

  // Honor defaultView from owner config (applied once after config loads)
  const defaultViewApplied = useRef(false);
  useEffect(() => {
    const defaultView = ownerCfg.config?.display?.defaultView;
    if (defaultView && !defaultViewApplied.current) {
      defaultViewApplied.current = true;
      cal.setView(defaultView);
    }
  }, [ownerCfg.config?.display?.defaultView]);

  const profiles = useProfiles({
    calendarId,
    filters:    cal.filters,
    view:       cal.view,
    setFilters: cal.replaceFilters,
    setView:    cal.setView,
  });

  // ── Visible date range (drives fetch + occurrence expansion) ─────────────
  const range = useMemo(
    () => viewRange(cal.view, cal.currentDate, weekStartDay),
    [cal.view, cal.currentDate, weekStartDay],
  );

  // ── Async fetch ──────────────────────────────────────────────────────────
  const { fetchedEvents, loading: fetchLoading } = useFetchEvents(
    fetchEvents, cal.view, cal.currentDate, weekStartDay,
  );

  // ── iCal feed polling ────────────────────────────────────────────────────
  const { feedEvents } = useFeedEvents(icalFeeds);

  // ── Supabase Realtime ────────────────────────────────────────────────────
  const [supabaseClient, setSupabaseClient] = useState(null);
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;
    import('@supabase/supabase-js')
      .then(({ createClient }) => setSupabaseClient(createClient(supabaseUrl, supabaseKey)))
      .catch(() => console.warn('[WorksCalendar] @supabase/supabase-js not installed.'));
  }, [supabaseUrl, supabaseKey]);

  const { events: realtimeEvents } = useRealtimeEvents({
    supabaseClient,
    table:  supabaseTable,
    filter: supabaseFilter,
  });

  // ── Merge all sources → normalize ────────────────────────────────────────
  const allNormalized = useMemo(() => {
    const map = new Map();
    [...rawEvents, ...fetchedEvents, ...feedEvents, ...realtimeEvents].forEach(ev => {
      const key = ev.id ?? `${ev.title}||${String(ev.start)}`;
      map.set(key, ev);
    });
    return normalizeEvents([...map.values()]);
  }, [rawEvents, fetchedEvents, feedEvents, realtimeEvents]);

  // ── Expand recurring events within the visible range ─────────────────────
  const expandedEvents = useOccurrences(allNormalized, range.start, range.end);

  // ── Derive categories / resources / filtered events ──────────────────────
  const categories    = useMemo(() => getCategories(expandedEvents), [expandedEvents]);
  const resources     = useMemo(() => getResources(expandedEvents),  [expandedEvents]);
  const visibleEvents = useMemo(() => applyFilters(expandedEvents, cal.filters), [expandedEvents, cal.filters]);

  // ── Local UI state ───────────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formEvent,     setFormEvent]     = useState(null);
  const [importOpen,    setImportOpen]    = useState(false);

  // ── CalendarApi / imperative handle ─────────────────────────────────────
  const api = useMemo(() => ({
    navigateTo:       (date) => cal.setCurrentDate(date),
    setView:          (view) => cal.setView(view),
    goToToday:        ()     => cal.goToToday(),
    openEvent:        (id)   => {
      const ev = expandedEvents.find(e => e.id === id);
      if (ev) setSelectedEvent(ev);
    },
    getVisibleEvents: ()     => visibleEvents,
    clearFilters:     ()     => cal.clearFilters(),
    addEvent:         (d={}) => setFormEvent(d),
  }), [cal, expandedEvents, visibleEvents]);

  useImperativeHandle(ref, () => api, [api]);

  // ── Callbacks ────────────────────────────────────────────────────────────
  const handleEventClick = useCallback((ev) => {
    setSelectedEvent(ev);
    onEventClickProp?.(ev);
  }, [onEventClickProp]);

  const handleEventSave = useCallback((ev) => {
    onEventSave?.(ev);
    setFormEvent(null);
  }, [onEventSave]);

  // Drag callbacks — prefer specific handler, fall back to onEventSave
  const handleEventMove = useCallback((ev, newStart, newEnd) => {
    const raw = ev._raw ?? ev;
    if (onEventMove) onEventMove(ev, newStart, newEnd);
    else onEventSave?.({ ...raw, start: newStart, end: newEnd });
  }, [onEventMove, onEventSave]);

  const handleEventResize = useCallback((ev, newStart, newEnd) => {
    const raw = ev._raw ?? ev;
    if (onEventResize) onEventResize(ev, newStart, newEnd);
    else onEventSave?.({ ...raw, start: newStart, end: newEnd });
  }, [onEventResize, onEventSave]);

  const handleEventDelete = useCallback((id) => {
    onEventDelete?.(id);
    setFormEvent(null);
  }, [onEventDelete]);

  const handleImport = useCallback((imported) => {
    onImport?.(imported);
    setImportOpen(false);
  }, [onImport]);

  const handleEditFromHoverCard = useCallback((ev) => {
    setSelectedEvent(null);
    setFormEvent(ev._raw ?? ev);
  }, []);

  // ── Context value ────────────────────────────────────────────────────────
  const ctxValue = useMemo(() => ({
    renderEvent, renderHoverCard, colorRules, businessHours, emptyState,
  }), [renderEvent, renderHoverCard, colorRules, businessHours, emptyState]);

  // ── Toolbar date label ───────────────────────────────────────────────────
  function getDateLabel() {
    const d = cal.currentDate;
    switch (cal.view) {
      case 'day':
        return format(d, 'EEEE, MMMM d, yyyy');
      case 'week': {
        const ws = startOfWeek(d, { weekStartsOn: weekStartDay });
        const we = endOfWeek(d,   { weekStartsOn: weekStartDay });
        const sameMo = ws.getMonth() === we.getMonth();
        const sameYr = ws.getFullYear() === we.getFullYear();
        if (sameMo)  return `${format(ws, 'MMM d')} – ${format(we, 'd, yyyy')}`;
        if (sameYr)  return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
        return `${format(ws, 'MMM d, yyyy')} – ${format(we, 'MMM d, yyyy')}`;
      }
      case 'schedule': {
        const ws = startOfWeek(startOfMonth(d), { weekStartsOn: weekStartDay });
        const we = addDays(ws, 7 * 6 - 1);
        return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
      }
      default:
        return format(d, 'MMMM yyyy');
    }
  }

  const hasAddButton = showAddButton || ownerCfg.isOwner;
  const hasImport    = !!(onImport || ownerCfg.isOwner);
  const isEmpty      = visibleEvents.length === 0;

  // Slot click (empty area) → open form seeded with the clicked time
  const handleSlotClick = useCallback((day, startD, endD) => {
    if (!hasAddButton) return;
    setFormEvent({ start: startD, end: endD });
  }, [hasAddButton]);

  const sharedViewProps = {
    currentDate:    cal.currentDate,
    events:         visibleEvents,
    onEventClick:   handleEventClick,
    onEventSave:    handleEventSave,
    onEventMove:    handleEventMove,
    onEventResize:  handleEventResize,
    onSlotClick:    handleSlotClick,
    config:         ownerCfg.config,
    weekStartDay,
  };

  return (
    <CalendarContext.Provider value={ctxValue}>
      <div className={styles.root} data-wc-theme={theme} data-testid="works-calendar">

        {/* ── Toolbar ── */}
        {renderToolbar ? (
          <div className={styles.customToolbar}>{renderToolbar(api)}</div>
        ) : (
          <div className={styles.toolbar}>
            <div className={styles.navGroup}>
              <button className={styles.navBtn} onClick={() => cal.navigate(-1)} aria-label="Previous">
                <ChevronLeft size={18} />
              </button>
              <button className={styles.todayBtn} onClick={cal.goToToday}>Today</button>
              <button className={styles.navBtn} onClick={() => cal.navigate(1)} aria-label="Next">
                <ChevronRight size={18} />
              </button>
              <span className={styles.dateLabel}>{getDateLabel()}</span>
              {fetchLoading && <span className={styles.loadingDot} title="Loading…" aria-label="Loading" />}
            </div>

            <div className={styles.viewGroup}>
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  className={[styles.viewBtn, cal.view === v.id && styles.activeView].filter(Boolean).join(' ')}
                  onClick={() => cal.setView(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className={styles.actions}>
              {hasAddButton && (
                <button className={styles.addBtn} onClick={() => setFormEvent({})}>
                  <Plus size={14} /><span className={styles.addBtnLabel}> Add Event</span>
                </button>
              )}
              {hasImport && (
                <button className={styles.exportBtn} onClick={() => setImportOpen(true)} title="Import .ics calendar">
                  <Upload size={15} />
                </button>
              )}
              <button className={styles.exportBtn} onClick={() => exportToExcel(visibleEvents)} title="Export to Excel">
                <Download size={15} />
              </button>
              {ownerPassword && (
                <OwnerLock
                  isOwner={ownerCfg.isOwner}
                  authError={ownerCfg.authError}
                  isAuthLoading={ownerCfg.isAuthLoading}
                  onAuthenticate={ownerCfg.authenticate}
                  onOpen={() => ownerCfg.setConfigOpen(true)}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Profile Bar ── */}
        <ProfileBar
          profiles={profiles.profiles}
          activeProfile={profiles.activeProfile}
          activeId={profiles.activeId}
          isDirty={profiles.isDirty}
          categories={categories}
          resources={resources}
          onApply={profiles.applyProfile}
          onAdd={profiles.addProfile}
          onResave={profiles.resaveProfile}
          onUpdate={profiles.updateProfile}
          onDelete={profiles.deleteProfile}
        />

        {/* ── Filter Bar ── */}
        <FilterBar
          categories={categories}
          resources={resources}
          filters={cal.filters}
          onToggleCategory={cal.toggleCategory}
          onToggleResource={cal.toggleResource}
          onSearch={cal.setSearch}
          onClear={cal.clearFilters}
        />

        {/* ── View area ── */}
        <div className={styles.viewArea}>
          {isEmpty && emptyState ? (
            <div className={styles.emptyStateWrap}>{emptyState}</div>
          ) : (
            <>
              {cal.view === 'month'    && (
                <MonthView
                  {...sharedViewProps}
                  onDayClick={day => hasAddButton && setFormEvent({ start: day, end: day })}
                />
              )}
              {cal.view === 'week'     && <WeekView     {...sharedViewProps} />}
              {cal.view === 'day'      && <DayView      {...sharedViewProps} />}
              {cal.view === 'agenda'   && <AgendaView   currentDate={cal.currentDate} events={visibleEvents} onEventClick={handleEventClick} />}
              {cal.view === 'schedule' && <ScheduleView {...sharedViewProps} />}
              {cal.view === 'timeline' && <TimelineView currentDate={cal.currentDate} events={visibleEvents} onEventClick={handleEventClick} />}
            </>
          )}
        </div>

        {/* ── Hover card ── */}
        {selectedEvent && (
          renderHoverCard
            ? renderHoverCard(selectedEvent, () => setSelectedEvent(null))
            : (
              <HoverCard
                event={selectedEvent}
                config={ownerCfg.config}
                note={notes[selectedEvent.id]}
                onClose={() => setSelectedEvent(null)}
                onNoteSave={onNoteSave}
                onNoteDelete={onNoteDelete}
                onEdit={ownerCfg.isOwner ? handleEditFromHoverCard : null}
              />
            )
        )}

        {/* ── Event form ── */}
        {formEvent !== null && (
          <EventForm
            event={formEvent.id ? formEvent : null}
            config={ownerCfg.config}
            categories={categories}
            onSave={handleEventSave}
            onDelete={onEventDelete ? handleEventDelete : null}
            onClose={() => setFormEvent(null)}
          />
        )}

        {/* ── Import zone ── */}
        {importOpen && (
          <ImportZone onImport={handleImport} onClose={() => setImportOpen(false)} />
        )}

        {/* ── Owner config panel ── */}
        {ownerCfg.configOpen && (
          <ConfigPanel
            config={ownerCfg.config}
            categories={categories}
            onUpdate={ownerCfg.updateConfig}
            onClose={ownerCfg.closeConfig}
          />
        )}
      </div>
    </CalendarContext.Provider>
  );
});
