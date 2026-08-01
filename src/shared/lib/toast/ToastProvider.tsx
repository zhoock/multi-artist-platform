import { useSyncExternalStore, type ReactNode } from 'react';

import { getToasts, subscribeToasts } from './toastStore';
import { ToastViewport } from './ToastViewport';

type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  return (
    <>
      {children}
      <ToastViewport toasts={toasts} />
    </>
  );
}
