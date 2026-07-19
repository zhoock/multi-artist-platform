import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@shared/model/appStore/types';
import { selectCurrentLang } from '@shared/model/lang';
import { resolveAlbumDetailsForDisplay } from '../lib/resolveAlbumDetailsDisplay';
import type { AlbumDetails } from './albumDetails';

export const selectAlbumDetailsState = (state: RootState) => state.albumDetails;

export const selectAlbumDetailsStatus = createSelector([selectAlbumDetailsState], (s) => s.status);

export const selectAlbumDetailsError = createSelector([selectAlbumDetailsState], (s) => s.error);

export const selectAlbumDetailsErrorCode = createSelector(
  [selectAlbumDetailsState],
  (s) => s.errorCode
);

export const selectAlbumDetailsData = createSelector(
  [selectAlbumDetailsState],
  (s): AlbumDetails | null => s.data
);

export const selectAlbumDetailsFetchContextKey = createSelector(
  [selectAlbumDetailsState],
  (s) => s.fetchContextKey
);

/** Resolved for current UI language (description, details, artwork, track titles). */
export const selectAlbumDetailsResolved = createSelector(
  [selectAlbumDetailsData, selectCurrentLang],
  (album, lang): AlbumDetails | null => (album ? resolveAlbumDetailsForDisplay(album, lang) : null)
);

export const selectAlbumDetailsMatchesRoute = createSelector(
  [
    selectAlbumDetailsState,
    (_: RootState, artistSlug: string, albumId: string) =>
      `${artistSlug.trim()}\0${albumId.trim()}`,
  ],
  (state, key): boolean => {
    const [artistSlug, albumId] = key.split('\0');
    if (!artistSlug || !albumId) return false;
    return (
      state.artistSlug === artistSlug &&
      state.albumId === albumId &&
      state.fetchContextKey === `albumDetails:${artistSlug}:${albumId}`
    );
  }
);
