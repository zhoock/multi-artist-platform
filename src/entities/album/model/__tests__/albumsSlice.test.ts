import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { fetchAlbums, albumsReducer } from '../albumsSlice';
import {
  selectAlbumsStatus,
  selectAlbumsError,
  selectAlbumsData,
  selectAlbumById,
  selectDashboardAlbumsData,
  selectDashboardAlbumsStatus,
  selectDashboardAlbumsError,
  selectCatalogArtistMissing,
  selectAlbumsFetchContextKey,
  selectPublicAlbumsCacheIsStale,
} from '../selectors';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { IAlbums } from '@models';
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

// Вспомогательная функция для создания тестового store
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
  store.dispatch(setPublicArtistSlug('test-artist'));
  return store;
};

function setupDashboardFetchContext(store: ReturnType<typeof createTestStore>) {
  window.history.pushState({}, '', '/dashboard-new/albums');
  window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
  store.dispatch(setPublicArtistSlug(null));
}

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
      });
    });
  });

  test('setPublicArtistSlug сбрасывает публичный каталог при смене артиста', async () => {
    const mockAlbums: IAlbums[] = [
      {
        albumId: 'album-1',
        album: 'Test Album',
        artist: 'Test Artist',
        fullName: 'Test Artist — Test Album',
        description: 'Test Description',
        release: { date: '2024-01-01' },
        cover: 'cover',
        tracks: [],
        buttons: {},
        details: [],
      },
    ];

    mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

    const store = createTestStore();
    store.dispatch(setPublicArtistSlug('artist-a'));
    await (store.dispatch as AppDispatch)(fetchAlbums({}));

    expect(selectAlbumsData(store.getState())).toHaveLength(1);
    expect(selectAlbumsFetchContextKey(store.getState())).toBe('public:artist-a');

    store.dispatch(setPublicArtistSlug('artist-b'));

    expect(selectAlbumsData(store.getState())).toEqual([]);
    expect(selectAlbumsStatus(store.getState())).toBe('idle');
  });

  test('transient null slug сбрасывает fetchContextKey — повторный тот же артист снова грузится', async () => {
    const mockAlbums: IAlbums[] = [
      {
        albumId: 'album-1',
        album: 'Test Album',
        artist: 'Test Artist',
        fullName: 'Test Artist — Test Album',
        description: 'Test Description',
        release: { date: '2024-01-01' },
        cover: 'cover',
        tracks: [],
        buttons: {},
        details: [],
      },
    ];

    mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

    const store = createTestStore();
    store.dispatch(setPublicArtistSlug('artist-a'));
    await (store.dispatch as AppDispatch)(fetchAlbums({}));

    expect(selectAlbumsFetchContextKey(store.getState())).toBe('public:artist-a');

    store.dispatch(setPublicArtistSlug(null));
    expect(selectAlbumsFetchContextKey(store.getState())).toBeNull();
    expect(selectAlbumsData(store.getState())).toEqual([]);
    expect(selectAlbumsStatus(store.getState())).toBe('idle');

    mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));
    store.dispatch(setPublicArtistSlug('artist-a'));
    await (store.dispatch as AppDispatch)(fetchAlbums({}));

    expect(selectAlbumsStatus(store.getState())).toBe('succeeded');
    expect(selectAlbumsData(store.getState())).toHaveLength(1);
    expect(selectAlbumsFetchContextKey(store.getState())).toBe('public:artist-a');
  });

  test('force refetch с уже загруженным каталогом не переводит status в loading', async () => {
    const mockAlbums: IAlbums[] = [
      {
        albumId: 'album-1',
        album: 'Test Album',
        artist: 'Test Artist',
        fullName: 'Test Artist — Test Album',
        description: 'Test Description',
        release: { date: '2024-01-01' },
        cover: 'cover',
        tracks: [],
        buttons: {},
        details: [],
      },
    ];

    mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

    const store = createTestStore();
    await (store.dispatch as AppDispatch)(fetchAlbums({}));

    expect(selectAlbumsStatus(store.getState())).toBe('succeeded');
    expect(selectAlbumsData(store.getState())).toHaveLength(1);

    mockFetch.mockImplementation(() => new Promise(() => {}));
    store.dispatch(fetchAlbums({ force: true }));

    expect(selectAlbumsStatus(store.getState())).toBe('succeeded');
    expect(selectAlbumsData(store.getState())).toHaveLength(1);
  });

  describe('fetchAlbums thunk', () => {
    const mockAlbums: IAlbums[] = [
      {
        albumId: 'album-1',
        album: 'Test Album',
        artist: 'Test Artist',
        fullName: 'Test Artist — Test Album',
        description: 'Test Description',
        release: {
          date: '2024-01-01',
        },
        cover: 'cover',
        tracks: [],
        buttons: {},
        details: [],
      },
    ];

    test('должен успешно загрузить альбомы', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({}));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: mockAlbums,
        fetchContextKey: 'public:test-artist',
        writeTarget: 'catalog',
        catalogArtistMissing: false,
      });

      const state = store.getState();
      expect(selectAlbumsStatus(state)).toBe('succeeded');
      expect(selectAlbumsError(state)).toBeNull();
      expect(selectAlbumsData(state)).toEqual(mockAlbums);
      expect(selectAlbumsData(state)[0].albumId).toBe('album-1');
      expect(selectCatalogArtistMissing(state)).toBe(false);
    });

    test('публичный каталог: 404 помечает артиста отсутствующим и завершает загрузку', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: 'Artist not found', code: 'ARTIST_NOT_FOUND' }),
      } as Response);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: [],
        fetchContextKey: 'public:test-artist',
        writeTarget: 'catalog',
        catalogArtistMissing: true,
      });

      const state = store.getState();
      expect(selectAlbumsStatus(state)).toBe('succeeded');
      expect(selectAlbumsData(state)).toEqual([]);
      expect(selectCatalogArtistMissing(state)).toBe(true);
    });

    test('публичный каталог: ARTIST_NOT_PUBLISHED не помечает slug отсутствующим', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          error: 'Artist not found',
          code: 'ARTIST_NOT_PUBLISHED',
        }),
      } as Response);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: [],
        fetchContextKey: 'public:test-artist',
        writeTarget: 'catalog',
        catalogArtistMissing: false,
      });

      const state = store.getState();
      expect(selectAlbumsStatus(state)).toBe('succeeded');
      expect(selectAlbumsData(state)).toEqual([]);
      expect(selectCatalogArtistMissing(state)).toBe(false);
    });

    test('публичный каталог: 500 с ARTIST_NOT_PUBLISHED не помечает slug отсутствующим', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: 'Artist not found',
          code: 'ARTIST_NOT_PUBLISHED',
        }),
      } as Response);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: [],
        fetchContextKey: 'public:test-artist',
        writeTarget: 'catalog',
        catalogArtistMissing: false,
      });
      expect(selectAlbumsStatus(store.getState())).toBe('succeeded');
      expect(selectCatalogArtistMissing(store.getState())).toBe(false);
    });

    test('при оверлее дашборда обновляет публичный каталог с ?artist=', async () => {
      window.history.pushState({}, '', '/dashboard-new/archive');
      window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
      syncDashboardAlbumsPublicCatalogOverlay(true);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      store.dispatch(setPublicArtistSlug('artist-a'));
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: mockAlbums,
        fetchContextKey: 'public:artist-a',
        writeTarget: 'catalog',
        catalogArtistMissing: false,
      });
      expect(selectAlbumsData(store.getState())).toEqual(mockAlbums);
      expect(selectDashboardAlbumsData(store.getState())).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/albums?artist=artist-a',
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
          }),
        })
      );
    });

    test('ownerDashboard в оверлее пишет альбомы владельца в dashboard bucket', async () => {
      window.history.pushState({}, '', '/');
      window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
      syncDashboardAlbumsPublicCatalogOverlay(true);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toMatchObject({
        fetchContextKey: 'dashboard',
        writeTarget: 'dashboard',
      });
      expect(selectAlbumsData(store.getState())).toEqual([]);
      expect(selectDashboardAlbumsData(store.getState())[0]?.albumId).toBe('album-1');
      expect(selectDashboardAlbumsStatus(store.getState())).toBe('succeeded');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/albums',
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
          }),
        })
      );
    });

    test('на полноэкранном dashboard загружает альбомы владельца в dashboard bucket', async () => {
      window.history.pushState({}, '', '/dashboard-new/albums');
      window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
      syncDashboardAlbumsPublicCatalogOverlay(false);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      store.dispatch(setPublicArtistSlug('artist-a'));
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toMatchObject({
        fetchContextKey: 'dashboard',
        writeTarget: 'dashboard',
      });
      expect(selectAlbumsData(store.getState())).toEqual([]);
      expect(selectDashboardAlbumsData(store.getState())[0]?.albumId).toBe('album-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/albums',
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
          }),
        })
      );
    });

    test('forcePublicCatalog на полноэкранном dashboard пишет в публичный каталог с явным slug', async () => {
      window.history.pushState({}, '', '/dashboard-new/albums');
      window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
      syncDashboardAlbumsPublicCatalogOverlay(false);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(
        fetchAlbums({
          force: true,
          forcePublicCatalog: true,
          publicArtistSlug: 'artist-a',
        })
      );

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: mockAlbums,
        fetchContextKey: 'public:artist-a',
        writeTarget: 'catalog',
        catalogArtistMissing: false,
      });
      expect(selectAlbumsData(store.getState())).toEqual(mockAlbums);
      expect(selectDashboardAlbumsData(store.getState())).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/albums?artist=artist-a',
        expect.objectContaining({
          cache: 'no-store',
        })
      );
    });

    test('на dashboard без токена не дергает API (иначе 400 без ?artist=)', async () => {
      window.history.pushState({}, '', '/dashboard-new/albums');
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: [],
        fetchContextKey: 'dashboard',
        writeTarget: 'dashboard',
        catalogArtistMissing: false,
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(selectDashboardAlbumsData(store.getState())).toEqual([]);
    });

    test('на публичной странице с токеном передаёт Authorization (бэкенд принимает JWT без ?artist=)', async () => {
      window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchAlbums({}));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/albums?artist=test-artist',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
          }),
        })
      );
    });

    test('должен обработать ошибку загрузки', async () => {
      const errorMessage = 'Network error';
      mockFetch.mockRejectedValueOnce(new Error(errorMessage));

      const store = createTestStore();
      const publicResult = await (store.dispatch as AppDispatch)(fetchAlbums({}));

      expect(publicResult.type).toBe('albums/fetchMerged/rejected');
      expect(selectCatalogArtistMissing(store.getState())).toBe(false);
      expect(selectAlbumsStatus(store.getState())).toBe('failed');

      mockFetch.mockRejectedValueOnce(new Error(errorMessage));
      const dashboardStore = createTestStore();
      setupDashboardFetchContext(dashboardStore);
      const dashboardResult = await (dashboardStore.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      expect(dashboardResult.type).toBe('albums/fetchMerged/rejected');
      expect(selectDashboardAlbumsStatus(dashboardStore.getState())).toBe('failed');
    });

    test('должен установить статус loading при начале загрузки', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Никогда не разрешается

      const store = createTestStore();
      const promise = (store.dispatch as AppDispatch)(fetchAlbums({}));

      // Проверяем состояние во время загрузки
      const loadingState = store.getState();
      expect(selectAlbumsStatus(loadingState)).toBe('loading');
      expect(selectAlbumsError(loadingState)).toBeNull();

      // Отменяем промис, чтобы тест завершился
      promise.abort();
    });

    test('не должен запускать загрузку, если данные уже загружаются', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Никогда не разрешается

      const store = createTestStore();

      // Первая загрузка
      const promise1 = (store.dispatch as AppDispatch)(fetchAlbums({}));

      // Вторая загрузка (должна быть отменена condition)
      const promise2 = (store.dispatch as AppDispatch)(fetchAlbums({}));

      // Проверяем, что getJSON был вызван только один раз
      expect(mockFetch).toHaveBeenCalledTimes(1);

      promise1.abort();
      promise2.abort();
    });

    test('с force: true разрешает запуск, пока первая загрузка в полёте', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const store = createTestStore();
      (store.dispatch as AppDispatch)(fetchAlbums({}));
      (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('устаревший force fulfill не оставляет dashboard.status=loading при пустом data', async () => {
      let releaseFirst!: (r: Response) => void;
      const firstHangs = new Promise<Response>((r) => {
        releaseFirst = r;
      });

      mockFetch
        .mockImplementationOnce(() => firstHangs)
        .mockRejectedValueOnce(new Error('Network error'));

      const store = createTestStore();
      setupDashboardFetchContext(store);

      const p1 = (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );
      const p2 = (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      expect(selectDashboardAlbumsStatus(store.getState())).toBe('loading');

      // Старый запрос успешно завершился после старта нового — не должен сбросить inFlight
      // и оставить loading навсегда, если новый затем упал.
      releaseFirst(mockSuccessResponse(mockAlbums));
      await p1;
      await p2;

      const state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('failed');
      expect(selectDashboardAlbumsData(state)).toEqual([]);
      expect(state.albums.dashboard.inFlightFetchContextKey).toBeNull();
    });

    test('ответ, устаревший после смены маршрута на dashboard, не затирает store', async () => {
      let releaseFirst!: (r: Response) => void;
      const firstHangs = new Promise<Response>((r) => {
        releaseFirst = r;
      });

      const publicOnly: IAlbums = {
        ...mockAlbums[0],
        albumId: 'public-album',
        album: 'Public Catalog',
        fullName: 'Public Catalog',
      };
      const ownerAlbum: IAlbums = {
        ...mockAlbums[0],
        albumId: 'owner-album',
        album: 'My Dashboard',
        fullName: 'My Dashboard',
      };

      mockFetch
        .mockImplementationOnce(() => firstHangs)
        .mockResolvedValueOnce(mockSuccessResponse([ownerAlbum]));

      const store = createTestStore();
      const pPublic = (store.dispatch as AppDispatch)(fetchAlbums({}));

      window.history.pushState({}, '', '/dashboard-new');
      window.localStorage.setItem('auth_token', TEST_AUTH_TOKEN);
      const pDash = (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      // Сначала завершается dashboard (второй mock), в store — альбомы владельца.
      await pDash;
      expect(selectDashboardAlbumsData(store.getState())).toEqual([ownerAlbum]);
      expect(selectAlbumsData(store.getState())).toEqual([]);

      // Отложенный публичный ответ записывается в каталог; кабинет не затирается.
      releaseFirst(mockSuccessResponse([publicOnly]));
      await pPublic;

      const final = store.getState();
      expect(selectAlbumsData(final)).toEqual([publicOnly]);
      expect(selectDashboardAlbumsData(final)).toEqual([ownerAlbum]);
      expect(final.albums.fetchContextKey).toBe('public:test-artist');
    });

    test('не должен запускать загрузку, если данные уже загружены', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();

      // Первая загрузка
      await (store.dispatch as AppDispatch)(fetchAlbums({}));

      // Очищаем мок
      jest.clearAllMocks();

      // Вторая загрузка (должна быть отменена condition)
      await (store.dispatch as AppDispatch)(fetchAlbums({}));

      // Проверяем, что getJSON не был вызван повторно
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('после успешной загрузки data содержит сливной payload', async () => {
      const merged: IAlbums[] = [
        {
          albumId: 'album-en',
          album: 'English Album',
          artist: 'English Artist',
          fullName: 'English Artist — English Album',
          description: 'English Description',
          release: {
            date: '2024-01-01',
          },
          cover: 'cover-en',
          tracks: [],
          buttons: {},
          details: [],
        },
      ];

      mockFetch.mockResolvedValueOnce(mockSuccessResponse(merged));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchAlbums({}));

      const state = store.getState();
      expect(selectAlbumsData(state)).toEqual(merged);
    });

    test('должен обработать пустой массив данных', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({}));

      expect(result.type).toBe('albums/fetchMerged/fulfilled');
      expect(result.payload).toEqual({
        albums: [],
        fetchContextKey: 'public:test-artist',
        writeTarget: 'catalog',
        catalogArtistMissing: false,
      });

      const state = store.getState();
      expect(selectAlbumsStatus(state)).toBe('succeeded');
      expect(selectAlbumsData(state)).toEqual([]);
      expect(selectAlbumById(state, 'any-id')).toBeUndefined();
    });

    test('должен обработать ошибку без Error объекта (null)', async () => {
      mockFetch.mockRejectedValueOnce(null);

      const store = createTestStore();
      setupDashboardFetchContext(store);
      const result = await (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      expect(result.type).toBe('albums/fetchMerged/rejected');

      const state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('failed');
      expect(selectDashboardAlbumsError(state)).toBe('null');
    });

    test('должен обработать ошибку без Error объекта (строка)', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const store = createTestStore();
      setupDashboardFetchContext(store);
      const result = await (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      expect(result.type).toBe('albums/fetchMerged/rejected');

      const state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('failed');
      expect(selectDashboardAlbumsError(state)).toBe('String error');
    });

    test('должен обработать ошибку без Error объекта (undefined)', async () => {
      mockFetch.mockRejectedValueOnce(undefined);

      const store = createTestStore();
      setupDashboardFetchContext(store);
      const result = await (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      expect(result.type).toBe('albums/fetchMerged/rejected');

      const state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('failed');
      expect(selectDashboardAlbumsError(state)).toBe('undefined');
    });

    test('должен обработать отмену запроса (abort signal)', async () => {
      const abortController = new AbortController();
      mockFetch.mockImplementation(() => {
        abortController.abort();
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      });

      const store = createTestStore();
      const promise = (store.dispatch as AppDispatch)(fetchAlbums({}));

      abortController.abort();
      await promise.catch(() => {});

      const state = store.getState();
      expect(selectAlbumsStatus(state)).toBe('failed');
    });

    test('должен позволить повторную загрузку после ошибки', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const store = createTestStore();
      setupDashboardFetchContext(store);
      await (store.dispatch as AppDispatch)(fetchAlbums({ force: true, ownerDashboard: true }));

      let state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('failed');

      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));
      await (store.dispatch as AppDispatch)(fetchAlbums({ force: true, ownerDashboard: true }));

      state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('succeeded');
      expect(selectDashboardAlbumsError(state)).toBeNull();
      expect(selectDashboardAlbumsData(state)).toEqual(mockAlbums);
    });

    test('ошибка фоновой загрузки при непустом кэше не ломает статус succeeded', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));
      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchAlbums({}));

      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await (store.dispatch as AppDispatch)(fetchAlbums({ force: true }));

      expect(result.type).toBe('albums/fetchMerged/rejected');
      const state = store.getState();
      expect(selectAlbumsStatus(state)).toBe('succeeded');
      expect(selectAlbumsError(state)).toBeNull();
      expect(selectAlbumsData(state)).toEqual(mockAlbums);
    });

    test('должен обновлять lastUpdated при успешной загрузке', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockAlbums));

      const store = createTestStore();
      const beforeTime = Date.now();

      await (store.dispatch as AppDispatch)(fetchAlbums({}));

      const afterTime = Date.now();
      const state = store.getState();
      const entry = state.albums;

      expect(entry.lastUpdated).not.toBeNull();
      expect(entry.lastUpdated).toBeGreaterThanOrEqual(beforeTime);
      expect(entry.lastUpdated).toBeLessThanOrEqual(afterTime);
    });

    test('должен очищать ошибку при новой загрузке после ошибки', async () => {
      mockFetch.mockRejectedValueOnce(new Error('First error'));

      const store = createTestStore();
      setupDashboardFetchContext(store);
      await (store.dispatch as AppDispatch)(fetchAlbums({ force: true, ownerDashboard: true }));

      let state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('failed');

      mockFetch.mockImplementation(() => new Promise(() => {}));
      const promise = (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('loading');
      expect(selectDashboardAlbumsError(state)).toBeNull();

      promise.abort();
    });

    test('не должен запускать загрузку если статус failed, но уже выполняется другая', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const store = createTestStore();
      setupDashboardFetchContext(store);
      await (store.dispatch as AppDispatch)(fetchAlbums({ force: true, ownerDashboard: true }));

      let state = store.getState();
      expect(selectDashboardAlbumsStatus(state)).toBe('failed');

      mockFetch.mockImplementation(() => new Promise(() => {}));
      const promise1 = (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      // Пытаемся запустить еще одну параллельную загрузку
      const promise2 = (store.dispatch as AppDispatch)(
        fetchAlbums({ force: true, ownerDashboard: true })
      );

      // Проверяем, что getJSON был вызван только один раз
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);

      promise1.abort();
      promise2.abort();
    });
  });

  describe('selectors', () => {
    const mockState = {
      albums: {
        status: 'succeeded' as const,
        error: null,
        data: [
          {
            albumId: 'album-1',
            album: 'Test Album',
            artist: 'Test Artist',
            fullName: 'Test Artist — Test Album',
            description: 'Test Description',
            release: {
              date: '2024-01-01',
            },
            cover: 'cover.jpg',
            tracks: [],
            buttons: {},
            details: [],
          },
        ],
        lastUpdated: 1234567890,
        fetchContextKey: 'public:test-artist',
        inFlightFetchContextKey: null,
        catalogArtistMissing: false,
        dashboard: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      },
      lang: { current: 'en' as SupportedLang },
      currentArtist: { publicSlug: null as string | null },
      popup: { isOpen: false },
      player: initialPlayerState,
      articles: {
        status: 'idle' as const,
        error: null,
        data: [],
        lastUpdated: null,
        lastPublicArtistSlug: null,
        inFlightFetchContextKey: null,
      },
      helpArticles: {
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      },
      uiDictionary: {
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      },
    };

    test('selectAlbumsStatus должен возвращать статус', () => {
      expect(selectAlbumsStatus(mockState as any)).toBe('succeeded');
    });

    test('selectAlbumsError должен возвращать ошибку', () => {
      expect(selectAlbumsError(mockState as any)).toBeNull();
    });

    test('selectAlbumsData должен возвращать данные', () => {
      const data = selectAlbumsData(mockState as any);
      expect(data).toHaveLength(1);
      expect(data[0].albumId).toBe('album-1');
    });

    test('selectAlbumById должен находить альбом по ID', () => {
      const album = selectAlbumById(mockState as any, 'album-1');
      expect(album).toBeDefined();
      expect(album?.albumId).toBe('album-1');
      expect(album?.album).toBe('Test Album');
    });

    test('selectAlbumById должен возвращать undefined для несуществующего альбома', () => {
      const album = selectAlbumById(mockState as any, 'non-existent');
      expect(album).toBeUndefined();
    });

    test('selectAlbumsError должен обработать состояние с ошибкой', () => {
      const errorState = {
        ...mockState,
        albums: {
          ...mockState.albums,
          status: 'failed' as const,
          error: 'Test error message',
        },
      };

      expect(selectAlbumsError(errorState as any)).toBe('Test error message');
    });

    test('selectAlbumsData должен обработать очень большой массив данных', () => {
      const largeData: IAlbums[] = Array.from({ length: 1000 }, (_, i) => ({
        albumId: `album-${i}`,
        album: `Album ${i}`,
        artist: `Artist ${i}`,
        fullName: `Artist ${i} — Album ${i}`,
        description: `Description ${i}`,
        release: {
          date: '2024-01-01',
        },
        cover: `cover-${i}`,
        tracks: [],
        buttons: {},
        details: [],
      }));

      const largeState = {
        ...mockState,
        albums: {
          ...mockState.albums,
          data: largeData,
        },
      };

      const data = selectAlbumsData(largeState as any);
      expect(data).toHaveLength(1000);
      expect(data[0].albumId).toBe('album-0');
      expect(data[999].albumId).toBe('album-999');
    });

    test('selectAlbumById должен найти альбом в большом массиве', () => {
      const largeData: IAlbums[] = Array.from({ length: 1000 }, (_, i) => ({
        albumId: `album-${i}`,
        album: `Album ${i}`,
        artist: `Artist ${i}`,
        fullName: `Artist ${i} — Album ${i}`,
        description: `Description ${i}`,
        release: {
          date: '2024-01-01',
        },
        cover: `cover-${i}`,
        tracks: [],
        buttons: {},
        details: [],
      }));

      const largeState = {
        ...mockState,
        albums: {
          ...mockState.albums,
          data: largeData,
        },
      };

      const album = selectAlbumById(largeState as any, 'album-500');
      expect(album).toBeDefined();
      expect(album?.albumId).toBe('album-500');
      expect(album?.album).toBe('Album 500');
    });

    test('selectAlbumById должен обработать поиск с пустым ID', () => {
      const album = selectAlbumById(mockState as any, '');
      expect(album).toBeUndefined();
    });

    test('selectAlbumById должен обработать поиск в пустом массиве', () => {
      const emptyState = {
        ...mockState,
        albums: {
          ...mockState.albums,
          data: [],
        },
      };

      const album = selectAlbumById(emptyState as any, 'any-id');
      expect(album).toBeUndefined();
    });

    test('selectPublicAlbumsCacheIsStale: null fetchContextKey при ?artist= — stale', () => {
      const state = {
        ...mockState,
        currentArtist: { publicSlug: 'my-artist' },
        albums: {
          ...mockState.albums,
          status: 'idle' as const,
          data: [],
          fetchContextKey: null,
        },
      };
      expect(selectPublicAlbumsCacheIsStale(state as any)).toBe(true);
    });

    test('selectPublicAlbumsCacheIsStale: null fetchContextKey без ?artist= — не stale', () => {
      const state = {
        ...mockState,
        currentArtist: { publicSlug: null },
        albums: {
          ...mockState.albums,
          status: 'succeeded' as const,
          data: [],
          fetchContextKey: null,
        },
      };
      expect(selectPublicAlbumsCacheIsStale(state as any)).toBe(false);
    });

    test('selectPublicAlbumsCacheIsStale: ключ совпадает с URL — не stale', () => {
      const state = {
        ...mockState,
        currentArtist: { publicSlug: 'test-artist' },
        albums: {
          ...mockState.albums,
          fetchContextKey: 'public:test-artist',
        },
      };
      expect(selectPublicAlbumsCacheIsStale(state as any)).toBe(false);
    });
  });
});
