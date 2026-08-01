import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { getToasts, subscribeToasts } from './toastStore';
import { installToastLayerPromotion } from './useToastLayerDialog';
import { ToastViewport } from './ToastViewport';

type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  useEffect(() => {
    installToastLayerPromotion();
  }, []);

  return (
    <>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(<ToastViewport toasts={toasts} />, document.body)
        : null}
    </>
  );
}
