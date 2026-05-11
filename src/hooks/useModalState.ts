/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: remove as types are tightened */
import { useState, useCallback, useRef } from 'react';
import { useSavedFlash } from './useSavedFlash';

type LooseValue = any;

export interface UseModalStateReturn {
  selectedEvent: LooseValue | null;
  setSelectedEvent: (ev: LooseValue | null) => void;
  formEvent: LooseValue | null;
  setFormEvent: (ev: LooseValue | null) => void;
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
  availabilityState: LooseValue | null;
  setAvailabilityState: (v: LooseValue | null) => void;
  scheduleEditorState: LooseValue | null;
  setScheduleEditorState: (v: LooseValue | null) => void;
  pillHoverTitle: boolean;
  setPillHoverTitle: (v: boolean) => void;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  inlineEditTarget: LooseValue | null;
  setInlineEditTarget: (v: LooseValue | null) => void;
  lastClickCoordsRef: React.MutableRefObject<{ x: number; y: number }>;
  editModeRef: React.MutableRefObject<boolean>;
}

export function useModalState(): UseModalStateReturn {
  const [selectedEvent, setSelectedEvent] = useState<LooseValue | null>(null);
  const [formEvent, setFormEvent] = useState<LooseValue | null>(null);

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
  const [availabilityState, setAvailabilityState] = useState<LooseValue | null>(null);
  const [scheduleEditorState, setScheduleEditorState] = useState<LooseValue | null>(null);
  const [pillHoverTitle, setPillHoverTitle] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inlineEditTarget, setInlineEditTarget] = useState<LooseValue | null>(null);

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
