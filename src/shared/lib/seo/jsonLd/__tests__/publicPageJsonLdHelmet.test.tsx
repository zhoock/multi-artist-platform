/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
import { Helmet } from 'react-helmet-async';

import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';

import { helpReducer } from '@entities/help';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import { albumsReducer } from '@entities/album/model/albumsSlice';
import { artistAlbumCatalogReducer } from '@entities/album/model/artistAlbumCatalogSlice';
import { albumDetailsReducer } from '@entities/album/model/albumDetailsSlice';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { platformSeoForLang } from '@shared/constants/platformBranding';
import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { currentArtistReducer } from '@shared/model/currentArtist';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { renderWithProviders } from '@shared/lib/test-utils';
import { ArtistPageSeoHelmet } from '@pages/Home/ui/ArtistPageSeoHelmet';
import { HelpHomePage } from '@pages/Help/ui/HelpHomePage';
import {
  buildAlbumJsonLd,
  buildArticleJsonLd,
  buildPlatformHomeJsonLd,
} from '../buildPublicPageJsonLd';
import { jsonLdScriptText } from '../JsonLdScript';

function readJsonLdScripts(): unknown[] {
  return Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((node) => {
    const text = node.textContent ?? '';
    return JSON.parse(text);
  });
}

describe('public page JSON-LD (Helmet)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  test('home platform graph renders WebSite and Organization', async () => {
    const platform = platformSeoForLang('ru');
    const graphs = buildPlatformHomeJsonLd({
      lang: 'ru',
      siteUrl: 'https://example.com/ru',
      description: platform.description,
    });

    renderWithProviders(
      <Helmet>
        <script type="application/ld+json">{jsonLdScriptText(graphs)}</script>
      </Helmet>
    );

    await waitFor(() => expect(readJsonLdScripts()).toHaveLength(1));
    const graph = readJsonLdScripts()[0] as { '@graph': Array<{ '@type': string }> };
    expect(graph['@graph'].map((node) => node['@type'])).toEqual(['WebSite', 'Organization']);
  });

  test('artist helmet renders MusicGroup with canonical url', async () => {
    renderWithProviders(
      <ArtistPageSeoHelmet
        seo={{
          title: 'Beatles — Site',
          description: 'About the band',
          canonical: 'https://example.com/en?artist=beatles',
          isArtistSpecific: true,
        }}
        hreflang={{
          ru: 'https://example.com/ru?artist=beatles',
          en: 'https://example.com/en?artist=beatles',
          xDefault: 'https://example.com/en?artist=beatles',
        }}
        artistEntityName="Beatles"
      />
    );

    await waitFor(() => expect(readJsonLdScripts()).toHaveLength(1));
    const node = readJsonLdScripts()[0] as { '@type': string; url: string };
    expect(node['@type']).toBe('MusicGroup');
    expect(node.url).toBe('https://example.com/en?artist=beatles');
  });

  test('artist helmet skips JSON-LD on platform fallback', async () => {
    const platform = platformSeoForLang('ru');
    renderWithProviders(
      <ArtistPageSeoHelmet
        seo={{
          title: platform.title,
          description: platform.description,
          canonical: 'https://example.com/ru',
          isArtistSpecific: false,
        }}
        hreflang={{
          ru: 'https://example.com/ru',
          en: 'https://example.com/en',
          xDefault: 'https://example.com/ru',
        }}
        artistEntityName=""
      />
    );

    await waitFor(() => {
      expect(document.querySelector('title')?.textContent).toBe(platform.title);
    });
    expect(readJsonLdScripts()).toHaveLength(0);
  });

  test('album and article JSON-LD parse in Helmet script tags', async () => {
    const albumNode = buildAlbumJsonLd({
      name: 'Rubber Soul',
      url: 'https://example.com/ru/albums/rubber-soul?artist=beatles',
      artist: { name: 'Beatles', url: 'https://example.com/ru?artist=beatles' },
    });
    const articleNode = buildArticleJsonLd({
      headline: 'Studio notes',
      datePublished: '2024-01-01',
      url: 'https://example.com/ru/articles/1?artist=foo',
      author: { name: 'Artist', url: 'https://example.com/ru?artist=foo' },
    });

    renderWithProviders(
      <>
        <Helmet>
          <script type="application/ld+json">{jsonLdScriptText(albumNode)}</script>
        </Helmet>
        <Helmet>
          <script type="application/ld+json">{jsonLdScriptText(articleNode)}</script>
        </Helmet>
      </>
    );

    await waitFor(() => expect(readJsonLdScripts()).toHaveLength(2));
    const types = readJsonLdScripts().map((node) => (node as { '@type': string })['@type']);
    expect(types).toEqual(['MusicAlbum', 'Article']);
  });

  test('help home does not emit JSON-LD in v1 scope', async () => {
    const store = configureStore({
      reducer: {
        player: playerReducer,
        lang: langReducer,
        popup: popupReducer,
        articles: articlesReducer,
        albums: albumsReducer,
        artistAlbumCatalog: artistAlbumCatalogReducer,
        albumDetails: albumDetailsReducer,
        currentArtist: currentArtistReducer,
        uiDictionary: uiDictionaryReducer,
        trackLyrics: trackLyricsReducer,
        help: helpReducer,
      } as never,
      preloadedState: {
        lang: { current: 'ru' as const },
        help: {
          ru: {
            catalog: {
              status: 'succeeded' as const,
              error: null,
              data: { version: 1, categories: [], articles: [] },
              lastUpdated: Date.now(),
            },
            articlesBySlug: {},
          },
          en: {
            catalog: { status: 'idle' as const, error: null, data: null, lastUpdated: null },
            articlesBySlug: {},
          },
        },
      } as never,
    });

    render(
      <HelmetProvider>
        <Provider store={store}>
          <MemoryRouter initialEntries={['/ru/help']}>
            <HelpHomePage />
          </MemoryRouter>
        </Provider>
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(document.querySelector('title')?.textContent).toBe('Справочный центр');
    });
    expect(readJsonLdScripts()).toHaveLength(0);
  });
});
