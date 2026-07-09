export const LYRICS_SYNC_REMOVED_TOAST_KEY = 'sc-lyrics-sync-removed-toast';

export function queueLyricsSyncRemovedToast(): void {
  try {
    sessionStorage.setItem(LYRICS_SYNC_REMOVED_TOAST_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeLyricsSyncRemovedToast(): boolean {
  try {
    const v = sessionStorage.getItem(LYRICS_SYNC_REMOVED_TOAST_KEY);
    if (v) {
      sessionStorage.removeItem(LYRICS_SYNC_REMOVED_TOAST_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
