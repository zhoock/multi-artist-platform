import type { Location } from 'react-router-dom';

export type DashboardOpenIntent = {
  backgroundLocation?: Location;
  openEditAlbumModal?: boolean;
  openNewArticleModal?: boolean;
  /** Artist page builder: «Загрузить обложку» → settings Header Images. */
  scrollToHeaderImages?: boolean;
};

/** Survives refresh while email verification blocks upload resume. */
export const UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY = 'sc_upload_album_pending_intent';
const UPLOAD_ALBUM_INTENT_TTL_MS = 30 * 60 * 1000;

export type PendingUploadAlbumIntent = {
  type: 'upload_album';
  albumId?: string;
  createdAt: number;
};

export function readDashboardOpenIntent(state: unknown): DashboardOpenIntent | null {
  if (!state || typeof state !== 'object') return null;
  return state as DashboardOpenIntent;
}

export function stripDashboardOpenIntent(state: DashboardOpenIntent | null): {
  backgroundLocation?: Location;
} {
  if (!state?.backgroundLocation) return {};
  return { backgroundLocation: state.backgroundLocation };
}

export function savePendingUploadAlbumIntent(albumId?: string): void {
  if (typeof window === 'undefined') return;
  const trimmedAlbumId = albumId?.trim();
  const intent: PendingUploadAlbumIntent = {
    type: 'upload_album',
    ...(trimmedAlbumId ? { albumId: trimmedAlbumId } : {}),
    createdAt: Date.now(),
  };
  try {
    sessionStorage.setItem(UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    /* ignore quota */
  }
}

export function readPendingUploadAlbumIntent(): PendingUploadAlbumIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingUploadAlbumIntent>;
    if (parsed.type !== 'upload_album' || typeof parsed.createdAt !== 'number') {
      clearPendingUploadAlbumIntent();
      return null;
    }
    if (Date.now() - parsed.createdAt > UPLOAD_ALBUM_INTENT_TTL_MS) {
      clearPendingUploadAlbumIntent();
      return null;
    }
    const trimmedAlbumId =
      typeof parsed.albumId === 'string' && parsed.albumId.trim()
        ? parsed.albumId.trim()
        : undefined;
    return {
      type: 'upload_album',
      ...(trimmedAlbumId ? { albumId: trimmedAlbumId } : {}),
      createdAt: parsed.createdAt,
    };
  } catch {
    clearPendingUploadAlbumIntent();
    return null;
  }
}

export function clearPendingUploadAlbumIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPendingUploadAlbumIntent(): boolean {
  return readPendingUploadAlbumIntent() !== null;
}
