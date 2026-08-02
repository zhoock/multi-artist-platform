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

import {
  albumsLoader,
  isAlbumDetailLoaderPath,
  shouldDeferPublicArtistCatalogToSurface,
} from '../albumsLoader';
import { albumsReducer } from '@entities/album';
import { artistAlbumCatalogReducer } from '@entities/album/model/artistAlbumCatalogSlice';
import { albumDetailsReducer } from '@entities/album/model/albumDetailsSlice';
import { articlesReducer } from '@entities/article';
import { helpReducer } from '@entities/help';
import { createEmptyHelpState } from '@entities/help/model/testHelpers';
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
      artistAlbumCatalog: artistAlbumCatalogReducer,
      albumDetails: albumDetailsReducer,
      help: helpReducer,
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

  test('true для списка /albums с ?artist= (thin catalog на surface)', () => {
    expect(shouldDeferPublicArtistCatalogToSurface('/albums', 'foo')).toBe(true);
    expect(shouldDeferPublicArtistCatalogToSurface('/albums/', 'foo')).toBe(true);
  });

  test('true для /stems с ?artist= (thin catalog на Mixer surface)', () => {
    expect(shouldDeferPublicArtistCatalogToSurface('/stems', 'foo')).toBe(true);
    expect(shouldDeferPublicArtistCatalogToSurface('/stems/mix/1', 'foo')).toBe(true);
  });

  test('false для /albums/:id и без slug', () => {
    expect(shouldDeferPublicArtistCatalogToSurface('/albums/23', 'foo')).toBe(false);
    expect(shouldDeferPublicArtistCatalogToSurface('/', '')).toBe(false);
  });
});

describe('isAlbumDetailLoaderPath', () => {
  test('true только для страницы одного альбома', () => {
    expect(isAlbumDetailLoaderPath('/albums/23-remastered')).toBe(true);
    expect(isAlbumDetailLoaderPath('/en/albums/23-remastered')).toBe(true);
    expect(isAlbumDetailLoaderPath('/ru/albums/23-remastered')).toBe(true);
    expect(isAlbumDetailLoaderPath('/albums')).toBe(false);
    expect(isAlbumDetailLoaderPath('/stems')).toBe(false);
  });
});

describe('shouldDeferPublicArtistCatalogToSurface — localized paths', () => {
  test('true для /ru/albums и /en/albums с ?artist=', () => {
    expect(shouldDeferPublicArtistCatalogToSurface('/ru/albums', 'foo')).toBe(true);
    expect(shouldDeferPublicArtistCatalogToSurface('/en/albums', 'foo')).toBe(true);
    expect(shouldDeferPublicArtistCatalogToSurface('/ru', 'foo')).toBe(true);
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

    expect(store.getState().albums.dashboard.status).toBe('idle');
    expect(store.getState().albums.dashboard.inFlightFetchContextKey).toBeNull();
    expect(store.getState().articles.status).toBe('idle');
  });

  test('на /albums?artist= не стартует fat fetchDashboardAlbums (ждёт AllAlbumsPage thin catalog)', async () => {
    const args = makeRequest('/albums?artist=foo');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().albums.dashboard.status).toBe('idle');
    expect(store.getState().albums.dashboard.inFlightFetchContextKey).toBeNull();
  });

  test('на /albums/:id?artist= стартует AlbumDetails, не fat fetchDashboardAlbums', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise(() => {
          /* keep albumDetails in loading */
        }) as Promise<Response>
    );

    const args = makeRequest('/albums/23-remastered?artist=foo');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().albums.dashboard.status).toBe('idle');
    expect(store.getState().albumDetails.status).toBe('loading');
    expect(store.getState().albumDetails.fetchContextKey).toBe('albumDetails:foo:23-remastered');
  });

  test('на /stems?artist= не стартует fat fetchDashboardAlbums (thin catalog на Mixer)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise(() => {
          /* keep thin catalog in loading */
        }) as Promise<Response>
    );

    const args = makeRequest('/stems?artist=foo');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().albums.dashboard.status).toBe('idle');
    expect(store.getState().albums.dashboard.inFlightFetchContextKey).toBeNull();
    expect(store.getState().artistAlbumCatalog.status).toBe('loading');
  });

  test('на /en/albums синхронизирует lang из URL в Redux', async () => {
    expect(store.getState().lang.current).toBe('en');

    const args = makeRequest('/ru/albums?artist=foo');
    await albumsLoader({
      request: args.request,
      params: {},
    } as Parameters<typeof albumsLoader>[0]);

    expect(store.getState().lang.current).toBe('ru');
  });
});
