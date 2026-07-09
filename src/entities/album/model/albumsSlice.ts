import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { IAlbums, IAlbumTranslations, IAlbumTrackTranslations } from '@models';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import { normalizeStemsVisibility } from '@shared/lib/stems/stemsVisibility';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';
import type { RootState } from '@shared/model/appStore/types';
import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { isDashboardPathname } from '@shared/lib/publicArtistContext';
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';
import { buildPublicAlbumsFetchContextKey } from '@shared/lib/publicCatalogCacheKey';
import { selectPublicArtistSlug, setPublicArtistSlug } from '@shared/model/currentArtist';
import { applyTrackLyricsBundle } from '@entities/lyrics/model/actions';
import { patchAlbumsWithTrackLyrics } from '../lib/patchAlbumTrackLyrics';

import type { AlbumsState, FetchAlbumsArg, FetchAlbumsFulfilledPayload } from './types';

export type { FetchAlbumsArg } from './types';

function isOwnerDashboardAlbumsFetch(arg: FetchAlbumsArg): boolean {
  if (arg.forcePublicCatalog) return false;
  if (arg.ownerDashboard) return true;
  return isDashboardPathname() && !shouldUsePublicArtistCatalogInRedux();
}

function resolvePublicArtistSlugForFetch(arg: FetchAlbumsArg, getState: () => RootState): string {
  if (arg.publicArtistSlug !== undefined && arg.publicArtistSlug !== null) {
    return String(arg.publicArtistSlug).trim();
  }
  return selectPublicArtistSlug(getState())?.trim() ?? '';
}

function shouldFetchPublicArtistCatalog(arg: FetchAlbumsArg): boolean {
  if (arg.forcePublicCatalog) return true;
  if (isOwnerDashboardAlbumsFetch(arg)) return false;
  return shouldUsePublicArtistCatalogInRedux();
}

/** Ignore stale `force` responses when a newer entitlement refresh is in flight. */
let latestForceAlbumsRequestId = '';

const initialState: AlbumsState = {
  status: 'idle',
  error: null,
  data: [],
  lastUpdated: null,
  fetchContextKey: null,
  inFlightFetchContextKey: null,
  catalogArtistMissing: false,
  dashboard: {
    status: 'idle',
    error: null,
    data: [],
    lastUpdated: null,
    inFlightFetchContextKey: null,
  },
};

/** Ключ кэша публичного каталога в `data` (artist slug из store / фон под модалкой). */
function getCatalogAlbumsFetchContextKey(
  getState: () => RootState,
  slugOverride?: string | null
): string {
  if (typeof window === 'undefined') {
    return 'ssr';
  }
  const slug =
    slugOverride !== undefined
      ? String(slugOverride ?? '').trim()
      : (selectPublicArtistSlug(getState())?.trim() ?? '');
  return buildPublicAlbumsFetchContextKey(slug || null);
}

function wrapAlbumsResult(
  albums: IAlbums[],
  fetchContextKey: string,
  writeTarget: 'catalog' | 'dashboard',
  catalogArtistMissing = false
): FetchAlbumsFulfilledPayload {
  return { albums, fetchContextKey, writeTarget, catalogArtistMissing };
}

function staleSnapshotPayload(
  getState: () => RootState,
  target: 'catalog' | 'dashboard'
): FetchAlbumsFulfilledPayload {
  const s = getState().albums;
  if (target === 'dashboard') {
    return {
      albums: s.dashboard.data,
      fetchContextKey: 'dashboard',
      staleAbort: true,
      writeTarget: 'dashboard',
    };
  }
  return {
    albums: s.data,
    fetchContextKey: s.fetchContextKey ?? 'stale-keep',
    staleAbort: true,
    writeTarget: 'catalog',
  };
}

function albumHasDisplayableTitle(album: {
  album?: unknown;
  translations?: IAlbumTranslations;
}): boolean {
  const root = typeof album.album === 'string' ? album.album.trim() : '';
  if (root) return true;
  const en = album.translations?.en?.album?.trim() ?? '';
  const ru = album.translations?.ru?.album?.trim() ?? '';
  return Boolean(en || ru);
}

