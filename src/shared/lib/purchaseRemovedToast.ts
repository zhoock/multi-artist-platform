export const PURCHASE_REMOVED_TOAST_KEY = 'sc-purchase-removed-toast';

export const PURCHASE_REMOVED_TOAST_DURATION_MS = 4000;

export function queuePurchaseRemovedToast(message: string): void {
  try {
    sessionStorage.setItem(PURCHASE_REMOVED_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumePurchaseRemovedToast(): string | null {
  try {
    const message = sessionStorage.getItem(PURCHASE_REMOVED_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(PURCHASE_REMOVED_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
