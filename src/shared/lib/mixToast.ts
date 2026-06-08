export const MIX_TOAST_KEY = 'sc-mix-toast';

/** Длительность показа тоста миксов (мс); совпадает с UI-компонентом. */
export const MIX_TOAST_DURATION_MS = 4000;

export function queueMixToast(message: string): void {
  try {
    sessionStorage.setItem(MIX_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeMixToast(): string | null {
  try {
    const message = sessionStorage.getItem(MIX_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(MIX_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
