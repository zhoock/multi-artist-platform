import { type ReactNode } from 'react';

import { useToastLayerDialog } from './useToastLayerDialog';
import { Z_INDEX } from './zIndex';
import './ToastViewportLayer.scss';

type ToastViewportLayerProps = {
  open: boolean;
  /** Changes when the toast stack updates so the layer can re-enter the top layer. */
  stackKey: string;
  children: ReactNode;
};

/**
 * Full-viewport transparent top-layer dialog so default toasts stay above native `<dialog>` modals.
 * Mounted via ToastProvider portal — no extra backdrop, pointer-events pass through except on cards.
 */
export function ToastViewportLayer({ open, stackKey, children }: ToastViewportLayerProps) {
  const setDialogRef = useToastLayerDialog(open, stackKey);

  if (!open) return null;

  return (
    <dialog
      ref={setDialogRef}
      className="toast-viewport-layer"
      style={{ zIndex: Z_INDEX.TOAST_VIEWPORT }}
      aria-modal="false"
    >
      {children}
    </dialog>
  );
}
