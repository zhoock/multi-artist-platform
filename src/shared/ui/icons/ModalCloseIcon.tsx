import { X } from 'lucide-react';

import { dashboardActionIconProps } from './dashboardActionIcon';

export const MODAL_CLOSE_ICON_SIZE = 20;

export function ModalCloseIcon({ size = MODAL_CLOSE_ICON_SIZE }: { size?: number }) {
  return <X {...dashboardActionIconProps({ size })} />;
}
