// src/shared/ui/popup/Popup.tsx
import { memo, useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { PopupProps } from 'models';
import './style.scss';
import '../localModal/localModal.scss';

const PopupComponent = ({
  children,
  isActive,
  bgColor,
  onClose,
  closeBlocked,
  publicBackdrop,
  autoFocusFirstElement = true,
  'aria-labelledby': ariaLabelledBy,
}: PopupProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (e: Event) => {
      if (closeBlocked) e.preventDefault();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [closeBlocked]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isActive && !dialog.open) {
      dialog.showModal();
      if (autoFocusFirstElement) {
        // Фокус на первом фокусируемом элементе внутри dialog для доступности
        // Используем setTimeout для предотвращения конфликтов с расширениями браузера
        setTimeout(() => {
          const firstFocusable = dialog.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        }, 0);
      }
    } else if (!isActive && dialog.open) {
      dialog.close();
    }
  }, [isActive, autoFocusFirstElement]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose?.();
    };

    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

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
      {children}
    </dialog>
  );
};

export const Popup = memo(PopupComponent);
