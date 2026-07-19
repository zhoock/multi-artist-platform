import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '@shared/model/appStore/types';
import {
  fetchAlbumDetails as fetchAlbumDetailsApi,
  AlbumDetailsFetchError,
} from '../api/fetchAlbumDetails';
import type { AlbumDetails } from './albumDetails';
import type { RequestStatus } from './types';

export type AlbumDetailsState = {
  status: RequestStatus;
  error: string | null;
  errorCode: string | null;
  data: AlbumDetails | null;
  /** artistSlug + albumId identity for cache / stale checks */
  fetchContextKey: string | null;
  artistSlug: string | null;
  albumId: string | null;
  lastUpdated: number | null;
};

const initialState: AlbumDetailsState = {
  status: 'idle',
  error: null,
  errorCode: null,
  data: null,
  fetchContextKey: null,
  artistSlug: null,
  albumId: null,
  lastUpdated: null,
};

export type FetchAlbumDetailsPageArg = {
  artistSlug: string;
  albumId: string;
  force?: boolean;
};

export type FetchAlbumDetailsPageResult = {
  album: AlbumDetails | null;
  fetchContextKey: string;
  artistSlug: string;
  albumId: string;
  notFound?: boolean;
  errorCode?: string | null;
  staleAbort?: boolean;
};

export function buildAlbumDetailsFetchContextKey(artistSlug: string, albumId: string): string {
  return `albumDetails:${artistSlug.trim()}:${albumId.trim()}`;
}

export const fetchAlbumDetailsPage = createAsyncThunk<
  FetchAlbumDetailsPageResult,
  FetchAlbumDetailsPageArg,
  { state: RootState; rejectValue: string }
>(
  'albumDetails/fetch',
  async (arg, { signal, rejectWithValue }) => {
    const artistSlug = arg.artistSlug.trim();
    const albumId = arg.albumId.trim();
    const fetchContextKey = buildAlbumDetailsFetchContextKey(artistSlug, albumId);

    if (!artistSlug || !albumId) {
      return {
        album: null,
        fetchContextKey,
        artistSlug,
        albumId,
        notFound: true,
        errorCode: 'MISSING_PARAMS',
      };
    }

    try {
      const album = await fetchAlbumDetailsApi(artistSlug, albumId, { signal });

      return {
        album,
        fetchContextKey,
        artistSlug,
        albumId,
        notFound: false,
        errorCode: null,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return rejectWithValue('Aborted');
      }
      if (error instanceof AlbumDetailsFetchError && error.status === 404) {
        return {
          album: null,
          fetchContextKey,
          artistSlug,
          albumId,
          notFound: true,
          errorCode: error.code ?? 'ALBUM_NOT_FOUND',
        };
      }
      return rejectWithValue(error instanceof Error ? error.message : 'Album details fetch failed');
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg.force) return true;
      const state = getState().albumDetails;
      if (state.status === 'loading') return false;
      const desired = buildAlbumDetailsFetchContextKey(arg.artistSlug, arg.albumId);
      if (state.status === 'succeeded' && state.fetchContextKey === desired && state.data) {
        return false;
      }
      return true;
    },
  }
);

const albumDetailsSlice = createSlice({
  name: 'albumDetails',
  initialState,
  reducers: {
    resetAlbumDetails() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAlbumDetailsPage.pending, (state, action) => {
        const artistSlug = action.meta.arg.artistSlug.trim();
        const albumId = action.meta.arg.albumId.trim();
        const nextKey = buildAlbumDetailsFetchContextKey(artistSlug, albumId);
        state.status = 'loading';
        state.error = null;
        state.errorCode = null;
        if (state.fetchContextKey && state.fetchContextKey !== nextKey) {
          state.data = null;
        }
        state.artistSlug = artistSlug;
        state.albumId = albumId;
        state.fetchContextKey = nextKey;
      })
      .addCase(fetchAlbumDetailsPage.fulfilled, (state, action) => {
        if (action.payload.staleAbort) return;
        const key = action.payload.fetchContextKey;
        if (state.fetchContextKey && state.fetchContextKey !== key) {
          // Newer navigation pending — ignore stale response.
          return;
        }
        state.status = 'succeeded';
        state.error = null;
        state.errorCode = action.payload.errorCode ?? null;
        state.data = action.payload.album;
        state.fetchContextKey = key;
        state.artistSlug = action.payload.artistSlug;
        state.albumId = action.payload.albumId;
        state.lastUpdated = Date.now();
      })
      .addCase(fetchAlbumDetailsPage.rejected, (state, action) => {
        if (action.payload === 'Aborted' || action.error.name === 'AbortError') {
          if (state.status === 'loading') {
            state.status = state.data ? 'succeeded' : 'idle';
          }
          return;
        }
        state.status = 'failed';
        state.error = action.payload ?? action.error.message ?? 'Album details fetch failed';
        state.errorCode = null;
      });
  },
});

export const { resetAlbumDetails } = albumDetailsSlice.actions;
export const albumDetailsReducer = albumDetailsSlice.reducer;
