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

const POPUP_FOCUS_SENTINEL_SELECTOR = '.popup__focus-sentinel';

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
  const focusSentinelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const initialFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  /** Skip onClose when parent sets isActive=false (not user dismiss). */
  const closingProgrammaticallyRef = useRef(false);

  const restoreFocus = useCallback(() => {
    const target = previouslyFocusedRef.current;
    if (!target?.isConnected) return;

    queueMicrotask(() => {
      if (!target.isConnected) return;
      focusWithoutVisibleRing(target);
    });
  }, []);

  const clearInitialFocusTimeout = useCallback(() => {
    if (initialFocusTimeoutRef.current === null) return;
    clearTimeout(initialFocusTimeoutRef.current);
    initialFocusTimeoutRef.current = null;
  }, []);

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
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        !dialog.contains(activeElement)
      ) {
        previouslyFocusedRef.current = activeElement;
      }

      dialog.showModal();
      promoteToastLayers();
      if (autoFocusFirstElement) {
        // Neutral sentinel keeps focus out of header Close while preserving dialog focus trap.
        clearInitialFocusTimeout();
        initialFocusTimeoutRef.current = setTimeout(() => {
          initialFocusTimeoutRef.current = null;
          if (!dialog.open) return;

          const selector = initialFocusSelector ?? POPUP_FOCUS_SENTINEL_SELECTOR;
          const focusTarget =
            dialog.querySelector<HTMLElement>(selector) ?? focusSentinelRef.current;
          if (focusTarget) {
            focusWithoutVisibleRing(focusTarget);
          }
        }, 0);
      }
    } else if (!isActive && dialog.open) {
      clearInitialFocusTimeout();
      closingProgrammaticallyRef.current = true;
      dialog.close();
      restoreFocus();
    }
  }, [
    isActive,
    autoFocusFirstElement,
    initialFocusSelector,
    clearInitialFocusTimeout,
    restoreFocus,
  ]);

  useEffect(() => () => clearInitialFocusTimeout(), [clearInitialFocusTimeout]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      clearInitialFocusTimeout();
      const skipOnClose = closingProgrammaticallyRef.current;
      if (closingProgrammaticallyRef.current) {
        closingProgrammaticallyRef.current = false;
      }
      if (!skipOnClose) {
        onCloseRef.current?.();
      }
      restoreFocus();
    };

    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [restoreFocus, clearInitialFocusTimeout]);

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
      <div
        ref={focusSentinelRef}
        className="popup__focus-sentinel"
        tabIndex={-1}
        aria-hidden="true"
      />
      <PopupContext.Provider value={popupContextValue}>{children}</PopupContext.Provider>
    </dialog>
  );
};

export const Popup = memo(PopupComponent);
