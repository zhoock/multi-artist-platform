import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './style.scss';

type ToastTopLayerProps = {
  open: boolean;
  children: ReactNode;
};

/** Transparent top-layer dialog so toast content stays above native modal `<dialog>` elements. */
export function ToastTopLayer({ open, children }: ToastTopLayerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const preventDismiss = (event: Event) => {
      event.preventDefault();
    };

    dialog.addEventListener('cancel', preventDismiss);
    return () => dialog.removeEventListener('cancel', preventDismiss);
  }, []);

  if (!open) return null;

  return createPortal(
    <dialog ref={dialogRef} className="toast-top-layer" aria-modal="false">
      {children}
    </dialog>,
    document.body
  );
}
