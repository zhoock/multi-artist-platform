import type { CatalogAlbum } from '../model/catalogAlbum';
import type { AlbumVisibilityInfo } from '../model/albumDetails';
import { isAlbumDraft, isAlbumVisibleOnArtistPage } from './albumPublication';

/** Public thin-catalog eligibility (trackCount instead of tracks[]). */
export function hasPublishedPublicCatalogReleases(albums: CatalogAlbum[]): boolean {
  return albums.some(
    (album) =>
      isAlbumVisibleOnArtistPage(album) && album.title.trim().length > 0 && album.trackCount > 0
  );
}

/** Album detail payload on `/albums/:id` when thin catalog was not prefetched. */
export function albumDetailsHasPublicRelease(
  album: {
    title: string;
    visibility: AlbumVisibilityInfo;
    tracks: unknown[];
  } | null
): boolean {
  if (!album?.title?.trim()) return false;
  if ((album.tracks?.length ?? 0) === 0) return false;
  return isAlbumVisibleOnArtistPage(album.visibility);
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
