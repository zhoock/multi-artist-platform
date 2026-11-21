import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { PopupCloseButton } from '@shared/ui/popup';

export type ModalCloseButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** When true, dismisses via Popup `requestClose` (must be inside `<Popup>`). */
  popupClose?: boolean;
  icon?: ReactNode;
};

/**
 * Dashboard Settings–style modal close control: icon button + caller BEM class for layout.
 * Pair with `@include dashboard-settings-modal-close` (or block `&__close`) in SCSS.
 */
export function ModalCloseButton({
  popupClose = false,
  icon,
  children,
  type = 'button',
  ...props
}: ModalCloseButtonProps) {
  const closeIcon = children ?? icon ?? <ModalCloseIcon />;

  if (popupClose) {
    return (
      <PopupCloseButton type={type} {...props}>
        {closeIcon}
      </PopupCloseButton>
    );
  }

  return (
    <button type={type} {...props}>
      {closeIcon}
    </button>
  );
}
