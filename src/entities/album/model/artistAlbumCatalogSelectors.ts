import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@shared/model/appStore/types';
import { buildPublicAlbumsFetchContextKey } from '@shared/lib/publicCatalogCacheKey';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { isAlbumVisibleOnArtistPage } from '../lib/albumPublication';
import type { CatalogAlbum } from './catalogAlbum';

export const selectArtistAlbumCatalogState = (state: RootState) => state.artistAlbumCatalog;

export const selectArtistAlbumCatalogStatus = createSelector(
  [selectArtistAlbumCatalogState],
  (s) => s.status
);

export const selectArtistAlbumCatalogError = createSelector(
  [selectArtistAlbumCatalogState],
  (s) => s.error
);

export const selectArtistAlbumCatalogData = createSelector(
  [selectArtistAlbumCatalogState],
  (s): CatalogAlbum[] => s.data
);

export const selectArtistAlbumCatalogFetchContextKey = createSelector(
  [selectArtistAlbumCatalogState],
  (s) => s.fetchContextKey
);

export const selectArtistAlbumCatalogArtistMissing = createSelector(
  [selectArtistAlbumCatalogState],
  (s) => s.artistMissing
);

export const selectArtistAlbumCatalogCacheIsStale = createSelector(
  [selectArtistAlbumCatalogFetchContextKey, selectPublicArtistSlug],
  (fetchKey, slug) => {
    const normalizedSlug = slug?.trim() ?? '';
    // Brief slug clear (overlay teardown) must not mark cache stale — keep last-good surface.
    if (!normalizedSlug) return false;
    const desired = buildPublicAlbumsFetchContextKey(normalizedSlug);
    if (!fetchKey) return true;
    return fetchKey !== desired;
  }
);

/** Published + visible catalog cards for Artist Page surface. */
export const selectArtistAlbumCatalogForSurface = createSelector(
  [selectArtistAlbumCatalogData, selectArtistAlbumCatalogCacheIsStale],
  (albums, stale): CatalogAlbum[] => {
    // Stale-while-revalidate: keep last-good cards during background refresh / brief mismatch.
    // Cross-artist navigation clears `data` in fetch.pending when fetchContextKey changes.
    if (stale && albums.length === 0) return [];
    return albums.filter(
      (album) =>
        isAlbumVisibleOnArtistPage(album) && album.title.trim().length > 0 && album.trackCount > 0
    );
  }
);

export const selectArtistAlbumCatalogCachedRowCount = createSelector(
  [selectArtistAlbumCatalogData],
  (albums) => albums.length
);
