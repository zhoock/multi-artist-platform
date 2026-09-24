import type { HamburgerProps } from '@models';
import { Hamburger } from '@shared/ui/hamburger';
import { usePopup } from './PopupContext';

type PopupHamburgerToggleProps = Omit<HamburgerProps, 'onToggle'>;

/** Hamburger that dismisses the surrounding Popup via dialog.close(). */
export function PopupHamburgerToggle(props: PopupHamburgerToggleProps) {
  const { requestClose } = usePopup();
  return <Hamburger {...props} onToggle={requestClose} />;
}
