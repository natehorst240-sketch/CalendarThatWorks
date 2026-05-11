import { useCallback, useEffect } from 'react';
import type React from 'react';
import { useEventMutations } from './useEventMutations';
import { useScheduleMutations } from './useScheduleMutations';
import { useScheduleTemplates } from './useScheduleTemplates';
import { useOwnerConfig } from './useOwnerConfig';
import { useSourceStore } from './useSourceStore';
import { usePermissions } from './usePermissions';
import type { UseCalendarEngineResult } from './useCalendarEngine';
import type { AnnouncerRef } from '../ui/ScreenReaderAnnouncer';
import type { NormalizedEvent, WorksCalendarEvent } from '../types/events';
import type { WorksCalendarProps, CalendarRole, EmployeeRecord } from '../WorksCalendar.types';
import type { UseModalStateReturn } from './useModalState';

export interface UseCalendarMutationsInput {
  // Templates
  scheduleTemplates: WorksCalendarProps['scheduleTemplates'];
  scheduleInstantiationLimits: WorksCalendarProps['scheduleInstantiationLimits'];
  scheduleTemplateAdapter: WorksCalendarProps['scheduleTemplateAdapter'];
  onScheduleTemplateAnalytics: WorksCalendarProps['onScheduleTemplateAnalytics'];
  role: CalendarRole | undefined;
  ownerCfg: ReturnType<typeof useOwnerConfig>;
  businessHours: WorksCalendarProps['businessHours'];
  blockedWindows: WorksCalendarProps['blockedWindows'];
  // Engine
  applyEngineOp: UseCalendarEngineResult['applyEngineOp'];
  applyWithRecurringCheck: UseCalendarEngineResult['applyWithRecurringCheck'];
  getSavedEventPayload: UseCalendarEngineResult['getSavedEventPayload'];
  engine: UseCalendarEngineResult['engine'];
  engineVer: number;
  expandedEvents: NormalizedEvent[];
  visibleEvents: NormalizedEvent[];
  undoManager: UseCalendarEngineResult['undoManager'];
  announcerRef: React.RefObject<AnnouncerRef | null>;
  sourceStore: ReturnType<typeof useSourceStore>;
  // Event callbacks
  onEventSave: WorksCalendarProps['onEventSave'];
  onEventMove: WorksCalendarProps['onEventMove'];
  onEventResize: WorksCalendarProps['onEventResize'];
  onEventDelete: WorksCalendarProps['onEventDelete'];
  onEventGroupChange: WorksCalendarProps['onEventGroupChange'];
  onAvailabilitySave: WorksCalendarProps['onAvailabilitySave'];
  onScheduleSave: WorksCalendarProps['onScheduleSave'];
  onEmployeeAction: WorksCalendarProps['onEmployeeAction'];
  onEventClickProp: WorksCalendarProps['onEventClick'];
  onDateSelect: WorksCalendarProps['onDateSelect'];
  onImport: WorksCalendarProps['onImport'];
  // Setup-derived
  configuredEmployees: EmployeeRecord[];
  devMode: boolean;
  showAddButton: boolean;
  perms: ReturnType<typeof usePermissions>;
  // Modal state (subset of UseModalStateReturn)
  inlineEditTarget: UseModalStateReturn['inlineEditTarget'];
  setFormEvent: UseModalStateReturn['setFormEvent'];
  setInlineEditTarget: UseModalStateReturn['setInlineEditTarget'];
  setSelectedEvent: UseModalStateReturn['setSelectedEvent'];
  editModeRef: UseModalStateReturn['editModeRef'];
  lastClickCoordsRef: UseModalStateReturn['lastClickCoordsRef'];
  importFlash: UseModalStateReturn['importFlash'];
  setImportOpen: UseModalStateReturn['setImportOpen'];
  setImportMsg: UseModalStateReturn['setImportMsg'];
  setAvailabilityState: UseModalStateReturn['setAvailabilityState'];
  setScheduleEditorState: UseModalStateReturn['setScheduleEditorState'];
  setScheduleOpen: UseModalStateReturn['setScheduleOpen'];
}

