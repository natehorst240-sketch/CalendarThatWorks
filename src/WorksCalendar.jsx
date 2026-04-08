/**
 * WorksCalendar — main component.
 */
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';

import { useCalendar }    from './hooks/useCalendar.js';
import { useOwnerConfig } from './hooks/useOwnerConfig.js';
import { useProfiles }    from './hooks/useProfiles.js';
import FilterBar          from './ui/FilterBar.jsx';
import ProfileBar         from './ui/ProfileBar.jsx';
import HoverCard          from './ui/HoverCard.jsx';
import OwnerLock          from './ui/OwnerLock.jsx';
import ConfigPanel        from './ui/ConfigPanel.jsx';
import EventForm          from './ui/EventForm.jsx';
import MonthView          from './views/MonthView.jsx';
import WeekView           from './views/WeekView.jsx';
import DayView            from './views/DayView.jsx';
import AgendaView         from './views/AgendaView.jsx';
import ScheduleView       from './views/ScheduleView.jsx';
import { exportToExcel }  from './export/excelExport.js';

import styles from './WorksCalendar.module.css';

const VIEWS = [
  { id: 'month',    label: 'Month' },
  { id: 'week',     label: 'Week' },
  { id: 'day',      label: 'Day' },
  { id: 'agenda',   label: 'Agenda' },
  { id: 'schedule', label: 'Schedule' },
];

export function WorksCalendar({
  events:     rawEvents   = [],
  calendarId              = 'default',
  ownerPassword           = '',
  onConfigSave,
  notes       = {},
  onNoteSave,
  onNoteDelete,
  onEventClick: onEventClickProp,
  onEventSave,
  onEventDelete,
  theme       = 'light',
  showAddButton           = false,
}) {
  const cal = useCalendar(rawEvents);
  const ownerCfg = useOwnerConfig({ calendarId, ownerPassword, onConfigSave });

  const profiles = useProfiles({
    calendarId,
    filters:    cal.filters,
    view:       cal.view,
    setFilters: cal.replaceFilters,
    setView:    cal.setView,
  });

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formEvent,     setFormEvent]     = useState(null);

  const weekStartDay = ownerCfg.config?.display?.weekStartDay ?? 0;

  const handleEventClick = useCallback((ev) => {
    setSelectedEvent(ev);
    onEventClickProp?.(ev);
  }, [onEventClickProp]);

  const handleEventSave = useCallback((ev) => {
    onEventSave?.(ev);
    setFormEvent(null);
  }, [onEventSave]);

  const handleEventDelete = useCallback((id) => {
    onEventDelete?.(id);
    setFormEvent(null);
  }, [onEventDelete]);

  function getDateLabel() {
    if (cal.view === 'day')  return format(cal.currentDate, 'EEEE, MMMM d, yyyy');
    if (cal.view === 'week') return format(cal.currentDate, "MMM d, yyyy 'week'");
    return format(cal.currentDate, 'MMMM yyyy');
  }

  const hasAddButton = showAddButton || ownerCfg.isOwner;

  return (
    <div className={styles.root} data-wc-theme={theme} data-testid="works-calendar">

      {/* ── Toolbar ── */}
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
          <button className={styles.exportBtn} onClick={() => exportToExcel(cal.visibleEvents)} title="Export to Excel">
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

      {/* ── Profile Bar ── */}
      <ProfileBar
        profiles={profiles.profiles}
        activeProfile={profiles.activeProfile}
        activeId={profiles.activeId}
        isDirty={profiles.isDirty}
        categories={cal.categories}
        resources={cal.resources}
        onApply={profiles.applyProfile}
        onAdd={profiles.addProfile}
        onResave={profiles.resaveProfile}
        onUpdate={profiles.updateProfile}
        onDelete={profiles.deleteProfile}
      />

      {/* ── Filter Bar ── */}
      <FilterBar
        categories={cal.categories}
        resources={cal.resources}
        filters={cal.filters}
        onToggleCategory={cal.toggleCategory}
        onToggleResource={cal.toggleResource}
        onSearch={cal.setSearch}
        onClear={cal.clearFilters}
      />

      {/* ── View ── */}
      <div className={styles.viewArea}>
        {cal.view === 'month' && (
          <MonthView
            currentDate={cal.currentDate}
            events={cal.visibleEvents}
            onEventClick={handleEventClick}
            onDayClick={day => hasAddButton && setFormEvent({ start: day, end: day })}
            config={ownerCfg.config}
            weekStartDay={weekStartDay}
          />
        )}
        {cal.view === 'week' && (
          <WeekView
            currentDate={cal.currentDate}
            events={cal.visibleEvents}
            onEventClick={handleEventClick}
            config={ownerCfg.config}
            weekStartDay={weekStartDay}
          />
        )}
        {cal.view === 'day' && (
          <DayView
            currentDate={cal.currentDate}
            events={cal.visibleEvents}
            onEventClick={handleEventClick}
            config={ownerCfg.config}
          />
        )}
        {cal.view === 'agenda' && (
          <AgendaView
            currentDate={cal.currentDate}
            events={cal.visibleEvents}
            onEventClick={handleEventClick}
          />
        )}
        {cal.view === 'schedule' && (
          <ScheduleView
            currentDate={cal.currentDate}
            events={cal.visibleEvents}
            onEventClick={handleEventClick}
            weekStartDay={weekStartDay}
          />
        )}
      </div>

      {/* ── Hover card ── */}
      {selectedEvent && (
        <HoverCard
          event={selectedEvent}
          config={ownerCfg.config}
          note={notes[selectedEvent.id]}
          onClose={() => setSelectedEvent(null)}
          onNoteSave={onNoteSave}
          onNoteDelete={onNoteDelete}
        />
      )}

      {/* ── Event form ── */}
      {formEvent !== null && (
        <EventForm
          event={formEvent.id ? formEvent : null}
          config={ownerCfg.config}
          categories={cal.categories}
          onSave={handleEventSave}
          onDelete={onEventDelete ? handleEventDelete : null}
          onClose={() => setFormEvent(null)}
        />
      )}

      {/* ── Owner config panel ── */}
      {ownerCfg.configOpen && (
        <ConfigPanel
          config={ownerCfg.config}
          categories={cal.categories}
          onUpdate={ownerCfg.updateConfig}
          onClose={ownerCfg.closeConfig}
        />
      )}
    </div>
  );
}
