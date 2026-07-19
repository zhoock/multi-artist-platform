/**
 * Universe "Play Artist": resolve first playable album without fat `/api/albums`.
 * Thin catalog picks the album; mid-weight AlbumDetails supplies the playlist.
 */

import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import type { SupportedLang } from '@shared/model/lang';
import { fetchAlbumDetails } from '@entities/album/api/fetchAlbumDetails';
import { filterCatalogAlbumsForArtistPageSurface } from '@entities/album/lib/catalogPublication';
import { resolveAlbumDetailsForDisplay } from '@entities/album/lib/resolveAlbumDetailsDisplay';
import { normalizeCatalogAlbum, type CatalogAlbum } from '@entities/album/model/catalogAlbum';
import type { AlbumDetails } from '@entities/album/model/albumDetails';

export type FetchUniverseArtistPlayAlbumOptions = {
  signal?: AbortSignal;
};

async function fetchArtistCatalog(
  artistSlug: string,
  signal?: AbortSignal
): Promise<CatalogAlbum[]> {
  const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithAuthSession(
    `/api/artists/${encodeURIComponent(artistSlug)}/albums`,
    {
      signal,
      cache: 'no-store',
      headers,
    }
  );

  if (!response.ok) return [];

  const payload = (await response.json()) as { success?: boolean; data?: unknown };
  if (!payload.success || !Array.isArray(payload.data)) return [];

  return payload.data
    .map((row) => normalizeCatalogAlbum(row))
    .filter((row): row is CatalogAlbum => row !== null);
}

/**
 * Returns locale-resolved AlbumDetails for the first visitor-visible album
 * that has playable tracks. `null` when the artist has nothing to play.
 */
export async function fetchUniverseArtistPlayAlbum(
  artistSlug: string,
  lang: SupportedLang,
  options: FetchUniverseArtistPlayAlbumOptions = {}
): Promise<AlbumDetails | null> {
  const slug = artistSlug.trim();
  if (!slug) return null;

  const catalog = await fetchArtistCatalog(slug, options.signal);
  const playable = filterCatalogAlbumsForArtistPageSurface(catalog, false).find(
    (album) => album.trackCount > 0
  );
  if (!playable) return null;

  try {
    const details = await fetchAlbumDetails(slug, playable.albumId, {
      signal: options.signal,
    });
    const resolved = resolveAlbumDetailsForDisplay(details, lang);
    if (!resolved.tracks.length) return null;
    return resolved;
  } catch {
    return null;
  }
}
