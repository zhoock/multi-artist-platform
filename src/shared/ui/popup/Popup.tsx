// src/shared/ui/popup/Popup.tsx
import { memo, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import clsx from 'clsx';
import type { PopupProps } from 'models';
import { promoteToastLayers } from '@shared/lib/toast/useToastLayerDialog';
import { PopupContext } from './PopupContext';
import './style.scss';
import '../localModal/localModal.scss';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** DOM FocusOptions.focusVisible — not in older lib.dom typings yet. */
type FocusOptionsWithVisible = FocusOptions & { focusVisible?: boolean };

function focusWithoutVisibleRing(element: HTMLElement): void {
  element.focus({ preventScroll: true, focusVisible: false } as FocusOptionsWithVisible);
}

const PopupComponent = ({
  children,
  isActive,
  bgColor,
  onClose,
  closeBlocked = false,
  onCancelRequest,
  requestCloseRef,
  publicBackdrop,
  autoFocusFirstElement = true,
  initialFocusSelector,
  'aria-labelledby': ariaLabelledBy,
}: PopupProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  /** Skip onClose when parent sets isActive=false (not user dismiss). */
  const closingProgrammaticallyRef = useRef(false);

  const requestClose = useCallback(() => {
    if (closeBlocked) return;
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    // Dialog already closed (e.g. race) — still run consumer side effects once.
    onCloseRef.current?.();
  }, [closeBlocked]);

  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = requestClose;
    return () => {
      requestCloseRef.current = null;
    };
  }, [requestClose, requestCloseRef]);

  const popupContextValue = useMemo(
    () => ({
      requestClose,
      isCloseBlocked: Boolean(closeBlocked),
    }),
    [requestClose, closeBlocked]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (e: Event) => {
      if (closeBlocked) {
        e.preventDefault();
        return;
      }
      if (onCancelRequest) {
        e.preventDefault();
        onCancelRequest();
      }
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [closeBlocked, onCancelRequest]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isActive && !dialog.open) {
      dialog.showModal();
      promoteToastLayers();
      if (autoFocusFirstElement) {
        // Фокус на первом фокусируемом элементе внутри dialog для доступности
        // Используем setTimeout для предотвращения конфликтов с расширениями браузера
        setTimeout(() => {
          const initialFocusTarget = initialFocusSelector
            ? dialog.querySelector<HTMLElement>(initialFocusSelector)
            : null;
          const focusTarget =
            initialFocusTarget ?? dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          // Modal open autofocus: keep focus for screen readers/Tab order, hide mouse-open ring.
          if (focusTarget) {
            focusWithoutVisibleRing(focusTarget);
          }
        }, 0);
      }
    } else if (!isActive && dialog.open) {
      closingProgrammaticallyRef.current = true;
      dialog.close();
    }
  }, [isActive, autoFocusFirstElement, initialFocusSelector]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      if (closingProgrammaticallyRef.current) {
        closingProgrammaticallyRef.current = false;
        return;
      }
      onCloseRef.current?.();
    };

    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, []);

  // popup__gradient рендерится только для плеера (когда передан bgColor)
  const shouldRenderGradient = !!bgColor;

  return (
    <dialog
      ref={dialogRef}
      className={clsx('popup', publicBackdrop && 'local-modal')}
      style={{ background: bgColor }}
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      {shouldRenderGradient && (
        <div className="popup__gradient" style={{ background: bgColor }} aria-hidden="true"></div>
      )}
      <PopupContext.Provider value={popupContextValue}>{children}</PopupContext.Provider>
    </dialog>
  );
};

export const Popup = memo(PopupComponent);
