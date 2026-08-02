import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { fetchArticles, articlesReducer, type FetchArticlesResult } from '../articlesSlice';
import {
  selectArticlesStatus,
  selectArticlesError,
  selectArticlesData,
  selectArticleById,
  selectDashboardArticlesData,
  selectDashboardArticlesStatus,
} from '../selectors';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { IArticles } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { AppDispatch } from '@shared/model/appStore/types';
import * as publicArtistContext from '@shared/lib/publicArtistContext';
import { syncDashboardAlbumsPublicCatalogOverlay } from '@shared/lib/dashboardModalBackground';
import { currentArtistReducer, setPublicArtistSlug } from '@shared/model/currentArtist';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';
import { createEmptyHelpState } from '@entities/help/model/testHelpers';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
const mockSuccessResponse = (data: unknown) =>
  ({
    ok: true,
    json: async () => ({ success: true, data }),
  }) as Response;

const createTestStore = () => {
  const store = configureStore({
    reducer: {
      articles: articlesReducer,
      currentArtist: currentArtistReducer,
      lang: () => ({ current: 'en' as SupportedLang }),
      popup: () => ({ isOpen: false }),
      player: () => initialPlayerState,
      albums: () => createAlbumsTestState(),
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
      help: () => createEmptyHelpState(),
      uiDictionary: () => ({
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      }),
      trackLyrics: trackLyricsReducer,
    },
  });
  store.dispatch(setPublicArtistSlug('test-artist'));
  return store;
};

