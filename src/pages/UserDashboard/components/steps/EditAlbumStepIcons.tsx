import { ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';

export function EditAlbumCloseIcon() {
  return <ModalCloseIcon size={20} />;
}

export function EditAlbumEditIcon() {
  return <Pencil {...dashboardActionIconProps({ size: 16 })} />;
}

export function EditAlbumRemoveIcon() {
  return <X {...dashboardActionIconProps({ size: 16 })} />;
}

export function EditAlbumPlusIcon({ size = 16 }: { size?: number }) {
  return <Plus {...dashboardActionIconProps({ size })} />;
}

export function EditAlbumChevronDownIcon() {
  return <ChevronDown {...dashboardActionIconProps({ size: 18 })} />;
}

export function EditAlbumChevronUpIcon() {
  return <ChevronUp {...dashboardActionIconProps({ size: 18 })} />;
}

/** Убирает «+» из локализованных подписей кнопок добавления. */
export function editAlbumAddButtonLabel(label: string): string {
  return label.replace(/\+/g, '').trim();
}
