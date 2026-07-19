import type { CatalogAlbum } from '../model/catalogAlbum';
import { isAlbumDraft, isAlbumVisibleOnArtistPage } from './albumPublication';

/** Public thin-catalog eligibility (trackCount instead of tracks[]). */
export function hasPublishedPublicCatalogReleases(albums: CatalogAlbum[]): boolean {
  return albums.some(
    (album) =>
      isAlbumVisibleOnArtistPage(album) && album.title.trim().length > 0 && album.trackCount > 0
  );
}

export function filterCatalogAlbumsForArtistPageSurface(
  albums: CatalogAlbum[],
  isOwner: boolean
): CatalogAlbum[] {
  if (isOwner) {
    return albums.filter(
      (album) =>
        isAlbumDraft(album) ||
        (isAlbumVisibleOnArtistPage(album) && album.title.trim().length > 0 && album.trackCount > 0)
    );
  }
  return albums.filter(
    (album) =>
      isAlbumVisibleOnArtistPage(album) && album.title.trim().length > 0 && album.trackCount > 0
  );
}
