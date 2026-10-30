import { useEffect, useRef, type RefObject } from 'react';

const VIEWPORT_HEIGHT_VAR = '--subscription-plan-modal-viewport-height';

function resetPlanPickerScroll(dialog: HTMLDialogElement): void {
  dialog.scrollTop = 0;
  dialog.scrollLeft = 0;
  const body = dialog.querySelector('.subscription-plan-modal__body');
  if (body instanceof HTMLElement) {
    body.scrollTop = 0;
  }
}

function syncVisualViewportHeight(dialog: HTMLDialogElement): void {
  const height = window.visualViewport?.height ?? window.innerHeight;
  dialog.style.setProperty(VIEWPORT_HEIGHT_VAR, `${Math.round(height)}px`);
}

/**
 * Native `<dialog showModal()>` on iOS Safari is misaligned when `useBodyScrollLock`
 * fixes `body { position: fixed; top: -scrollY }` — the top-layer dialog shifts off
 * the visual viewport while the backdrop stays put.
 *
 * Pin dialog block-size to `visualViewport.height` and reset dialog/body scroll on open.
 */
export function useSubscriptionPlanModalPresentation(
  dialogRef: RefObject<HTMLDialogElement | null>,
  onShow?: () => void
): void {
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleShow = () => {
      resetPlanPickerScroll(dialog);
      syncVisualViewportHeight(dialog);
      requestAnimationFrame(() => {
        resetPlanPickerScroll(dialog);
        syncVisualViewportHeight(dialog);
      });
      onShowRef.current?.();
    };

    const handleClose = () => {
      dialog.style.removeProperty(VIEWPORT_HEIGHT_VAR);
    };

    const onViewportChange = () => {
      if (!dialog.open) return;
      syncVisualViewportHeight(dialog);
    };

    dialog.addEventListener('show', handleShow);
    dialog.addEventListener('close', handleClose);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);

    return () => {
      dialog.removeEventListener('show', handleShow);
      dialog.removeEventListener('close', handleClose);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
      dialog.style.removeProperty(VIEWPORT_HEIGHT_VAR);
    };
  }, [dialogRef]);
}