export function useCalendarMutations({
  scheduleTemplates, scheduleInstantiationLimits, scheduleTemplateAdapter, onScheduleTemplateAnalytics,
  role, ownerCfg, businessHours, blockedWindows,
  applyEngineOp, applyWithRecurringCheck, getSavedEventPayload, engine, engineVer,
  expandedEvents, visibleEvents, undoManager, announcerRef, sourceStore,
  onEventSave, onEventMove, onEventResize, onEventDelete, onEventGroupChange,
  onAvailabilitySave, onScheduleSave, onEmployeeAction, onEventClickProp, onDateSelect, onImport,
  configuredEmployees, devMode, showAddButton, perms,
  inlineEditTarget, setFormEvent, setInlineEditTarget, setSelectedEvent,
  editModeRef, lastClickCoordsRef, importFlash, setImportOpen, setImportMsg,
  setAvailabilityState, setScheduleEditorState, setScheduleOpen,
}: UseCalendarMutationsInput) {
  const {
    templateError, visibleScheduleTemplates, mergedScheduleTemplates,
    buildSchedulePreview, handleScheduleInstantiate,
    handleCreateScheduleTemplate, handleDeleteScheduleTemplate,
  } = useScheduleTemplates({
    scheduleTemplates: scheduleTemplates ?? [], scheduleInstantiationLimits, scheduleTemplateAdapter, onScheduleTemplateAnalytics,
    role, isOwner: ownerCfg.isOwner,
    engine: engine as unknown as { state: { events: Map<string, unknown> } },
    ownerBusinessHours: ownerCfg.config?.['businessHours'],
    businessHours, blockedWindows: blockedWindows ?? [],
    applyEngineOp, getSavedEventPayload, onEventSave,
    onInstantiateSuccess: () => setScheduleOpen(false),
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const did = undoManager.undo();
        if (did) announcerRef.current?.announce('Undo.');
        return;
      }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        const did = undoManager.redo();
        if (did) announcerRef.current?.announce('Redo.');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoManager, announcerRef]);

  const {
    emitEventSave, checkEventConflicts,
    handleEventSave, handleEventMove, handleEventResize,
    handleEventGroupChange, handleEventDelete, handleInlineSave, handleInlineDelete,
  } = useEventMutations({
    applyEngineOp, applyWithRecurringCheck, getSavedEventPayload,
    engine, engineVer, expandedEvents,
    onEventSave, onEventMove, onEventResize, onEventDelete, onEventGroupChange,
    ownerConfig: ownerCfg.config,
    inlineEditTarget, setFormEvent, setInlineEditTarget,
  });

  const handleEventClick = useCallback((ev: NormalizedEvent) => {
    if (editModeRef.current) {
      setSelectedEvent(null);
      setInlineEditTarget({ event: ev, x: lastClickCoordsRef.current.x, y: lastClickCoordsRef.current.y });
      return;
    }
    setSelectedEvent(ev);
    onEventClickProp?.(ev._raw ?? (ev as unknown as WorksCalendarEvent));
  }, [onEventClickProp, editModeRef, setSelectedEvent, setInlineEditTarget, lastClickCoordsRef]);

  const {
    handleShiftStatusChange, handleCoverageAssign, handleEmployeeAction,
    handleAvailabilitySave, handleScheduleEditorSave,
  } = useScheduleMutations({
    applyEngineOp, emitEventSave, getSavedEventPayload,
    expandedEvents, configuredEmployees,
    onEventDelete, onAvailabilitySave, onScheduleSave,
    onEmployeeAction,
    ownerConfig: ownerCfg.config,
    setAvailabilityState, setScheduleEditorState,
  });

  const handleImport = useCallback((imported: WorksCalendarProps['events'], meta: { label?: string } | null) => {
    const events = imported ?? [];
    onImport?.(events);
    sourceStore.addSource({ type: 'csv', label: meta?.label ?? 'CSV Import', color: '#8b5cf6', events, importedAt: new Date().toISOString() });
    setImportOpen(false);
    const count = Array.isArray(imported) ? imported.length : 0;
    setImportMsg(`Imported ${count} event${count === 1 ? '' : 's'}`);
    importFlash.trigger();
  }, [onImport, sourceStore, importFlash, setImportOpen, setImportMsg]);

  const handleEditFromHoverCard = useCallback((ev: NormalizedEvent) => {
    setSelectedEvent(null);
    let formEv = ev._raw ?? ev;
    if (ev._recurring && ev._eventId) {
      const master = engine.state.events.get(ev._eventId);
      if (master?.rrule) formEv = { ...formEv, rrule: master.rrule };
    }
    setFormEvent(formEv);
  }, [engine, setSelectedEvent, setFormEvent]);

  const hasAddButton = (showAddButton || ownerCfg.isOwner || devMode) && perms.canAddEvent;
  const hasScheduleTemplatesFlag = Array.isArray(visibleScheduleTemplates) && visibleScheduleTemplates.length > 0;
  const hasImport    = !!(onImport || ownerCfg.isOwner);
  const isEmpty      = visibleEvents.length === 0;

  const handleDateSelect = useCallback((start: Date, end: Date) => {
    if (!hasAddButton) return;
    onDateSelect?.(start, end);
    setFormEvent({ start, end });
  }, [hasAddButton, onDateSelect, setFormEvent]);

  const handleScheduleDateSelect = useCallback((start: Date, end: Date, resourceId: string) => {
    if (!hasAddButton) return;
    onDateSelect?.(start, end, resourceId);
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    const emp = configuredEmployees.find((e) => String(e.id) === String(resourceId));
    if (!emp) { setFormEvent({ start: startDate, end: endDate, resource: resourceId }); return; }
    setScheduleEditorState({ emp, start: startDate, end: endDate });
  }, [configuredEmployees, hasAddButton, onDateSelect, setFormEvent, setScheduleEditorState]);

  const handlePoolDateSelect = useCallback((start: Date, end: Date, poolId: string) => {
    if (!hasAddButton) return;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate   = end   instanceof Date ? end   : new Date(end);
    setFormEvent({ start: startDate, end: endDate, resourcePoolId: poolId });
  }, [hasAddButton, setFormEvent]);

  return {
    templateError, visibleScheduleTemplates, mergedScheduleTemplates,
    buildSchedulePreview, handleScheduleInstantiate,
    handleCreateScheduleTemplate, handleDeleteScheduleTemplate,
    emitEventSave, checkEventConflicts,
    handleEventSave, handleEventMove, handleEventResize,
    handleEventGroupChange, handleEventDelete, handleInlineSave, handleInlineDelete,
    handleEventClick, handleEditFromHoverCard, handleImport,
    handleShiftStatusChange, handleCoverageAssign, handleEmployeeAction,
    handleAvailabilitySave, handleScheduleEditorSave,
    hasAddButton, hasScheduleTemplates: hasScheduleTemplatesFlag, hasImport, isEmpty,
    handleDateSelect, handleScheduleDateSelect, handlePoolDateSelect,
  };
}
