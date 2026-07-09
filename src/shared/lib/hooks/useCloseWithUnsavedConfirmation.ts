import { useCallback, useEffect, useId, useState } from 'react';
import { flushSync } from 'react-dom';

export interface UseCloseWithUnsavedConfirmationArgs {
  isOpen: boolean;
  /** Блокировать закрытие (например во время сохранения). */
  isBusy?: boolean;
  /** Несохранённые изменения пользователя. */
  hasUnsavedChanges: boolean;
  /**
   * Закрывает native `<dialog>` (обычно `() => popupRequestCloseRef.current?.()`).
   * Хук вызывается в компоненте, который рендерит `<Popup>`, поэтому `usePopup()` здесь недоступен.
   */
  closeDialog: () => void;
}

/**
 * Диалог «Прогресс будет потерян» перед закрытием модалки с несохранённым вводом.
 * После подтверждения вызывает `closeDialog()` → dialog.close() → Popup.onClose.
 * Escape/backdrop: `onCancelRequest={() => guard.requestClose()}`; side effects: `Popup.onClose={finalize}`.
 */
export function useCloseWithUnsavedConfirmation({
  isOpen,
  isBusy = false,
  hasUnsavedChanges,
  closeDialog,
}: UseCloseWithUnsavedConfirmationArgs) {
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const discardTitleDomId = useId();

  useEffect(() => {
    if (!isOpen) setDiscardDialogOpen(false);
  }, [isOpen]);

  const dismissDiscardDialog = useCallback(() => setDiscardDialogOpen(false), []);

  const requestClose = useCallback(
    (opts?: { force?: boolean }) => {
      if (isBusy && !opts?.force) return;
      if (!opts?.force && hasUnsavedChanges) {
        setDiscardDialogOpen(true);
        return;
      }
      setDiscardDialogOpen(false);
      closeDialog();
    },
    [isBusy, hasUnsavedChanges, closeDialog]
  );

  const finalizeCloseWithoutSaving = useCallback(() => {
    // Popup often sets closeBlocked while discardDialogOpen; clear it before closeDialog().
    flushSync(() => setDiscardDialogOpen(false));
    closeDialog();
  }, [closeDialog]);

  return {
    requestClose,
    finalizeCloseWithoutSaving,
    discardDialogOpen,
    discardTitleDomId,
    dismissDiscardDialog,
  };
}
