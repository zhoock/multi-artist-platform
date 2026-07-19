/**
 * Ключ альбома для `/api/yookassa-shop-id` и `create-payment`: canonical `albums.album_id` (slug).
 */
export function getAlbumKeyForPaymentApis(album: {
  albumId?: string;
  dbAlbumId?: string;
}): string | undefined {
  const slug = album.albumId?.trim();
  if (slug) {
    return slug;
  }
  return album.dbAlbumId?.trim() || undefined;
}
