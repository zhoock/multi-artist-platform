/**
 * Thin public catalog models for Artist Page first paint.
 * Not interchangeable with full `IAlbums` (no tracks/lyrics/details/buttons).
 */

export interface CatalogAlbum {
  albumId: string;
  /** Public album slug — same as albumId in current data model. */
  slug: string;
  title: string;
  cover: string;
  releaseDate: string;
  trackCount: number;
  /** Sum of track durations in seconds. */
  duration: number;
  userId: string;
  isPublished: boolean;
  isPublic: boolean;
  /** Viewer needs entitlement for at least one listed track. */
  hasLockedTracks: boolean;
}

export function isCatalogAlbum(value: unknown): value is CatalogAlbum {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.albumId === 'string' &&
    v.albumId.trim().length > 0 &&
    typeof v.title === 'string' &&
    typeof v.cover === 'string' &&
    typeof v.trackCount === 'number' &&
    typeof v.userId === 'string'
  );
}

export function normalizeCatalogAlbum(raw: unknown): CatalogAlbum | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const albumId = typeof v.albumId === 'string' ? v.albumId.trim() : '';
  if (!albumId) return null;

  const title = typeof v.title === 'string' ? v.title : '';
  const slug = typeof v.slug === 'string' && v.slug.trim() ? v.slug.trim() : albumId;

  return {
    albumId,
    slug,
    title,
    cover: typeof v.cover === 'string' ? v.cover : '',
    releaseDate: typeof v.releaseDate === 'string' ? v.releaseDate : '',
    trackCount: typeof v.trackCount === 'number' && !Number.isNaN(v.trackCount) ? v.trackCount : 0,
    duration: typeof v.duration === 'number' && !Number.isNaN(v.duration) ? v.duration : 0,
    userId: typeof v.userId === 'string' ? v.userId : '',
    isPublished: v.isPublished === true,
    isPublic: v.isPublic !== false,
    hasLockedTracks: v.hasLockedTracks === true,
  };
}
