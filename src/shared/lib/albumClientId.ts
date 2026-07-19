/**
 * Клиентский ключ альбома для плеера / кэша. Предпочитает albumId с API.
 * Поддерживает AlbumDetails (`title`) и legacy IAlbums (`album` + optional `artist`).
 */
export function fallbackAlbumClientId(album: {
  albumId?: string;
  title?: string;
  album?: string;
  userId?: string;
  artist?: string;
}): string {
  if (album.albumId?.trim()) return album.albumId.trim();
  const art = (album.artist ?? '').trim();
  const title = (album.title ?? album.album ?? '').trim() || 'album';
  if (art) {
    return `${art}-${title}`.toLowerCase().replace(/\s+/g, '-');
  }
  const owner = (album.userId ?? '').trim() || 'na';
  return `${owner}-${title}`.toLowerCase().replace(/\s+/g, '-');
}
