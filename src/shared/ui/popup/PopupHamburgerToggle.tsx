import type { ComponentProps } from 'react';
import { Hamburger } from '@shared/ui/hamburger';
import { usePopup } from './PopupContext';

type PopupHamburgerToggleProps = Omit<ComponentProps<typeof Hamburger>, 'onToggle'>;

/** Hamburger that dismisses the surrounding Popup via dialog.close(). */
export function PopupHamburgerToggle(props: PopupHamburgerToggleProps) {
  const { requestClose } = usePopup();
  return <Hamburger {...props} onToggle={requestClose} />;
}
