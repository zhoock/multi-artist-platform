export const LYRICS_SYNC_SAVED_TOAST_KEY = 'sc-lyrics-sync-saved-toast';

export function queueLyricsSyncSavedToast(): void {
  try {
    sessionStorage.setItem(LYRICS_SYNC_SAVED_TOAST_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeLyricsSyncSavedToast(): boolean {
  try {
    const v = sessionStorage.getItem(LYRICS_SYNC_SAVED_TOAST_KEY);
    if (v) {
      sessionStorage.removeItem(LYRICS_SYNC_SAVED_TOAST_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
