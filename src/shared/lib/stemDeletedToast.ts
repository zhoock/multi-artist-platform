export const STEM_DELETED_TOAST_KEY = 'sc-stem-deleted-toast';

/** Длительность показа тоста в микшере (мс); совпадает с UI-компонентом. */
export const STEM_DELETED_TOAST_DURATION_MS = 4000;

export function queueStemDeletedToast(message: string): void {
  try {
    sessionStorage.setItem(STEM_DELETED_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeStemDeletedToast(): string | null {
  try {
    const message = sessionStorage.getItem(STEM_DELETED_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(STEM_DELETED_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
