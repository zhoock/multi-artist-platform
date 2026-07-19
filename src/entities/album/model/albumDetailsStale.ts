/**
 * Album ids whose mid-weight AlbumDetails cache must not be reused until refetched.
 * Used when Dashboard edits an album while the single-slot `albumDetails` slice
 * is not currently showing that album (or id was renamed).
 */

const staleAlbumIds = new Set<string>();

export function markAlbumDetailsStale(albumId: string | null | undefined): void {
  const id = albumId?.trim();
  if (!id) return;
  staleAlbumIds.add(id);
}

export function markAlbumDetailsStaleMany(albumIds: Array<string | null | undefined>): void {
  for (const id of albumIds) markAlbumDetailsStale(id);
}

/** True if this album id was invalidated and should bypass the succeeded-cache condition. */
export function isAlbumDetailsStale(albumId: string | null | undefined): boolean {
  const id = albumId?.trim();
  return Boolean(id && staleAlbumIds.has(id));
}

/** Consume stale flag when a fetch for this album is allowed to proceed. */
export function consumeAlbumDetailsStale(albumId: string | null | undefined): boolean {
  const id = albumId?.trim();
  if (!id || !staleAlbumIds.has(id)) return false;
  staleAlbumIds.delete(id);
  return true;
}

/** Test helper */
export function resetAlbumDetailsStaleForTests(): void {
  staleAlbumIds.clear();
}