async function resolveCatalogArtistMissing(response: Response): Promise<boolean> {
  try {
    const payload = (await response.json()) as { code?: string };
    return payload.code === 'ARTIST_NOT_FOUND';
  } catch {
    return false;
  }
}

export const fetchAlbums = createAsyncThunk<
  FetchAlbumsFulfilledPayload,
  FetchAlbumsArg,
  { rejectValue: string; state: RootState }
>(
  'albums/fetchMerged',
  async (arg, { signal, rejectWithValue, getState }) => {
    const isValidAlbum = (
      album: unknown
    ): album is {
      userId?: string;
      albumId: string;
      artist: string;
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
      if (!('albumId' in album) || !('artist' in album)) return false;
      if (typeof (album as { albumId: unknown }).albumId !== 'string') return false;
      if (typeof (album as { artist: unknown }).artist !== 'string') return false;
      return albumHasDisplayableTitle(
        album as { album?: unknown; translations?: IAlbumTranslations }
      );
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

    const normalize = (data: unknown[]): IAlbums[] => {
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
        return {
          userId: album.userId,
          dbAlbumId: typeof rawAlbum.dbAlbumId === 'string' ? rawAlbum.dbAlbumId : undefined,
          albumId: album.albumId,
          artist: album.artist,
          album: album.album,
          fullName: album.fullName || `${album.artist} — ${album.album}`,
          description: album.description || '',
          cover: album.cover || '',
          release: album.release || {},
          buttons: album.buttons || {},
          details: Array.isArray(album.details) ? album.details : [],
          isPublic: (album as { isPublic?: boolean }).isPublic,
          isPublished: (album as { isPublished?: boolean }).isPublished,
          translations: album.translations,
          tracks,
        } as IAlbums;
      });
    };

    try {
      const ownerDashboard = isOwnerDashboardAlbumsFetch(arg);
      const usePublicCatalog = shouldFetchPublicArtistCatalog(arg);
      const isFullscreenDashboard = ownerDashboard;
      const publicSlug = usePublicCatalog ? resolvePublicArtistSlugForFetch(arg, getState) : '';
      const requestFetchKey = usePublicCatalog
        ? getCatalogAlbumsFetchContextKey(getState, publicSlug || null)
        : 'dashboard';
      const writeTarget: 'catalog' | 'dashboard' = usePublicCatalog ? 'catalog' : 'dashboard';

      const catalogStale = (): boolean =>
        getCatalogAlbumsFetchContextKey(getState, publicSlug || null) !== requestFetchKey;

      const dashboardStale = (): boolean => {
        if (ownerDashboard) return false;
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
        if (isFullscreenDashboard && !token) {
          if (dashboardStale()) {
            return staleSnapshotPayload(getState, 'dashboard');
          }
          return wrapAlbumsResult([], 'dashboard', 'dashboard');
        }

        // Публичный каталог: без public slug API не вызываем (нужен контекст артиста).
        if (usePublicCatalog && !publicSlug) {
          if (catalogStale()) {
            return staleSnapshotPayload(getState, 'catalog');
          }
          return wrapAlbumsResult([], requestFetchKey, 'catalog');
        }

        const headers: Record<string, string> = {
          'Cache-Control': 'no-cache',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetchWithAuthSession(
          buildApiUrl(
            '/api/albums',
            {},
            {
              includeArtist: usePublicCatalog,
              artistSlugOverride: usePublicCatalog ? publicSlug : null,
              forceArtistQuery: Boolean(arg.forcePublicCatalog),
            }
          ),
          {
            signal: controller.signal,
            cache: 'no-store',
            headers,
          }
        );

        clearTimeout(timeoutId);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data && Array.isArray(result.data)) {
            if (result.data.length === 0) {
              if (isFullscreenDashboard) {
                if (dashboardStale()) {
                  return staleSnapshotPayload(getState, 'dashboard');
                }
              } else if (catalogStale()) {
                return staleSnapshotPayload(getState, 'catalog');
              }
              return wrapAlbumsResult([], requestFetchKey, writeTarget);
            }

            const firstAlbum = result.data[0];
            const firstTrack = firstAlbum?.tracks?.[0];
            console.log('[albumsSlice] ✅ Данные из API:', {
              source: 'API',
              albumsCount: result.data.length,
              firstAlbumId: firstAlbum?.albumId,
              firstTrack: firstTrack
                ? {
                    id: firstTrack.id,
                    title: firstTrack.title,
                    hasDuration: 'duration' in firstTrack,
                    duration: firstTrack.duration,
                    durationType: typeof firstTrack.duration,
                  }
                : null,
            });

            if (isFullscreenDashboard) {
              if (dashboardStale()) {
                return staleSnapshotPayload(getState, 'dashboard');
              }
            } else if (catalogStale()) {
              return staleSnapshotPayload(getState, 'catalog');
            }
            return wrapAlbumsResult(normalize(result.data), requestFetchKey, writeTarget);
          }
          throw new Error('Failed to fetch albums. Invalid response format.');
        }

        // Неверный slug или страница без публичного контента (?artist=) — завершаем загрузку, без throw.
        if (response.status === 404 && usePublicCatalog) {
          const catalogArtistMissing = await resolveCatalogArtistMissing(response);
          return wrapAlbumsResult([], requestFetchKey, writeTarget, catalogArtistMissing);
        }

        if (response.status >= 500 && usePublicCatalog && publicSlug) {
          if (catalogStale()) {
            return staleSnapshotPayload(getState, 'catalog');
          }
          const cachedAlbums = getState().albums;
          if (cachedAlbums.data.length > 0 && cachedAlbums.fetchContextKey === requestFetchKey) {
            throw new Error(`Failed to fetch albums. Status: ${response.status}`);
          }
          const catalogArtistMissing = await resolveCatalogArtistMissing(response);
          return wrapAlbumsResult([], requestFetchKey, writeTarget, catalogArtistMissing);
        }

        throw new Error(`Failed to fetch albums. Status: ${response.status}`);
      } catch (apiError) {
        if (usePublicCatalog && publicSlug) {
          if (catalogStale()) {
            return staleSnapshotPayload(getState, 'catalog');
          }
          const cachedAlbums = getState().albums;
          if (cachedAlbums.data.length > 0 && cachedAlbums.fetchContextKey === requestFetchKey) {
            throw apiError instanceof Error ? apiError : new Error(String(apiError));
          }
        }

        if (isFullscreenDashboard) {
          console.error('❌ [albumsSlice] albums API failed in /dashboard', apiError);
        } else if (apiError instanceof Error && apiError.name === 'AbortError') {
          console.warn('⚠️ [albumsSlice] API request timeout (25s)', apiError);
        } else {
          console.warn('⚠️ [albumsSlice] albums API failed', apiError);
        }
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
      const { force } = arg;
      const albums = getState().albums;
      const isFullscreenDashboard = isOwnerDashboardAlbumsFetch(arg);

      if (isFullscreenDashboard) {
        const { status } = albums.dashboard;
        if (status === 'loading' && !force) return false;
        if (status === 'succeeded' && !force) return false;
        return true;
      }

      const { status } = albums;
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
    /** Сброс публичного каталога и кабинета (после logout / удаления аккаунта). */
    resetAlbumsState: () => initialState,
    patchDashboardAlbumVisibility: (
      state,
      action: PayloadAction<{ albumId: string; isPublic: boolean }>
    ) => {
      const { albumId, isPublic } = action.payload;
      const patchList = (list: IAlbums[]) => {
        const idx = list.findIndex((x) => x.albumId === albumId);
        if (idx >= 0) {
          list[idx] = { ...list[idx], isPublic };
        }
      };
      patchList(state.dashboard.data);
      patchList(state.data);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(applyTrackLyricsBundle, (state, action) => {
      const bundle = action.payload;
      state.dashboard.data = patchAlbumsWithTrackLyrics(state.dashboard.data, bundle);
      state.data = patchAlbumsWithTrackLyrics(state.data, bundle);
    });
    builder
      .addCase(setPublicArtistSlug, (state, action) => {
        const desiredKey = buildPublicAlbumsFetchContextKey(action.payload);
        if (state.fetchContextKey === desiredKey) return;
        state.data = [];
        state.status = 'idle';
        state.error = null;
        state.catalogArtistMissing = false;
        state.inFlightFetchContextKey = null;
        // Сбрасываем ключ кэша вместе с data: иначе transient null-slug (auth overlay,
        // ?artist= без значения) оставляет fetchContextKey от прежнего артиста →
        // catalogCacheStale + idle/empty deadlock после возврата того же slug.
        state.fetchContextKey = null;
      })
      .addCase(fetchAlbums.pending, (state, action) => {
        if (action.meta.arg.force) {
          latestForceAlbumsRequestId = action.meta.requestId;
        }
        const isFullscreenDashboard = isOwnerDashboardAlbumsFetch(action.meta.arg);
        if (isFullscreenDashboard) {
          state.dashboard.status = 'loading';
          state.dashboard.error = null;
          state.dashboard.inFlightFetchContextKey = 'dashboard';
        } else {
          state.inFlightFetchContextKey = 'public';
          state.error = null;
          state.catalogArtistMissing = false;
          const backgroundRefetch =
            Boolean(action.meta.arg.force) && state.status === 'succeeded' && state.data.length > 0;
          if (!backgroundRefetch) {
            state.status = 'loading';
          }
        }
      })
      .addCase(fetchAlbums.fulfilled, (state, action) => {
        const target = action.payload.writeTarget ?? 'catalog';
        if (
          action.meta.arg.force &&
          action.meta.requestId !== latestForceAlbumsRequestId &&
          !action.payload.staleAbort
        ) {
          if (target === 'dashboard') {
            state.dashboard.inFlightFetchContextKey = null;
            if (state.dashboard.data.length > 0) {
              state.dashboard.status = 'succeeded';
            }
          } else {
            state.inFlightFetchContextKey = null;
            if (state.data.length > 0) {
              state.status = 'succeeded';
            }
          }
          return;
        }
        if (action.payload.staleAbort) {
          if (target === 'dashboard') {
            state.dashboard.inFlightFetchContextKey = null;
            if (state.dashboard.data.length > 0) {
              state.dashboard.status = 'succeeded';
            } else if (state.dashboard.status === 'loading') {
              state.dashboard.status = 'idle';
            }
          } else {
            state.inFlightFetchContextKey = null;
            if (state.data.length > 0) {
              state.status = 'succeeded';
            } else if (state.status === 'loading') {
              state.status = 'idle';
            }
          }
          return;
        }
        if (target === 'dashboard') {
          state.dashboard.data = [...action.payload.albums];
          state.dashboard.status = 'succeeded';
          state.dashboard.error = null;
          state.dashboard.lastUpdated = Date.now();
          state.dashboard.inFlightFetchContextKey = null;
          return;
        }
        const incoming = action.payload.albums;
        const hadCatalogData = state.data.length > 0;
        const keepPreviousOnEmptyRefetch =
          !action.meta.arg.force &&
          incoming.length === 0 &&
          hadCatalogData &&
          !action.payload.catalogArtistMissing;

        if (!keepPreviousOnEmptyRefetch) {
          state.data = [...incoming];
        }
        state.fetchContextKey = action.payload.fetchContextKey;
        state.status = 'succeeded';
        state.error = null;
        state.lastUpdated = Date.now();
        state.inFlightFetchContextKey = null;
        state.catalogArtistMissing = Boolean(action.payload.catalogArtistMissing);
      })
      .addCase(fetchAlbums.rejected, (state, action) => {
        let errorText = 'Failed to fetch albums';
        if (action.payload) {
          errorText = action.payload;
        } else if (action.error && typeof action.error === 'object' && 'message' in action.error) {
          errorText = String((action.error as { message?: string }).message || errorText);
        }

        const dashInFlight = state.dashboard.inFlightFetchContextKey != null;
        const catInFlight = state.inFlightFetchContextKey != null;

        if (dashInFlight) {
          state.dashboard.inFlightFetchContextKey = null;
          if (state.dashboard.data.length > 0) {
            state.dashboard.status = 'succeeded';
            state.dashboard.error = null;
          } else {
            state.dashboard.status = 'failed';
            state.dashboard.error = errorText;
          }
        }

        if (catInFlight) {
          state.inFlightFetchContextKey = null;
          if (state.data.length > 0) {
            state.status = 'succeeded';
            state.error = null;
          } else {
            state.status = 'failed';
            state.error = errorText;
          }
        }
      });
  },
});

export const { resetAlbumsState, patchDashboardAlbumVisibility } = albumsSlice.actions;
export const albumsReducer = albumsSlice.reducer;
