import { useState, useCallback, useRef } from 'react';
import { useSavedFlash } from './useSavedFlash';
import type { NormalizedEvent } from '../types/events';
import type { EmployeeRecord } from '../WorksCalendar.types';

/**
 * Draft event the user is composing in the editor / new-event form. Loose by
 * design — accepts the public `WorksCalendarEvent` shape, the internal
 * `NormalizedEvent`, and the partial drafts the toolbar / pool / cell-click
 * paths build, plus a handful of form-only fields (e.g. `resourcePoolId`).
 */
export interface FormEventDraft {
  /** Accepts both the public `WorksCalendarEvent` shape (`id?: string | undefined`)
   *  and the internal `NormalizedEvent` shape (`id: string`). */
  id?: string | undefined;
  /** Set when launching the form from a resource-pool row. */
  resourcePoolId?: string | null;
  start?: Date | string | undefined;
  end?: Date | string | undefined;
  resource?: string | undefined;
}

/** Anchor for the in-place pill editor popover. */
export interface InlineEditTarget {
  event: NormalizedEvent;
  x: number;
  y: number;
}

/** Modal state for the PTO / Unavailable picker. */
export interface AvailabilityModalState {
  emp: EmployeeRecord;
  kind: string;
  start: Date | string;
  initialEvent?: NormalizedEvent | null;
}

/** Modal state for the shift / on-call editor. */
export interface ScheduleEditorModalState {
  emp: EmployeeRecord;
  start: Date;
  end: Date;
}

export interface UseModalStateReturn {
  selectedEvent: NormalizedEvent | null;
  setSelectedEvent: (ev: NormalizedEvent | null) => void;
  formEvent: FormEventDraft | null;
  setFormEvent: (ev: FormEventDraft | null) => void;
  conflictingEventIds: ReadonlySet<string>;
  handleLiveConflicts: (ids: readonly string[] | null) => void;
  assetRequestOpen: boolean;
  setAssetRequestOpen: (v: boolean) => void;
  importOpen: boolean;
  setImportOpen: (v: boolean) => void;
  importMsg: string;
  setImportMsg: (v: string) => void;
  importFlash: ReturnType<typeof useSavedFlash>;
  scheduleOpen: boolean;
  setScheduleOpen: (v: boolean) => void;
  availabilityState: AvailabilityModalState | null;
  setAvailabilityState: (v: AvailabilityModalState | null) => void;
  scheduleEditorState: ScheduleEditorModalState | null;
  setScheduleEditorState: (v: ScheduleEditorModalState | null) => void;
  pillHoverTitle: boolean;
  setPillHoverTitle: (v: boolean) => void;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  inlineEditTarget: InlineEditTarget | null;
  setInlineEditTarget: (v: InlineEditTarget | null) => void;
  lastClickCoordsRef: React.MutableRefObject<{ x: number; y: number }>;
  editModeRef: React.MutableRefObject<boolean>;
}

export function useModalState(): UseModalStateReturn {
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null);
  const [formEvent, setFormEvent] = useState<FormEventDraft | null>(null);

  const [conflictingEventIds, setConflictingEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const handleLiveConflicts = useCallback((ids: readonly string[] | null) => {
    setConflictingEventIds(prev => {
      if (!ids || ids.length === 0) return prev.size === 0 ? prev : new Set();
      if (prev.size === ids.length) {
        let same = true;
        for (const id of ids) if (!prev.has(id)) { same = false; break; }
        if (same) return prev;
      }
      return new Set(ids);
    });
  }, []);

  const [assetRequestOpen, setAssetRequestOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const importFlash = useSavedFlash(2500);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [availabilityState, setAvailabilityState] = useState<AvailabilityModalState | null>(null);
  const [scheduleEditorState, setScheduleEditorState] = useState<ScheduleEditorModalState | null>(null);
  const [pillHoverTitle, setPillHoverTitle] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inlineEditTarget, setInlineEditTarget] = useState<InlineEditTarget | null>(null);

  const lastClickCoordsRef = useRef({ x: 0, y: 0 });
  const editModeRef = useRef(false);
  editModeRef.current = editMode;

  return {
    selectedEvent, setSelectedEvent,
    formEvent, setFormEvent,
    conflictingEventIds, handleLiveConflicts,
    assetRequestOpen, setAssetRequestOpen,
    importOpen, setImportOpen,
    importMsg, setImportMsg,
    importFlash,
    scheduleOpen, setScheduleOpen,
    availabilityState, setAvailabilityState,
    scheduleEditorState, setScheduleEditorState,
    pillHoverTitle, setPillHoverTitle,
    editMode, setEditMode,
    helpOpen, setHelpOpen,
    inlineEditTarget, setInlineEditTarget,
    lastClickCoordsRef,
    editModeRef,
  };
}
