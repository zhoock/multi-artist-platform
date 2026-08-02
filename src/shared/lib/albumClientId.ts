/**
 * Клиентский ключ альбома для плеера / кэша. Предпочитает albumId с API.
 * Поддерживает AlbumDetails (`title`) и AlbumEditable (`album`).
 */
export function fallbackAlbumClientId(album: {
  albumId?: string;
  title?: string;
  album?: string;
  userId?: string;
  artistDisplayName?: string;
}): string {
  if (album.albumId?.trim()) return album.albumId.trim();
  const title = (album.title ?? album.album ?? '').trim() || 'album';
  const owner = (album.userId ?? '').trim() || 'na';
  return `${owner}-${title}`.toLowerCase().replace(/\s+/g, '-');
}
