import { useEffect, type LegacyRef, type ReactNode, type RefObject } from 'react';
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
      onClick={(event) => {
        if (closeOnBackdropClick && event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}
