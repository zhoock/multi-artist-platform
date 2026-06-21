export const ARCHIVE_ARTIST_REMOVED_TOAST_KEY = 'sc-archive-artist-removed-toast';

export const ARCHIVE_ARTIST_REMOVED_TOAST_DURATION_MS = 4000;

export function queueArchiveArtistRemovedToast(message: string): void {
  try {
    sessionStorage.setItem(ARCHIVE_ARTIST_REMOVED_TOAST_KEY, message);
  } catch {
    /* ignore */
  }
}

export function consumeArchiveArtistRemovedToast(): string | null {
  try {
    const message = sessionStorage.getItem(ARCHIVE_ARTIST_REMOVED_TOAST_KEY);
    if (message) {
      sessionStorage.removeItem(ARCHIVE_ARTIST_REMOVED_TOAST_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return null;
}