describe('articlesSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    syncDashboardAlbumsPublicCatalogOverlay(false);
    window.history.pushState({}, '', '/');
  });

  describe('reducer', () => {
    test('должен возвращать начальное состояние', () => {
      const state = articlesReducer(undefined, { type: 'unknown' });
      expect(state).toEqual({
        status: 'idle',
        error: null,
        data: [],
        lastUpdated: null,
        lastPublicArtistSlug: null,
        inFlightFetchContextKey: null,
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

  describe('fetchArticles thunk', () => {
    const mockArticles: IArticles[] = [
      {
        articleId: 'article-1',
        nameArticle: 'Test Article',
        description: 'Test Description',
        date: '2024-01-01',
        img: 'test-article.jpg',
        details: [],
      },
    ];

    test('должен успешно загрузить статьи', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockArticles));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(result.type).toBe('articles/fetchMerged/fulfilled');
      expect((result.payload as FetchArticlesResult).articles).toMatchObject(mockArticles);

      const state = store.getState();
      expect(selectArticlesStatus(state)).toBe('succeeded');
      expect(selectArticlesError(state)).toBeNull();
      expect(selectArticlesData(state)).toMatchObject(mockArticles);
      expect(selectArticlesData(state)[0].articleId).toBe('article-1');
    });

    test('должен обработать ошибку загрузки', async () => {
      const errorMessage = 'Network error';
      mockFetch.mockRejectedValueOnce(new Error(errorMessage));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(result.type).toBe('articles/fetchMerged/rejected');

      const state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');
      expect(selectArticlesError(state)).toBe(errorMessage);
      expect(selectArticlesData(state)).toEqual([]);
    });

    test('в /dashboard при ошибке API не запрашивает статический articles-*.json', async () => {
      const dashSpy = jest.spyOn(publicArtistContext, 'isDashboardPathname').mockReturnValue(true);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchArticles({ force: true }));

      dashSpy.mockRestore();

      expect(result.type).toBe('articles/fetchMerged/rejected');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(String(mockFetch.mock.calls[0][0])).toContain('articles-api');

      const state = store.getState();
      expect(state.articles.dashboard.status).toBe('failed');
      expect(selectArticlesStatus(state)).toBe('idle');
    });

    test('forcePublicCatalog на полноэкранном dashboard пишет в публичный каталог с явным slug', async () => {
      window.history.pushState({}, '', '/dashboard/posts');
      syncDashboardAlbumsPublicCatalogOverlay(false);
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockArticles));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(
        fetchArticles({
          force: true,
          forcePublicCatalog: true,
          publicArtistSlug: 'test-artist',
        })
      );

      expect(result.type).toBe('articles/fetchMerged/fulfilled');
      expect(result.payload).toMatchObject({
        articles: mockArticles,
        lastPublicArtistSlug: 'test-artist',
        writeTarget: 'catalog',
      });
      expect(selectArticlesData(store.getState())).toMatchObject(mockArticles);
      expect(selectDashboardArticlesData(store.getState())).toEqual([]);
      expect(String(mockFetch.mock.calls[0][0])).toContain('artist=test-artist');
    });

    test('на главной без artist не парсит HTML fallback как JSON', async () => {
      const store = createTestStore();
      store.dispatch(setPublicArtistSlug(null));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        json: jest.fn(async () => {
          throw new SyntaxError('Unexpected token <');
        }),
      } as unknown as Response);

      const result = await (store.dispatch as AppDispatch)(
        fetchArticles({ force: true, publicArtistSlug: '' })
      );

      expect(result.type).toBe('articles/fetchMerged/fulfilled');
      expect((result.payload as FetchArticlesResult).articles).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith('/assets/articles-en.json', expect.any(Object));
    });

    test('forcePublicCatalog не инвалидирует завершение ownerDashboard force fetch', async () => {
      const dashSpy = jest.spyOn(publicArtistContext, 'isDashboardPathname').mockReturnValue(true);
      window.history.pushState({}, '', '/dashboard/posts');
      syncDashboardAlbumsPublicCatalogOverlay(false);

      const dashboardArticles: IArticles[] = [{ ...mockArticles[0], articleId: 'dash-article' }];
      const catalogArticles: IArticles[] = [{ ...mockArticles[0], articleId: 'catalog-article' }];

      let resolveDashboard!: (value: Response) => void;
      let resolveCatalog!: (value: Response) => void;
      const dashboardDeferred = new Promise<Response>((resolve) => {
        resolveDashboard = resolve;
      });
      const catalogDeferred = new Promise<Response>((resolve) => {
        resolveCatalog = resolve;
      });

      mockFetch
        .mockImplementationOnce(() => dashboardDeferred)
        .mockImplementationOnce(() => catalogDeferred);

      const store = createTestStore();
      const dashboardPromise = (store.dispatch as AppDispatch)(
        fetchArticles({ force: true, ownerDashboard: true })
      );
      const catalogPromise = (store.dispatch as AppDispatch)(
        fetchArticles({
          force: true,
          forcePublicCatalog: true,
          publicArtistSlug: 'test-artist',
        })
      );

      expect(selectDashboardArticlesStatus(store.getState())).toBe('loading');

      resolveCatalog!(mockSuccessResponse(catalogArticles));
      await catalogPromise;

      expect(selectArticlesData(store.getState())[0]?.articleId).toBe('catalog-article');
      expect(selectDashboardArticlesStatus(store.getState())).toBe('loading');

      resolveDashboard!(mockSuccessResponse(dashboardArticles));
      await dashboardPromise;

      expect(selectDashboardArticlesData(store.getState())[0]?.articleId).toBe('dash-article');
      expect(selectDashboardArticlesStatus(store.getState())).toBe('succeeded');

      dashSpy.mockRestore();
    });

    test('устаревший force fulfill не оставляет dashboard.status=loading при пустом data', async () => {
      const dashSpy = jest.spyOn(publicArtistContext, 'isDashboardPathname').mockReturnValue(true);
      window.history.pushState({}, '', '/dashboard/posts');
      syncDashboardAlbumsPublicCatalogOverlay(false);

      let releaseFirst!: (r: Response) => void;
      const firstHangs = new Promise<Response>((r) => {
        releaseFirst = r;
      });

      mockFetch
        .mockImplementationOnce(() => firstHangs)
        .mockRejectedValueOnce(new Error('Network error'));

      const store = createTestStore();
      const p1 = (store.dispatch as AppDispatch)(
        fetchArticles({ force: true, ownerDashboard: true })
      );
      const p2 = (store.dispatch as AppDispatch)(
        fetchArticles({ force: true, ownerDashboard: true })
      );

      expect(selectDashboardArticlesStatus(store.getState())).toBe('loading');

      releaseFirst(mockSuccessResponse(mockArticles));
      await p1;
      await p2;

      const state = store.getState();
      expect(selectDashboardArticlesStatus(state)).toBe('failed');
      expect(selectDashboardArticlesData(state)).toEqual([]);
      expect(state.articles.dashboard.inFlightFetchContextKey).toBeNull();

      dashSpy.mockRestore();
    });

    test('должен установить статус loading при начале загрузки', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const store = createTestStore();
      const promise = (store.dispatch as AppDispatch)(fetchArticles({}));

      const loadingState = store.getState();
      expect(selectArticlesStatus(loadingState)).toBe('loading');
      expect(selectArticlesError(loadingState)).toBeNull();

      promise.abort();
    });

    test('не должен запускать загрузку, если данные уже загружаются', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const store = createTestStore();

      const promise1 = (store.dispatch as AppDispatch)(fetchArticles({}));
      const promise2 = (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(selectArticlesStatus(store.getState())).toBe('loading');

      promise1.abort();
      promise2.abort();
    });

    test('не должен запускать загрузку, если данные уже загружены', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockArticles));

      const store = createTestStore();

      await (store.dispatch as AppDispatch)(fetchArticles({}));

      jest.clearAllMocks();

      await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('повторная загрузка с force обновляет данные', async () => {
      const batch1: IArticles[] = [{ ...mockArticles[0], articleId: 'a1' }];
      const batch2: IArticles[] = [{ ...mockArticles[0], articleId: 'a2' }];

      mockFetch
        .mockResolvedValueOnce(mockSuccessResponse(batch1))
        .mockResolvedValueOnce(mockSuccessResponse(batch2));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchArticles({}));
      await (store.dispatch as AppDispatch)(fetchArticles({ force: true }));

      const state = store.getState();
      expect(selectArticlesData(state)[0].articleId).toBe('a2');
    });

    test('force refetch после succeeded с пустым data не переводит status в loading (SWR)', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse([])).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockSuccessResponse(mockArticles)), 50);
          })
      );

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(selectArticlesStatus(store.getState())).toBe('succeeded');
      expect(selectArticlesData(store.getState())).toEqual([]);

      const forcePromise = (store.dispatch as AppDispatch)(fetchArticles({ force: true }));

      expect(selectArticlesStatus(store.getState())).toBe('succeeded');

      await forcePromise;

      expect(selectArticlesStatus(store.getState())).toBe('succeeded');
      expect(selectArticlesData(store.getState()).length).toBeGreaterThan(0);
    });

    test('должен обработать пустой массив данных', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse([]));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(result.type).toBe('articles/fetchMerged/fulfilled');
      expect((result.payload as FetchArticlesResult).articles).toEqual([]);

      const state = store.getState();
      expect(selectArticlesStatus(state)).toBe('succeeded');
      expect(selectArticlesData(state)).toEqual([]);
      expect(selectArticleById(state, 'any-id')).toBeUndefined();
    });

    test('должен обработать ошибку без Error объекта (null)', async () => {
      mockFetch.mockRejectedValueOnce(null);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(result.type).toBe('articles/fetchMerged/rejected');

      const state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');
      expect(selectArticlesError(state)).toBe('Unknown error');
    });

    test('должен обработать ошибку без Error объекта (строка)', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(result.type).toBe('articles/fetchMerged/rejected');

      const state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');
      expect(selectArticlesError(state)).toBe('Unknown error');
    });

    test('должен обработать ошибку без Error объекта (undefined)', async () => {
      mockFetch.mockRejectedValueOnce(undefined);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(result.type).toBe('articles/fetchMerged/rejected');

      const state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');
      expect(selectArticlesError(state)).toBe('Unknown error');
    });

    test('должен обработать отмену запроса (abort signal)', async () => {
      const abortController = new AbortController();
      mockFetch.mockImplementation(() => {
        abortController.abort();
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      });

      const store = createTestStore();
      const promise = (store.dispatch as AppDispatch)(fetchArticles({}));

      abortController.abort();
      await promise.catch(() => {});

      const state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');
    });

    test('должен позволить повторную загрузку после ошибки', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchArticles({}));

      let state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');
      expect(selectArticlesError(state)).toBe('Network error');

      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockArticles));
      await (store.dispatch as AppDispatch)(fetchArticles({}));

      state = store.getState();
      expect(selectArticlesStatus(state)).toBe('succeeded');
      expect(selectArticlesError(state)).toBeNull();
      expect(selectArticlesData(state)).toMatchObject(mockArticles);
    });

    test('должен обновлять lastUpdated при успешной загрузке', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse(mockArticles));

      const store = createTestStore();
      const beforeTime = Date.now();

      await (store.dispatch as AppDispatch)(fetchArticles({}));

      const afterTime = Date.now();
      const entry = store.getState().articles;

      expect(entry.lastUpdated).not.toBeNull();
      expect(entry.lastUpdated).toBeGreaterThanOrEqual(beforeTime);
      expect(entry.lastUpdated).toBeLessThanOrEqual(afterTime);
    });

    test('должен очищать ошибку при новой загрузке после ошибки', async () => {
      mockFetch.mockRejectedValueOnce(new Error('First error'));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchArticles({}));

      let state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');
      expect(selectArticlesError(state)).toBe('First error');

      mockFetch.mockImplementation(() => new Promise(() => {}));
      const promise = (store.dispatch as AppDispatch)(fetchArticles({}));

      state = store.getState();
      expect(selectArticlesStatus(state)).toBe('loading');
      expect(selectArticlesError(state)).toBeNull();

      promise.abort();
    });

    test('не должен запускать загрузку если статус failed, но уже выполняется другая', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchArticles({}));

      let state = store.getState();
      expect(selectArticlesStatus(state)).toBe('failed');

      mockFetch.mockImplementation(() => new Promise(() => {}));
      const promise1 = (store.dispatch as AppDispatch)(fetchArticles({}));
      const promise2 = (store.dispatch as AppDispatch)(fetchArticles({}));

      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);

      promise1.abort();
      promise2.abort();
    });
  });

  describe('selectors', () => {
    const mockState = {
      articles: {
        status: 'succeeded' as const,
        error: null,
        data: [
          {
            articleId: 'article-1',
            nameArticle: 'Test Article',
            description: 'Test Description',
            date: '2024-01-01',
            img: 'test-article.jpg',
            details: [],
          },
        ],
        lastUpdated: 1234567890,
        lastPublicArtistSlug: null,
        inFlightFetchContextKey: null,
        dashboard: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      },
      currentArtist: { publicSlug: null as string | null },
      lang: { current: 'en' as SupportedLang },
      popup: { isOpen: false },
      player: initialPlayerState,
      albums: createAlbumsTestState(),
      help: createEmptyHelpState(),
      uiDictionary: {
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      },
    };

    test('selectArticlesStatus должен возвращать статус', () => {
      expect(selectArticlesStatus(mockState as any)).toBe('succeeded');
    });

    test('selectArticlesError должен возвращать ошибку', () => {
      expect(selectArticlesError(mockState as any)).toBeNull();
    });

    test('selectArticlesData должен возвращать данные', () => {
      const data = selectArticlesData(mockState as any);
      expect(data).toHaveLength(1);
      expect(data[0].articleId).toBe('article-1');
    });

    test('selectArticleById должен находить статью по ID', () => {
      const article = selectArticleById(mockState as any, 'article-1');
      expect(article).toBeDefined();
      expect(article?.articleId).toBe('article-1');
      expect(article?.nameArticle).toBe('Test Article');
    });

    test('selectArticleById должен возвращать undefined для несуществующей статьи', () => {
      const article = selectArticleById(mockState as any, 'non-existent');
      expect(article).toBeUndefined();
    });

    test('selectArticlesError должен обработать состояние с ошибкой', () => {
      const errorState = {
        ...mockState,
        articles: {
          ...mockState.articles,
          status: 'failed' as const,
          error: 'Test error message',
        },
      };

      expect(selectArticlesError(errorState as any)).toBe('Test error message');
    });

    test('selectArticlesData должен обработать очень большой массив данных', () => {
      const largeData: IArticles[] = Array.from({ length: 1000 }, (_, i) => ({
        articleId: `article-${i}`,
        nameArticle: `Article ${i}`,
        description: `Description ${i}`,
        date: '2024-01-01',
        img: `img-${i}.jpg`,
        details: [],
      }));

      const largeState = {
        ...mockState,
        articles: {
          ...mockState.articles,
          data: largeData,
        },
      };

      const data = selectArticlesData(largeState as any);
      expect(data).toHaveLength(1000);
      expect(data[0].articleId).toBe('article-0');
      expect(data[999].articleId).toBe('article-999');
    });

    test('selectArticleById должен найти статью в большом массиве', () => {
      const largeData: IArticles[] = Array.from({ length: 1000 }, (_, i) => ({
        articleId: `article-${i}`,
        nameArticle: `Article ${i}`,
        description: `Description ${i}`,
        date: '2024-01-01',
        img: `img-${i}.jpg`,
        details: [],
      }));

      const largeState = {
        ...mockState,
        articles: {
          ...mockState.articles,
          data: largeData,
        },
      };

      const article = selectArticleById(largeState as any, 'article-500');
      expect(article).toBeDefined();
      expect(article?.articleId).toBe('article-500');
      expect(article?.nameArticle).toBe('Article 500');
    });

    test('selectArticleById должен обработать поиск с пустым ID', () => {
      const article = selectArticleById(mockState as any, '');
      expect(article).toBeUndefined();
    });

    test('selectArticleById должен обработать поиск в пустом массиве', () => {
      const emptyState = {
        ...mockState,
        articles: {
          ...mockState.articles,
          data: [],
        },
      };

      const article = selectArticleById(emptyState as any, 'any-id');
      expect(article).toBeUndefined();
    });
  });
});
