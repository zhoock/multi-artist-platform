export const DASHBOARD_ERROR_TOAST_KEY = 'sc-dashboard-error-toast';

export const DASHBOARD_ERROR_TOAST_DURATION_MS = 4500;

export function queueDashboardErrorToast(message: string): void {
  try {
    sessionStorage.setItem(DASHBOARD_ERROR_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeDashboardErrorToast(): string | null {
  try {
    const message = sessionStorage.getItem(DASHBOARD_ERROR_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(DASHBOARD_ERROR_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
