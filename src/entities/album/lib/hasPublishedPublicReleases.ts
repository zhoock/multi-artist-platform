import type { AlbumEditable } from '@models';

import { isAlbumVisibleOnArtistPage } from './albumPublication';

/** Public catalog eligibility: published, visible release with at least one track. */
export function hasPublishedPublicReleases(albums: AlbumEditable[]): boolean {
  return albums.some(
    (album) =>
      isAlbumVisibleOnArtistPage(album) &&
      typeof album.album === 'string' &&
      album.album.trim().length > 0 &&
      (album.tracks?.length ?? 0) > 0
  );
}
