import type { AlbumEditable } from '@models';
import { isPublicListedTrack } from '@shared/lib/tracks/publicTrackPresentation';

import type { CatalogAlbum } from '../model/catalogAlbum';
import type { AlbumVisibilityInfo } from '../model/albumDetails';
import {
  isAlbumDraft,
  isAlbumPublicSurfaceEligible,
  isAlbumPublished,
  isAlbumVisibleOnArtistPage,
} from './albumPublication';

/** Public thin-catalog eligibility (trackCount instead of tracks[]). */
export function hasPublishedPublicCatalogReleases(albums: CatalogAlbum[]): boolean {
  return albums.some(
    (album) =>
      isAlbumPublicSurfaceEligible(album) && album.title.trim().length > 0 && album.trackCount > 0
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
  return isAlbumPublicSurfaceEligible(album.visibility);
}

/** Fat dashboard row: at least one track listed on the public artist page (mirrors thin catalog gates). */
export function dashboardAlbumHasPublicListedTrack(album: AlbumEditable): boolean {
  const tracks = album.tracks ?? [];
  return tracks.some((track) =>
    isPublicListedTrack(track.visibility, track.stemsVisibility, track.processingStatus)
  );
}

/**
 * PUBLIC artist page projection from fat `/api/albums` — not admin dashboard listing.
 * Drafts are handled separately on the surface; failed/pending/processing-only albums drop out.
 */
export function filterDashboardAlbumsForPublicArtistPageSurface(
  albums: AlbumEditable[]
): AlbumEditable[] {
  return albums.filter((album) => {
    if (isAlbumDraft(album)) return false;
    if (!isAlbumVisibleOnArtistPage(album)) return false;
    if (typeof album.album !== 'string' || !album.album.trim()) return false;
    return dashboardAlbumHasPublicListedTrack(album);
  });
}

export function filterCatalogAlbumsForArtistPageSurface(
  albums: CatalogAlbum[],
  isOwner: boolean
): CatalogAlbum[] {
  if (isOwner) {
    return albums.filter(
      (album) =>
        isAlbumDraft(album) ||
        (isAlbumPublished(album) &&
          album.title.trim().length > 0 &&
          album.trackCount > 0 &&
          (album.isPublic !== false || album.copyrightRestricted === true))
    );
  }
  return albums.filter(
    (album) =>
      isAlbumPublicSurfaceEligible(album) && album.title.trim().length > 0 && album.trackCount > 0
  );
}
