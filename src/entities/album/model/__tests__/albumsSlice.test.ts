import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { fetchDashboardAlbums, albumsReducer, resetAlbumsState } from '../albumsSlice';
import {
  selectDashboardAlbumsData,
  selectDashboardAlbumsStatus,
  selectDashboardAlbumsError,
  selectDashboardAlbumById,
} from '../selectors';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { AlbumEditable } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { AppDispatch } from '@shared/model/appStore/types';
import { currentArtistReducer, setPublicArtistSlug } from '@shared/model/currentArtist';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { syncDashboardAlbumsPublicCatalogOverlay } from '@shared/lib/dashboardModalBackground';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
const mockSuccessResponse = (data: unknown) =>
  ({
    ok: true,
    json: async () => ({ success: true, data }),
  }) as Response;

/** JWT с валидным exp — иначе purgeInvalidAuthSessionFromStorage очистит localStorage в getToken(). */
const TEST_AUTH_TOKEN = (() => {
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `test.${payload}.sig`;
})();

const createTestStore = () => {
  const store = configureStore({
    reducer: {
      albums: albumsReducer,
      currentArtist: currentArtistReducer,
      lang: () => ({ current: 'en' as SupportedLang }),
      popup: () => ({ isOpen: false }),
      player: () => initialPlayerState,
      articles: () => ({
        status: 'idle' as const,
        error: null,
        data: [],
        lastUpdated: null,
        lastPublicArtistSlug: null,
        inFlightFetchContextKey: null,
        dashboard: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      }),
      helpArticles: () => ({
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      }),
      uiDictionary: () => ({
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      }),
      artistAlbumCatalog: () => ({
        status: 'idle' as const,
        error: null,
        data: [],
        lastUpdated: null,
        fetchContextKey: null,
        artistMissing: false,
      }),
      albumDetails: () => ({
        status: 'idle' as const,
        error: null,
        errorCode: null,
        data: null,
        fetchContextKey: null,
        artistSlug: null,
        albumId: null,
        lastUpdated: null,
      }),
      trackLyrics: trackLyricsReducer,
    },
  });
  return store;
};

function setupDashboardFetchContext(store: ReturnType<typeof createTestStore>) {
  window.history.pushState({}, '', '/dashboard-new/albums');
  window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
  store.dispatch(setPublicArtistSlug(null));
}

const mockAlbum: AlbumEditable = {
  albumId: 'album-1',
  album: 'Test Album',
  artist: '',
  artistDisplayName: 'Test Artist',
  fullName: 'Test Artist — Test Album',
  description: 'Test Description',
  release: { date: '2024-01-01' },
  cover: 'cover',
  tracks: [],
  buttons: {},
  details: [],
};

describe('albumsSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    window.history.pushState({}, '', '/');
    window.localStorage.clear();
    syncDashboardAlbumsPublicCatalogOverlay(false);
  });

  describe('reducer', () => {
    test('должен возвращать начальное состояние', () => {
      const state = albumsReducer(undefined, { type: 'unknown' });
      expect(state).toEqual({
        dashboard: {
          status: 'idle',
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      });
    });

    test('resetAlbumsState сбрасывает dashboard', () => {
      const store = createTestStore();
      setupDashboardFetchContext(store);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse([mockAlbum]));
      return (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      ).then(() => {
        expect(selectDashboardAlbumsData(store.getState())).toHaveLength(1);
        store.dispatch(resetAlbumsState());
        expect(selectDashboardAlbumsData(store.getState())).toEqual([]);
        expect(selectDashboardAlbumsStatus(store.getState())).toBe('idle');
      });
    });
  });

  describe('fetchDashboardAlbums', () => {
    test('не стартует на публичном маршруте без ownerDashboard', async () => {
      const store = createTestStore();
      window.history.pushState({}, '', '/?artist=test-artist');
      store.dispatch(setPublicArtistSlug('test-artist'));

      const result = await (store.dispatch as AppDispatch)(fetchDashboardAlbums({}));
      expect(result.meta.requestStatus).toBe('rejected');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('idle');
    });

    test('загружает AlbumEditable в dashboard при ownerDashboard', async () => {
      const store = createTestStore();
      setupDashboardFetchContext(store);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse([mockAlbum]));

      const result = await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );

      expect(result.meta.requestStatus).toBe('fulfilled');
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('succeeded');
      expect(selectDashboardAlbumsError(store.getState())).toBeNull();
      expect(selectDashboardAlbumsData(store.getState())).toEqual([
        expect.objectContaining({ albumId: 'album-1', album: 'Test Album' }),
      ]);
      expect(selectDashboardAlbumById(store.getState(), 'album-1')?.albumId).toBe('album-1');
    });

    test('без JWT возвращает пустой dashboard на /dashboard', async () => {
      const store = createTestStore();
      window.history.pushState({}, '', '/dashboard-new/albums');
      store.dispatch(setPublicArtistSlug(null));

      const result = await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );

      expect(result.meta.requestStatus).toBe('fulfilled');
      expect(selectDashboardAlbumsData(store.getState())).toEqual([]);
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('succeeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('force повторно запрашивает API после succeeded', async () => {
      const store = createTestStore();
      setupDashboardFetchContext(store);
      mockFetch.mockResolvedValue(mockSuccessResponse([mockAlbum]));

      await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );
      await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('succeeded');
    });

    test('без force не перезапрашивает после succeeded', async () => {
      const store = createTestStore();
      setupDashboardFetchContext(store);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse([mockAlbum]));

      await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );
      await (store.dispatch as AppDispatch)(fetchDashboardAlbums({ ownerDashboard: true }));

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('API error → failed при пустом dashboard', async () => {
      const store = createTestStore();
      setupDashboardFetchContext(store);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      const result = await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );

      expect(result.meta.requestStatus).toBe('rejected');
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('failed');
      expect(selectDashboardAlbumsError(store.getState())).toMatch(/500/);
    });

    test('после ошибки force восстанавливает данные', async () => {
      const store = createTestStore();
      setupDashboardFetchContext(store);
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({}),
        } as Response)
        .mockResolvedValueOnce(mockSuccessResponse([mockAlbum]));

      await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('failed');

      await (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('succeeded');
      expect(selectDashboardAlbumsData(store.getState())[0]?.albumId).toBe('album-1');
    });

    test('pending выставляет dashboard inFlight', () => {
      const store = createTestStore();
      setupDashboardFetchContext(store);
      mockFetch.mockImplementation(() => new Promise(() => {}));

      void (store.dispatch as AppDispatch)(
        fetchDashboardAlbums({ force: true, ownerDashboard: true })
      );

      expect(selectDashboardAlbumsStatus(store.getState())).toBe('loading');
      expect(store.getState().albums.dashboard.inFlightFetchContextKey).toBe('dashboard');
    });
  });
});
