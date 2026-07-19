import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '@shared/model/appStore/types';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getToken } from '@shared/lib/auth';
import { buildPublicAlbumsFetchContextKey } from '@shared/lib/publicCatalogCacheKey';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import type { CatalogAlbum } from './catalogAlbum';
import { normalizeCatalogAlbum } from './catalogAlbum';
import type { RequestStatus } from './types';

export type ArtistAlbumCatalogState = {
  status: RequestStatus;
  error: string | null;
  data: CatalogAlbum[];
  lastUpdated: number | null;
  fetchContextKey: string | null;
  artistMissing: boolean;
};

const initialState: ArtistAlbumCatalogState = {
  status: 'idle',
  error: null,
  data: [],
  lastUpdated: null,
  fetchContextKey: null,
  artistMissing: false,
};

export type FetchArtistAlbumCatalogArg = {
  force?: boolean;
  publicArtistSlug?: string | null;
};

export type FetchArtistAlbumCatalogResult = {
  albums: CatalogAlbum[];
  fetchContextKey: string;
  artistMissing?: boolean;
  staleAbort?: boolean;
};

function resolveSlug(
  arg: FetchArtistAlbumCatalogArg | undefined,
  getState: () => RootState
): string {
  const fromArg = arg?.publicArtistSlug?.trim() ?? '';
  if (fromArg) return fromArg;
  return selectPublicArtistSlug(getState())?.trim() ?? '';
}

export const fetchArtistAlbumCatalog = createAsyncThunk<
  FetchArtistAlbumCatalogResult,
  FetchArtistAlbumCatalogArg | undefined,
  { state: RootState; rejectValue: string }
>(
  'artistAlbumCatalog/fetch',
  async (arg, { getState, signal, rejectWithValue }) => {
    const slug = resolveSlug(arg, getState);
    const fetchContextKey = buildPublicAlbumsFetchContextKey(slug || null);

    if (!slug) {
      return { albums: [], fetchContextKey, artistMissing: false };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetchWithAuthSession(
        `/api/artists/${encodeURIComponent(slug)}/albums`,
        {
          signal: controller.signal,
          cache: 'no-store',
          headers,
        }
      );

      clearTimeout(timeoutId);

      const currentDesired = buildPublicAlbumsFetchContextKey(resolveSlug(arg, getState) || null);
      if (currentDesired !== fetchContextKey) {
        return {
          albums: getState().artistAlbumCatalog.data,
          fetchContextKey: getState().artistAlbumCatalog.fetchContextKey ?? fetchContextKey,
          staleAbort: true,
        };
      }

      if (response.status === 404) {
        return { albums: [], fetchContextKey, artistMissing: true };
      }

      if (!response.ok) {
        return rejectWithValue(`Failed to load catalog (${response.status})`);
      }

      const result = (await response.json()) as { success?: boolean; data?: unknown };
      if (!result.success || !Array.isArray(result.data)) {
        return rejectWithValue('Invalid catalog response');
      }

      const albums = result.data
        .map((row) => normalizeCatalogAlbum(row))
        .filter((row): row is CatalogAlbum => row !== null);

      return { albums, fetchContextKey, artistMissing: false };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return rejectWithValue('Aborted');
      }
      return rejectWithValue(error instanceof Error ? error.message : 'Catalog fetch failed');
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) return true;
      const state = getState().artistAlbumCatalog;
      if (state.status === 'loading') return false;
      const slug = resolveSlug(arg, getState);
      const desired = buildPublicAlbumsFetchContextKey(slug || null);
      if (state.status === 'succeeded' && state.fetchContextKey === desired) return false;
      return true;
    },
  }
);

const artistAlbumCatalogSlice = createSlice({
  name: 'artistAlbumCatalog',
  initialState,
  reducers: {
    resetArtistAlbumCatalog() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchArtistAlbumCatalog.pending, (state, action) => {
        state.status = 'loading';
        state.error = null;
        const slug = action.meta.arg?.publicArtistSlug?.trim() ?? '';
        if (slug) {
          const nextKey = buildPublicAlbumsFetchContextKey(slug);
          if (state.fetchContextKey && state.fetchContextKey !== nextKey) {
            state.data = [];
            state.artistMissing = false;
          }
        }
      })
      .addCase(fetchArtistAlbumCatalog.fulfilled, (state, action) => {
        if (action.payload.staleAbort) return;
        state.status = 'succeeded';
        state.error = null;
        state.data = action.payload.albums;
        state.fetchContextKey = action.payload.fetchContextKey;
        state.lastUpdated = Date.now();
        state.artistMissing = Boolean(action.payload.artistMissing);
      })
      .addCase(fetchArtistAlbumCatalog.rejected, (state, action) => {
        if (action.payload === 'Aborted' || action.error.name === 'AbortError') {
          if (state.status === 'loading') {
            state.status = state.data.length > 0 ? 'succeeded' : 'idle';
          }
          return;
        }
        state.status = 'failed';
        state.error = action.payload ?? action.error.message ?? 'Catalog fetch failed';
      });
  },
});

export const { resetArtistAlbumCatalog } = artistAlbumCatalogSlice.actions;
export const artistAlbumCatalogReducer = artistAlbumCatalogSlice.reducer;
