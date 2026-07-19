/**
 * Селекторы для получения данных из Redux стейта альбомов.
 * Используем createSelector для мемоизации - это предотвращает лишние пересчёты и ре-рендеры.
 */
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@shared/model/appStore/types';
import type { IAlbums } from '@models';
import { isAlbumVisibleOnArtistPage } from '@entities/album/lib/albumPublication';

import { selectCurrentLang } from '@shared/model/lang/selectors';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { buildPublicAlbumsFetchContextKey } from '@shared/lib/publicCatalogCacheKey';
import { resolveAlbumForDisplay } from '../lib/resolveAlbumDisplay';
import type { AlbumsState } from './types';

export const selectAlbumsState = (state: RootState): AlbumsState => state.albums;

export const selectDashboardAlbumsState = createSelector([selectAlbumsState], (s) => s.dashboard);

export const selectDashboardAlbumsStatus = createSelector(
  [selectDashboardAlbumsState],
  (s) => s.status
);

export const selectDashboardAlbumsError = createSelector(
  [selectDashboardAlbumsState],
  (s) => s.error
);

export const selectDashboardAlbumsData = createSelector(
  [selectDashboardAlbumsState],
  (s): IAlbums[] => s.data
);

export const selectDashboardAlbumsDataResolved = createSelector(
  [selectDashboardAlbumsData, selectCurrentLang],
  (albums, lang): IAlbums[] => albums.map((a) => resolveAlbumForDisplay(a, lang))
);

export const selectDashboardAlbumById = createSelector(
  [selectDashboardAlbumsData, (_state: RootState, albumId: string) => albumId],
  (albums, albumId) => albums.find((album) => album.albumId === albumId)
);

export const selectDashboardAlbumByIdResolved = createSelector(
  [selectDashboardAlbumsDataResolved, (_state: RootState, albumId: string) => albumId],
  (albums, albumId) => albums.find((album) => album.albumId === albumId)
);

export const selectAlbumsStatus = createSelector([selectAlbumsState], (s) => s.status);

export const selectAlbumsError = createSelector([selectAlbumsState], (s) => s.error);

export const selectAlbumsData = createSelector([selectAlbumsState], (s): IAlbums[] => s.data);

export const selectAlbumsFetchContextKey = createSelector(
  [selectAlbumsState],
  (s) => s.fetchContextKey
);

export const selectAlbumsInFlightFetchContextKey = createSelector(
  [selectAlbumsState],
  (s) => s.inFlightFetchContextKey
);

export const selectCatalogArtistMissing = createSelector(
  [selectAlbumsState],
  (s) => s.catalogArtistMissing
);

export const selectDesiredPublicAlbumsFetchContextKey = createSelector(
  [selectPublicArtistSlug],
  (slug) => buildPublicAlbumsFetchContextKey(slug)
);

/**
 * Кэш альбомов относится к другому ?artist= — не показываем устаревшие обложки.
 * `null` после setPublicArtistSlug — stale для страницы артиста (иначе dashboard гасит скелетон).
 * На `/` без ?artist= `desiredKey` = `public:no-slug` — null не считаем stale.
 */
export const selectPublicAlbumsCacheIsStale = createSelector(
  [selectAlbumsFetchContextKey, selectDesiredPublicAlbumsFetchContextKey],
  (cachedKey, desiredKey) => {
    if (cachedKey === desiredKey) return false;
    if (cachedKey === null && desiredKey === 'public:no-slug') return false;
    return true;
  }
);

export const selectAlbumById = createSelector(
  [selectAlbumsData, (_state: RootState, albumId: string) => albumId],
  (albums, albumId) => albums.find((album) => album.albumId === albumId)
);

/** Для отображения: строки с fallback по `state.lang.current`. */
export const selectAlbumsDataResolved = createSelector(
  [selectAlbumsData, selectCurrentLang],
  (albums, lang): IAlbums[] => albums.map((a) => resolveAlbumForDisplay(a, lang))
);

/** Публичный каталог: опубликованные и видимые альбомы. */
export const selectPublicAlbumsDataResolved = createSelector(
  [selectAlbumsDataResolved],
  (albums): IAlbums[] => albums.filter((a) => isAlbumVisibleOnArtistPage(a))
);

export const selectPublicAlbumsDataResolvedForSurface = createSelector(
  [selectPublicAlbumsDataResolved, selectPublicAlbumsCacheIsStale],
  (albums, stale) => (stale ? [] : albums)
);

/** Есть ли строки публичного каталога в store (до stale-фильтра surface). */
export const selectPublicCatalogCachedRowCount = createSelector(
  [selectPublicAlbumsDataResolved],
  (albums) => albums.length
);

export const selectAlbumByIdResolved = createSelector(
  [selectAlbumsDataResolved, (_state: RootState, albumId: string) => albumId],
  (albums, albumId) => albums.find((album) => album.albumId === albumId)
);
