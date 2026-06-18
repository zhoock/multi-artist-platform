import type { ButtonHTMLAttributes } from 'react';
import { usePopup } from './PopupContext';

type PopupCloseButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Close trigger that dismisses via native dialog.close() → Popup.onClose. */
export function PopupCloseButton({ onClick, disabled, ...props }: PopupCloseButtonProps) {
  const { requestClose, isCloseBlocked } = usePopup();

  return (
    <button
      type="button"
      {...props}
      disabled={disabled ?? isCloseBlocked}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        requestClose();
      }}
    />
  );
}
