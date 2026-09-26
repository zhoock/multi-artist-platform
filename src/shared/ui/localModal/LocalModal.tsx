import { useEffect, useRef, type LegacyRef, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';

import { promoteToastLayers } from '@shared/lib/toast/useToastLayerDialog';
import '@shared/ui/popup/style.scss';
import './localModal.scss';

export type LocalModalProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** When set, syncs native dialog open state via showModal/close. */
  isOpen?: boolean;
  onClose: () => void;
  className?: string;
  'aria-labelledby'?: string;
  children: ReactNode;
  closeOnBackdropClick?: boolean;
};

/**
 * Native `<dialog>` shell for local public modals (Premium Archive, Premium Success, …).
 * Uses shared `--public-modal-backdrop-*` tokens on `::backdrop`.
 */
export function LocalModal({
  dialogRef,
  isOpen,
  onClose,
  className,
  'aria-labelledby': ariaLabelledBy,
  children,
  closeOnBackdropClick = true,
}: LocalModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [dialogRef]);

  useEffect(() => {
    if (isOpen === undefined) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      promoteToastLayers();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [dialogRef, isOpen]);

  return (
    <dialog
      ref={dialogRef as LegacyRef<HTMLDialogElement>}
      className={clsx('popup', 'local-modal', className)}
      aria-labelledby={ariaLabelledBy}
      aria-modal="true"
    >
      {closeOnBackdropClick ? (
        <button
          type="button"
          className="local-modal__backdrop"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => onCloseRef.current()}
        />
      ) : null}
      {children}
    </dialog>
  );
}
