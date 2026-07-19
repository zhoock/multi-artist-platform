/**
 * Regression: при открытии auth-оверлея (/auth*) loader НЕ должен трогать
 * `currentArtist.publicSlug`. Иначе при закрытии модалки underlying-страница
 * мигает skeleton'ом, потому что cache альбомов помечается stale.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('@shared/lib/publicArtistsCache', () => ({
  prefetchPublicArtists: jest.fn(),
}));
jest.mock('@shared/lib/profileDisplayName', () => ({
  prefetchPublicProfileForDisplay: jest.fn(),
}));

import { albumsLoader, shouldDeferPublicArtistCatalogToSurface } from '../albumsLoader';
import { albumsReducer } from '@entities/album';
import { articlesReducer } from '@entities/article';
import { helpArticlesReducer } from '@entities/helpArticle';
import { uiDictionaryReducer } from '@shared/model/uiDictionary';
import { langReducer } from '@shared/model/lang';
import { currentArtistReducer, setPublicArtistSlug } from '@shared/model/currentArtist';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { popupReducer } from '@features/popupToggle';
import { playerReducer } from '@features/player';

import * as appStore from '@shared/model/appStore';
import type { AppStore } from '@shared/model/appStore/types';

function createTestStore(): AppStore {
  return configureStore({
    reducer: {
      popup: popupReducer,
      player: playerReducer,
      lang: langReducer,
      currentArtist: currentArtistReducer,
      articles: articlesReducer,
      albums: albumsReducer,
      helpArticles: helpArticlesReducer,
      uiDictionary: uiDictionaryReducer,
      trackLyrics: trackLyricsReducer,
    },
  }) as unknown as AppStore;
}

function makeRequest(url: string): { request: { url: string; signal: AbortSignal } } {
  const controller = new AbortController();
  return {
    request: { url: `http://localhost${url}`, signal: controller.signal },
  };
}

describe('shouldDeferPublicArtistCatalogToSurface', () => {
  test('true для главной с ?artist=', () => {
    expect(shouldDeferPublicArtistCatalogToSurface('/', 'foo')).toBe(true);
  });

  test('false для /albums и без slug', () => {
    expect(shouldDeferPublicArtistCatalogToSurface('/albums', 'foo')).toBe(false);
    expect(shouldDeferPublicArtistCatalogToSurface('/', '')).toBe(false);
  });
});

describe('albumsLoader — auth overlay', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    // UI-словарик уже загружен — иначе loader попытается дёрнуть thunk, который полезет в сеть.
    store.dispatch({
      type: 'uiDictionary/fetch/fulfilled',
      payload: [{ menu: {}, titles: {}, buttons: {} }],
      meta: { arg: { lang: 'en' }, requestId: 'test', requestStatus: 'fulfilled' },
    });
    jest.spyOn(appStore, 'getStore').mockReturnValue(store);
  });

  test('на /auth НЕ сбрасывает publicSlug, выставленный underlying-страницей', async () => {
    store.dispatch(setPublicArtistSlug('smolyanoe-chuchelko'));
    expect(store.getState().currentArtist.publicSlug).toBe('smolyanoe-chuchelko');

    const args = makeRequest('/auth?mode=register&returnTo=%2F%3Fartist%3Dsmolyanoe-chuchelko');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().currentArtist.publicSlug).toBe('smolyanoe-chuchelko');
  });

  test('на /auth/reset-password НЕ сбрасывает publicSlug', async () => {
    store.dispatch(setPublicArtistSlug('smolyanoe-chuchelko'));

    const args = makeRequest('/auth/reset-password?token=abc');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().currentArtist.publicSlug).toBe('smolyanoe-chuchelko');
  });

  test('на корне `/?artist=foo` всё ещё проставляет publicSlug', async () => {
    expect(store.getState().currentArtist.publicSlug).toBeNull();

    const args = makeRequest('/?artist=foo');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().currentArtist.publicSlug).toBe('foo');
  });
});

describe('albumsLoader — defer public catalog to HomePage', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    store.dispatch({
      type: 'uiDictionary/fetch/fulfilled',
      payload: [{ menu: {}, titles: {}, buttons: {} }],
      meta: { arg: { lang: 'en' }, requestId: 'test', requestStatus: 'fulfilled' },
    });
    jest.spyOn(appStore, 'getStore').mockReturnValue(store);
  });

  test('на /?artist= не стартует загрузку каталога (ждёт HomePage)', async () => {
    const args = makeRequest('/?artist=foo');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().albums.status).toBe('idle');
    expect(store.getState().albums.inFlightFetchContextKey).toBeNull();
    expect(store.getState().articles.status).toBe('idle');
  });

  test('на /albums?artist= стартует fetchAlbums (не defer)', async () => {
    const args = makeRequest('/albums?artist=foo');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().albums.status).toBe('loading');
  });
});
