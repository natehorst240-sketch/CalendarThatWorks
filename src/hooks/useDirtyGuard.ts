/**
 * useDirtyGuard — intercept close paths on form-y modals so unsaved
 * changes get a discard-confirmation step instead of vanishing silently.
 *
 * Pattern model: form modals (EventForm / AvailabilityForm /
 * ScheduleEditorForm / AssetRequestForm / WorkflowBuilderModal /
 * SetupWizardModal) compute `dirty` from their draft state, then route
 * every close path — the X button, overlay click, the focus-trap escape
 * handler — through `requestClose` instead of bare `onClose`. When
 * `pendingClose` is true, render `<ConfirmDialog />` and wire its
 * handlers to `confirmDiscard` / `cancelDiscard`.
 *
 * Why a hook (not a wrapper component): focus-trap binds Escape on
 * `document` at the capture phase, and the close paths are scattered
 * across the modal's own JSX. A hook leaves the caller in control of
 * where the ConfirmDialog renders.
 */
import { useCallback, useState } from 'react';

export type UseDirtyGuardResult = {
  /**
   * Pass to every close path: X button onClick, overlay click handler,
   * useFocusTrap's onEscape, and any "Cancel" button outside the form's
   * own dirty surface.
   */
  requestClose: () => void;
  /** When true, the host should render a discard ConfirmDialog. */
  pendingClose: boolean;
  /** User confirmed discard — closes the modal. */
  confirmDiscard: () => void;
  /** User cancelled discard — keeps the modal open. */
  cancelDiscard: () => void;
};

export function useDirtyGuard({
  dirty,
  onClose,
}: {
  dirty: boolean;
  onClose: () => void;
}): UseDirtyGuardResult {
  const [pendingClose, setPendingClose] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) {
      setPendingClose(true);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setPendingClose(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => setPendingClose(false), []);

  return { requestClose, pendingClose, confirmDiscard, cancelDiscard };
}
