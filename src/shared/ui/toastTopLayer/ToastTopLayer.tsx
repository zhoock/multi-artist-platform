import { type ReactNode } from 'react';

import { useToastLayerDialog } from '@shared/lib/toast/useToastLayerDialog';
import { Z_INDEX } from '@shared/lib/toast/zIndex';
import './style.scss';

type ToastTopLayerProps = {
  open: boolean;
  /** Changes when the toast stack updates so the layer can re-enter the top layer. */
  stackKey?: string;
  children: ReactNode;
};

/** Transparent top-layer dialog so toast content stays above native modal `<dialog>` elements. */
export function ToastTopLayer({ open, stackKey = '', children }: ToastTopLayerProps) {
  const setDialogRef = useToastLayerDialog(open, stackKey);

  if (!open) return null;

  return (
    <dialog
      ref={setDialogRef}
      className="toast-top-layer"
      style={{ zIndex: Z_INDEX.TOAST_TOP_LAYER }}
      aria-modal="false"
    >
      {children}
    </dialog>
  );
}
