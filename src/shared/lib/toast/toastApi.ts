import { dismissAllToasts, dismissToast, showToast } from './toastStore';

export const toast = {
  show: showToast,
  dismiss: dismissToast,
  dismissAll: dismissAllToasts,
};
