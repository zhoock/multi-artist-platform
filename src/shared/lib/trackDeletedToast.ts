export const TRACK_DELETED_TOAST_KEY = 'sc-track-deleted-toast';

/** Длительность показа тоста в кабинете (мс); совпадает с UI-компонентом. */
export const TRACK_DELETED_TOAST_DURATION_MS = 4000;

export function queueTrackDeletedToast(message: string): void {
  try {
    sessionStorage.setItem(TRACK_DELETED_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeTrackDeletedToast(): string | null {
  try {
    const message = sessionStorage.getItem(TRACK_DELETED_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(TRACK_DELETED_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
