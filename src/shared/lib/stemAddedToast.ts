export const STEM_ADDED_TOAST_KEY = 'sc-stem-added-toast';

/** Длительность показа тоста в микшере (мс); совпадает с UI-компонентом. */
export const STEM_ADDED_TOAST_DURATION_MS = 4000;

export function queueStemAddedToast(message: string): void {
  try {
    sessionStorage.setItem(STEM_ADDED_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeStemAddedToast(): string | null {
  try {
    const message = sessionStorage.getItem(STEM_ADDED_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(STEM_ADDED_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
