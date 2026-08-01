import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const TOAST_LAYER_SELECTOR = 'dialog.toast-viewport-layer, dialog.toast-top-layer';

function isToastLayerDialog(dialog: HTMLDialogElement): boolean {
  return (
    dialog.classList.contains('toast-viewport-layer') ||
    dialog.classList.contains('toast-top-layer')
  );
}

/** Re-open toast layer dialogs so they stay above newly opened native modals. */
export function promoteToastLayers(): void {
  document.querySelectorAll<HTMLDialogElement>(TOAST_LAYER_SELECTOR).forEach((dialog) => {
    if (dialog.open) {
      dialog.close();
    }
    dialog.showModal();
  });
}

export function schedulePromoteToastLayers(): void {
  queueMicrotask(promoteToastLayers);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(promoteToastLayers);
  }
}

let toastLayerPromotionInstalled = false;

/** Ensure every non-toast showModal() re-promotes toast layers above modals. */
export function installToastLayerPromotion(): void {
  if (toastLayerPromotionInstalled || typeof HTMLDialogElement === 'undefined') {
    return;
  }

  toastLayerPromotionInstalled = true;

  const nativeShowModal = HTMLDialogElement.prototype.showModal;

  HTMLDialogElement.prototype.showModal = function showModalWithToastPromotion(
    this: HTMLDialogElement
  ) {
    nativeShowModal.call(this);

    if (!isToastLayerDialog(this)) {
      schedulePromoteToastLayers();
    }
  };
}

export function useToastLayerDialog(open: boolean, stackKey: string) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const syncDialogTopLayer = useCallback(
    (dialog: HTMLDialogElement | null) => {
      if (!dialog || !open) return;

      if (dialog.open) {
        dialog.close();
      }
      dialog.showModal();
    },
    [open, stackKey]
  );

  useLayoutEffect(() => {
    syncDialogTopLayer(dialogRef.current);

    return () => {
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
    };
  }, [open, stackKey, syncDialogTopLayer]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const preventDismiss = (event: Event) => {
      event.preventDefault();
    };

    dialog.addEventListener('cancel', preventDismiss);
    return () => dialog.removeEventListener('cancel', preventDismiss);
  }, []);

  const setDialogRef = useCallback(
    (node: HTMLDialogElement | null) => {
      dialogRef.current = node;
      syncDialogTopLayer(node);
    },
    [syncDialogTopLayer]
  );

  return setDialogRef;
}
