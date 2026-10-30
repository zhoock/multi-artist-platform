import type { MixerAlbum } from './types';

/** Resolves a mixer album row by public route id (catalog slug / albumId). */
export function findMixerAlbumByRouteId(
  albums: MixerAlbum[],
  routeAlbumId: string
): MixerAlbum | null {
  const id = routeAlbumId.trim();
  if (!id) return null;
  return albums.find((album) => album.albumId === id) ?? null;
}

/** Prefer a hydrated album row when duplicate shells exist for the same id. */
export function pickMixerAlbumForSelection(
  albums: MixerAlbum[],
  selectedAlbumId: string | null
): MixerAlbum | null {
  if (!selectedAlbumId) return null;
  const id = selectedAlbumId.trim();
  const matches = albums.filter((album) => album.albumId === id);
  if (matches.length === 0) return null;

  return (
    matches.find((a) => a.tracksStatus === 'loaded' && a.tracks.length > 0) ??
    matches.find((a) => a.tracksStatus === 'loaded') ??
    matches.find((a) => a.tracksStatus === 'loading') ??
    matches[0]
  );
}
