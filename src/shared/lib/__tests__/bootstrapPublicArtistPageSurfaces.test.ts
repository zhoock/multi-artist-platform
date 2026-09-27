import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { artistAlbumCatalogReducer } from '@entities/album/model/artistAlbumCatalogSlice';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import { currentArtistReducer } from '@shared/model/currentArtist';
import {
  bootstrapPublicArtistAlbumCatalog,
  bootstrapPublicArtistArticlesCatalog,
  bootstrapPublicArtistPageSurfaces,
} from '../bootstrapPublicArtistPageSurfaces';

const mockFetchWithAuthSession = jest.fn();

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (...args: unknown[]) => mockFetchWithAuthSession(...args),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => null,
}));

jest.mock('@shared/lib/dashboardModalBackground', () => ({
  shouldUsePublicArtistCatalogInRedux: () => true,
}));

const mockFetchArticles = jest.fn((arg: unknown) => ({
  type: 'articles/fetchMerged/pending',
  meta: { arg },
}));

jest.mock('@entities/article', () => {
  const actual = jest.requireActual<typeof import('@entities/article')>('@entities/article');
  return {
    ...actual,
    fetchArticles: (arg: unknown) => mockFetchArticles(arg),
  };
});

function createStore() {
  return configureStore({
    reducer: {
      artistAlbumCatalog: artistAlbumCatalogReducer,
      articles: articlesReducer,
      currentArtist: currentArtistReducer,
      lang: (state = { current: 'ru' }) => state,
    } as never,
  });
}

describe('bootstrapPublicArtistPageSurfaces (LCP path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithAuthSession.mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0]);
      if (url.includes('/albums')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [
              {
                albumId: 'debut',
                slug: 'debut',
                title: 'Debut',
                cover: 'cover.jpg',
                releaseDate: '2020',
                trackCount: 1,
                duration: 100,
                userId: 'u1',
                isPublished: true,
                isPublic: true,
                hasLockedTracks: false,
                hasStems: false,
              },
            ],
          }),
        };
      }
      if (url.includes('articles-api')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  test('bootstrapPublicArtistPageSurfaces hits catalog API only (no articles)', async () => {
    const store = createStore();
    let articlesCalls = 0;
    mockFetchWithAuthSession.mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0]);
      if (url.includes('articles-api')) {
        articlesCalls += 1;
      }
      if (url.includes('/albums')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    });

    bootstrapPublicArtistPageSurfaces(store.dispatch, 'beatles');
    await new Promise((r) => setTimeout(r, 30));

    expect(
      mockFetchWithAuthSession.mock.calls.some(([url]) => String(url).includes('/albums'))
    ).toBe(true);
    expect(articlesCalls).toBe(0);
  });

  test('repeated album bootstrap does not start a second in-flight catalog fetch', async () => {
    const store = createStore();
    let catalogHttpCalls = 0;
    mockFetchWithAuthSession.mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0]);
      if (url.includes('/albums')) {
        catalogHttpCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    });

    bootstrapPublicArtistAlbumCatalog(store.dispatch, 'beatles');
    bootstrapPublicArtistAlbumCatalog(store.dispatch, 'beatles');

    await new Promise((r) => setTimeout(r, 50));
    expect(catalogHttpCalls).toBe(1);
  });

  test('articles bootstrap dispatches public catalog fetch without force', () => {
    const store = createStore();
    mockFetchArticles.mockClear();

    bootstrapPublicArtistArticlesCatalog(store.dispatch, 'beatles');

    expect(mockFetchArticles).toHaveBeenCalledWith({
      forcePublicCatalog: true,
      publicArtistSlug: 'beatles',
    });
    expect(mockFetchArticles.mock.calls[0]?.[0]).not.toHaveProperty('force', true);
  });
});
