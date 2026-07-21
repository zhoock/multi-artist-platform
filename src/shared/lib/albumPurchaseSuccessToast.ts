export const ALBUM_PURCHASE_SUCCESS_TOAST_KEY = 'sc-album-purchase-success-toast';

export function normalizeAlbumReturnPath(returnTo: string): string | null {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://local.invalid';
    const url = new URL(returnTo, base);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** One-shot flag: show purchase-success toast on the album page matching `returnTo`. */
export function queueAlbumPurchaseSuccessToast(returnTo: string): void {
  const path = normalizeAlbumReturnPath(returnTo);
  if (!path) return;

  try {
    sessionStorage.setItem(ALBUM_PURCHASE_SUCCESS_TOAST_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeAlbumPurchaseSuccessToast(currentPath: string): boolean {
  try {
    const stored = sessionStorage.getItem(ALBUM_PURCHASE_SUCCESS_TOAST_KEY);
    if (!stored || stored !== currentPath) {
      return false;
    }
    sessionStorage.removeItem(ALBUM_PURCHASE_SUCCESS_TOAST_KEY);
    return true;
  } catch {
    return false;
  }
}

export function redirectToAlbumReturnPath(returnTo: string): void {
  if (typeof window === 'undefined') return;

  queueAlbumPurchaseSuccessToast(returnTo);

  const path = normalizeAlbumReturnPath(returnTo);
  if (path) {
    window.location.href = path;
    return;
  }

  window.location.href = returnTo;
}
