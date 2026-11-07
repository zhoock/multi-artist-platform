/**
 * Stable client cache identity for a stem object in Storage (ignores signed URL / access token).
 */

export function buildStemAssetCacheKey(
  artistUserId: string,
  albumId: string,
  trackId: string,
  file: string
): string {
  const artist = artistUserId.trim();
  const album = albumId.trim();
  const track = trackId.trim();
  const stemFile = file.trim();
  if (!artist || !album || !track || !stemFile) {
    return '';
  }
  return `${artist}:${album}:${track}:${stemFile}`;
}

/** Parses `/api/stems/audio` proxy URL; returns null if shape is unknown. */
export function parseStemAssetCacheKeyFromProxyUrl(raw: string): string | null {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://local';
    const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, base);
    if (!url.pathname.endsWith('/api/stems/audio') && !url.pathname.includes('/stems/audio')) {
      return null;
    }
    const artistUserId = url.searchParams.get('artistUserId') ?? '';
    const albumId = url.searchParams.get('albumId') ?? '';
    const trackId = url.searchParams.get('trackId') ?? '';
    const file = url.searchParams.get('file') ?? '';
    const key = buildStemAssetCacheKey(artistUserId, albumId, trackId, file);
    return key || null;
  } catch {
    return null;
  }
}
