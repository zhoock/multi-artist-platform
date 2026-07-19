/**
 * Селекторы Dashboard fat-albums (`AlbumEditable`).
 * Публичный каталог — `artistAlbumCatalogSelectors` / `albumDetailsSelectors`.
 */
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@shared/model/appStore/types';
import type { AlbumEditable } from '@models';

import { selectCurrentLang } from '@shared/model/lang/selectors';
import { resolveAlbumEditableForDisplay } from '../lib/resolveAlbumEditableDisplay';
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
  (s): AlbumEditable[] => s.data
);

export const selectDashboardAlbumsDataResolved = createSelector(
  [selectDashboardAlbumsData, selectCurrentLang],
  (albums, lang): AlbumEditable[] => albums.map((a) => resolveAlbumEditableForDisplay(a, lang))
);

export const selectDashboardAlbumById = createSelector(
  [selectDashboardAlbumsData, (_state: RootState, albumId: string) => albumId],
  (albums, albumId) => albums.find((album) => album.albumId === albumId)
);

export const selectDashboardAlbumByIdResolved = createSelector(
  [selectDashboardAlbumsDataResolved, (_state: RootState, albumId: string) => albumId],
  (albums, albumId) => albums.find((album) => album.albumId === albumId)
);

export const selectDashboardAlbumsInFlightFetchContextKey = createSelector(
  [selectDashboardAlbumsState],
  (s) => s.inFlightFetchContextKey
);
