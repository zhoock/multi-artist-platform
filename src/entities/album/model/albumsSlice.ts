import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AlbumEditable, IAlbumTranslations, IAlbumTrackTranslations } from '@models';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import { normalizeStemsVisibility } from '@shared/lib/stems/stemsVisibility';
import { normalizeTrackVisibility, type TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import type { RootState } from '@shared/model/appStore/types';
import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { isDashboardPathname } from '@shared/lib/publicArtistContext';
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';
import { applyTrackLyricsBundle } from '@entities/lyrics/model/actions';
import { patchAlbumsWithTrackLyrics } from '../lib/patchAlbumTrackLyrics';

import type {
  AlbumsState,
  FetchDashboardAlbumsArg,
  FetchDashboardAlbumsFulfilledPayload,
} from './types';

export type { FetchDashboardAlbumsArg } from './types';

function isOwnerDashboardAlbumsFetch(arg: FetchDashboardAlbumsArg): boolean {
  if (arg.ownerDashboard) return true;
  return isDashboardPathname() && !shouldUsePublicArtistCatalogInRedux();
}

/** Ignore stale `force` responses when a newer entitlement refresh is in flight. */
let latestForceAlbumsRequestId = '';

const initialState: AlbumsState = {
  dashboard: {
    status: 'idle',
    error: null,
    data: [],
    lastUpdated: null,
    inFlightFetchContextKey: null,
  },
};

function wrapAlbumsResult(albums: AlbumEditable[]): FetchDashboardAlbumsFulfilledPayload {
  return { albums };
}

function staleSnapshotPayload(getState: () => RootState): FetchDashboardAlbumsFulfilledPayload {
  return {
    albums: getState().albums.dashboard.data,
    staleAbort: true,
  };
}

function albumHasDisplayableTitle(album: { album?: unknown }): boolean {
  const root = typeof album.album === 'string' ? album.album.trim() : '';
  return Boolean(root);
}

export const fetchDashboardAlbums = createAsyncThunk<
  FetchDashboardAlbumsFulfilledPayload,
  FetchDashboardAlbumsArg,
  { rejectValue: string; state: RootState }
>(
  'albums/fetchMerged',
  async (arg, { signal, rejectWithValue, getState }) => {
    const isValidAlbum = (
      album: unknown
    ): album is {
      userId?: string;
      albumId: string;
      artistDisplayName?: string;
      album: string;
      fullName?: string;
      description?: string;
      cover?: string;
      release?: unknown;
      buttons?: unknown;
      details?: unknown[];
      tracks?: unknown[];
      translations?: IAlbumTranslations;
    } => {
      if (typeof album !== 'object' || album === null) return false;
      if (!('albumId' in album)) return false;
      if (typeof (album as { albumId: unknown }).albumId !== 'string') return false;
      return albumHasDisplayableTitle(album as { album?: unknown });
    };

    const readArtistDisplayNameFromApi = (album: { artistDisplayName?: string }): string => {
      return album.artistDisplayName?.trim() || '';
    };

    const isValidTrack = (
      track: unknown
    ): track is {
      id: string | number;
      title: string;
      duration?: number;
      src?: string;
      content?: string;
      authorship?: string;
      lyrics?: unknown;
      translations?: IAlbumTrackTranslations;
    } => {
      return (
        typeof track === 'object' &&
        track !== null &&
        'id' in track &&
        'title' in track &&
        typeof (track as { title: unknown }).title === 'string'
      );
    };

    const normalize = (data: unknown[]): AlbumEditable[] => {
      if (!Array.isArray(data)) {
        console.warn('⚠️ normalize: data is not an array', data);
        return [];
      }

      return data.filter(isValidAlbum).map((album) => {
        const tracks = Array.isArray(album.tracks)
          ? album.tracks.filter(isValidTrack).flatMap((track, idx) => {
              const id = normalizeTrackIdString(track.id);
              if (!id) return [];

              const rawOrder = (track as { order_index?: unknown }).order_index;
              const order_index =
                typeof rawOrder === 'number' && !Number.isNaN(rawOrder) ? rawOrder : idx;

              const normalizedTrack = {
                id,
                title: track.title,
                order_index,
                duration: track.duration,
                src: track.src ?? '',
                content: track.content ?? '',
                authorship: track.authorship,
                lyrics: track.lyrics,
                translations: track.translations,
                visibility: normalizeTrackVisibility(
                  (track as { visibility?: unknown }).visibility
                ),
                stemsVisibility: normalizeStemsVisibility(
                  (track as { stemsVisibility?: unknown }).stemsVisibility
                ),
                playbackLocked: Boolean((track as { playbackLocked?: unknown }).playbackLocked),
              };

              if (normalizedTrack.duration == null) {
                console.warn(
                  `[albumsSlice] ⚠️ Track ${normalizedTrack.id} (${normalizedTrack.title}) in album ${album.albumId} has no duration`
                );
              }

              return [normalizedTrack];
            })
          : [];

        const rawAlbum = album as Record<string, unknown>;
        const artistDisplayName = readArtistDisplayNameFromApi(album);
        return {
          userId: album.userId,
          dbAlbumId: typeof rawAlbum.dbAlbumId === 'string' ? rawAlbum.dbAlbumId : undefined,
          albumId: album.albumId,
          artistDisplayName,
          album: album.album,
          fullName:
            album.fullName ||
            (artistDisplayName ? `${artistDisplayName} — ${album.album}` : album.album),
          description: album.description || '',
          cover: album.cover || '',
          release: album.release || {},
          buttons: album.buttons || {},
          details: Array.isArray(album.details) ? album.details : [],
          isPublic: (album as { isPublic?: boolean }).isPublic,
          isPublished: (album as { isPublished?: boolean }).isPublished,
          translations: album.translations,
          tracks,
        } as AlbumEditable;
      });
    };

    try {
      const dashboardStale = (): boolean => {
        if (arg.ownerDashboard) return false;
        return !isDashboardPathname() || shouldUsePublicArtistCatalogInRedux();
      };

      try {
        const controller = new AbortController();
        // Smolyanoe-scale catalogs (synced lyrics) can exceed 8s on cold Netlify dev.
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        if (signal) {
          if (signal.aborted) {
            controller.abort();
          } else {
            signal.addEventListener('abort', () => controller.abort(), { once: true });
          }
        }

        const token = getToken();

        // Кабинет без JWT: иначе GET /api/albums без ?artist= → 400 на бэкенде.
        if (!token) {
          if (dashboardStale()) {
            return staleSnapshotPayload(getState);
          }
          return wrapAlbumsResult([]);
        }

        const headers: Record<string, string> = {
          'Cache-Control': 'no-cache',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const fetchDashboardAlbumsOnce = () =>
          fetchWithAuthSession(buildApiUrl('/api/albums', {}, { includeArtist: false }), {
            signal: controller.signal,
            cache: 'no-store',
            headers,
          });

        let response = await fetchDashboardAlbumsOnce();
        if (
          !response.ok &&
          (response.status === 500 || response.status === 502 || response.status === 503)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          response = await fetchDashboardAlbumsOnce();
        }

        clearTimeout(timeoutId);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data && Array.isArray(result.data)) {
            if (dashboardStale()) {
              return staleSnapshotPayload(getState);
            }
            if (result.data.length === 0) {
              return wrapAlbumsResult([]);
            }

            return wrapAlbumsResult(normalize(result.data));
          }
          throw new Error('Failed to fetch albums. Invalid response format.');
        }

        throw new Error(`Failed to fetch albums. Status: ${response.status}`);
      } catch (apiError) {
        console.error('❌ [albumsSlice] albums API failed in dashboard', apiError);
        throw apiError instanceof Error ? apiError : new Error(String(apiError));
      }
    } catch (error) {
      if (error instanceof Error) {
        return rejectWithValue(error.message);
      }
      return rejectWithValue('Unknown error');
    }
  },
  {
    condition: (arg, { getState }) => {
      if (!isOwnerDashboardAlbumsFetch(arg)) return false;

      const { force } = arg;
      const { status } = getState().albums.dashboard;
      if (status === 'loading' && !force) return false;
      if (status === 'succeeded' && !force) return false;
      return true;
    },
  }
);

