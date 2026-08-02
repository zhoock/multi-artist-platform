import type { AlbumEditable } from '@models';

/** Альбом прошёл одноразовую публикацию (не черновик). */
export function isAlbumPublished(album: Pick<AlbumEditable, 'isPublished'>): boolean {
  return album.isPublished === true;
}

/** Черновик — ещё не опубликован. */
export function isAlbumDraft(album: Pick<AlbumEditable, 'isPublished'>): boolean {
  return !isAlbumPublished(album);
}

/** Видимость на странице артиста (только для опубликованных альбомов). */
export function isAlbumVisibleOnArtistPage(
  album: Pick<AlbumEditable, 'isPublished' | 'isPublic'>
): boolean {
  return isAlbumPublished(album) && album.isPublic !== false;
}
