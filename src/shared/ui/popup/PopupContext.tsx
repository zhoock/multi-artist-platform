import { createContext, useContext } from 'react';

export type PopupContextValue = {
  /** Closes the native dialog; `Popup.onClose` runs from the `close` event. */
  requestClose: () => void;
  isCloseBlocked: boolean;
};

export const PopupContext = createContext<PopupContextValue | null>(null);

export function usePopup(): PopupContextValue {
  const value = useContext(PopupContext);
  if (!value) {
    throw new Error('usePopup must be used within a <Popup>');
  }
  return value;
}