const albumsSlice = createSlice({
  name: 'albums',
  initialState,
  reducers: {
    /** Сброс кабинета (после logout / удаления аккаунта). */
    resetAlbumsState: () => initialState,
    patchDashboardAlbumVisibility: (
      state,
      action: PayloadAction<{ albumId: string; isPublic: boolean }>
    ) => {
      const { albumId, isPublic } = action.payload;
      const list = state.dashboard.data;
      const idx = list.findIndex((x) => x.albumId === albumId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], isPublic };
      }
    },
    patchDashboardTrackVisibility: (
      state,
      action: PayloadAction<{ albumId: string; trackId: string; visibility: TrackVisibility }>
    ) => {
      const { albumId, trackId, visibility } = action.payload;
      const list = state.dashboard.data;
      const albumIdx = list.findIndex((x) => x.albumId === albumId);
      if (albumIdx < 0) return;
      const album = list[albumIdx];
      const tracks = album.tracks ?? [];
      const trackIdx = tracks.findIndex((t) => String(t.id) === String(trackId));
      if (trackIdx < 0) return;
      const nextTracks = tracks.slice();
      nextTracks[trackIdx] = { ...nextTracks[trackIdx], visibility };
      list[albumIdx] = { ...album, tracks: nextTracks };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(applyTrackLyricsBundle, (state, action) => {
      state.dashboard.data = patchAlbumsWithTrackLyrics(state.dashboard.data, action.payload);
    });
    builder
      .addCase(fetchDashboardAlbums.pending, (state, action) => {
        if (action.meta.arg.force) {
          latestForceAlbumsRequestId = action.meta.requestId;
        }
        state.dashboard.status = 'loading';
        state.dashboard.error = null;
        state.dashboard.inFlightFetchContextKey = 'dashboard';
      })
      .addCase(fetchDashboardAlbums.fulfilled, (state, action) => {
        if (
          action.meta.arg.force &&
          action.meta.requestId !== latestForceAlbumsRequestId &&
          !action.payload.staleAbort
        ) {
          return;
        }
        if (action.payload.staleAbort) {
          if (action.meta.arg.force && action.meta.requestId !== latestForceAlbumsRequestId) {
            return;
          }
          state.dashboard.inFlightFetchContextKey = null;
          if (state.dashboard.data.length > 0) {
            state.dashboard.status = 'succeeded';
          } else if (state.dashboard.status === 'loading') {
            state.dashboard.status = 'idle';
          }
          return;
        }
        state.dashboard.data = [...action.payload.albums];
        state.dashboard.status = 'succeeded';
        state.dashboard.error = null;
        state.dashboard.lastUpdated = Date.now();
        state.dashboard.inFlightFetchContextKey = null;
      })
      .addCase(fetchDashboardAlbums.rejected, (state, action) => {
        let errorText = 'Failed to fetch albums';
        if (action.payload) {
          errorText = action.payload;
        } else if (action.error && typeof action.error === 'object' && 'message' in action.error) {
          errorText = String((action.error as { message?: string }).message || errorText);
        }

        if (action.meta.arg.force && action.meta.requestId !== latestForceAlbumsRequestId) {
          return;
        }

        state.dashboard.inFlightFetchContextKey = null;
        if (state.dashboard.data.length > 0) {
          state.dashboard.status = 'succeeded';
          state.dashboard.error = null;
        } else {
          state.dashboard.status = 'failed';
          state.dashboard.error = errorText;
        }
      });
  },
});

export const { resetAlbumsState, patchDashboardAlbumVisibility, patchDashboardTrackVisibility } =
  albumsSlice.actions;
export const albumsReducer = albumsSlice.reducer;
