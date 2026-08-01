export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastPlacement = 'top-right' | 'top-right-offset' | 'bottom-center';

export type ToastLayer = 'default' | 'top';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastUndo = {
  label: string;
  onUndo: () => void;
};

export type ToastShowOptions = {
  variant?: ToastVariant;
  title: string;
  description?: string;
  duration?: number | null;
  dismissible?: boolean;
  placement?: ToastPlacement;
  layer?: ToastLayer;
  action?: ToastAction;
  undo?: ToastUndo;
};

export type ToastItem = Required<
  Pick<ToastShowOptions, 'title' | 'variant' | 'placement' | 'layer'>
> &
  Pick<ToastShowOptions, 'description' | 'action' | 'undo'> & {
    id: string;
    createdAt: number;
    duration: number | null;
    dismissible: boolean;
  };
