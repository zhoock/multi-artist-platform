/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { render, screen } from '@testing-library/react';

import { articlesReducer } from '@entities/article/model/articlesSlice';
import { albumsReducer } from '@entities/album/model/albumsSlice';
import { artistAlbumCatalogReducer } from '@entities/album/model/artistAlbumCatalogSlice';
import { albumDetailsReducer } from '@entities/album/model/albumDetailsSlice';
import { currentArtistReducer } from '@shared/model/currentArtist';
import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import {
  expectNoindexRobotsMeta,
  expectNoRobotsMeta,
} from '@shared/lib/seo/__tests__/helmetRobotsTestUtils';
import { HomePage } from '../HomePage';

jest.mock('@shared/lib/payment/devPaymentMode', () => ({
  logDevPaymentSubscriptionRedirect: jest.fn(),
}));

jest.mock('@shared/lib/publicSiteOrigin', () => ({
  buildPublicSiteUrl: (path: string) => `https://example.com${path}`,
  getPublicSiteOrigin: () => 'https://example.com',
}));

type BuilderStub = {
  isOwner: boolean;
  ownerResolved: boolean;
  showOnboarding: boolean;
  showOnboardingSkeleton: boolean;
  showNotFound: boolean;
  showVisitorUnderConstruction: boolean;
  showArtistPageSkeleton: boolean;
  builderVisibility: { canShowBlocks: boolean };
  hasPublicReleases: boolean;
  pageReady: boolean;
  albumsSurfaceReady: boolean;
};

const builderStub: BuilderStub = {
  isOwner: false,
  ownerResolved: true,
  showOnboarding: false,
  showOnboardingSkeleton: false,
  showNotFound: false,
  showVisitorUnderConstruction: false,
  showArtistPageSkeleton: false,
  builderVisibility: { canShowBlocks: false },
  hasPublicReleases: true,
  pageReady: false,
  albumsSurfaceReady: false,
};

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => builderStub,
}));

jest.mock('../AlbumsSection', () => ({
  AlbumsSection: () => <div data-testid="albums-section" />,
}));
jest.mock('../ArticlesSection', () => ({
  ArticlesSection: () => <div data-testid="articles-section" />,
}));
jest.mock('../AboutSection', () => ({
  AboutSection: () => <div data-testid="about-section" />,
}));
jest.mock('../ArtistPageBuilderPaymentBar', () => ({
  ArtistPageBuilderPaymentBar: () => <div data-testid="payment-bar" />,
}));

jest.mock('@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted', () => ({
  useRedirectHomeAfterOwnAccountDeleted: () => false,
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({ displayName: 'Draft Artist', isLoading: false }),
}));

jest.mock('@shared/lib/publicArtistUserProfile', () => ({
  fetchPublicArtistUserProfile: jest.fn(async () => null),
}));

jest.mock('@shared/ui/serviceScreen/ServiceScene', () => ({
  ServiceScene: () => null,
}));

jest.mock('@/components/view/loadUniverse3DModule', () => ({
  loadUniverse3DModule: jest.fn(() =>
    Promise.resolve({
      Universe3D: class Universe3D {
        destroy() {}
        setSearchHighlight() {}
        navigateToArtistFromSearch() {}
        focusOnArtist() {}
      },
    })
  ),
}));

jest.mock('@/components/view/Universe3D', () => ({
  Universe3D: class Universe3D {
    destroy() {}
  },
  UNIVERSE_FOCUS_ARTIST_STORAGE_KEY: 'universe-focus-artist',
}));

const uiDictionary = {
  menu: {},
  titles: { albums: 'Albums', articles: 'Articles', theBand: 'The Band' },
  buttons: { show: 'Show more' },
  artistPageUnderConstruction: {
    title: 'Page is under construction',
    visitorSubtitle: 'No public releases yet.',
    visitorCta: 'Back to the galaxy',
  },
};

function readArtistCanonical(): string | null {
  const links = Array.from(document.querySelectorAll('link[rel="canonical"]'));
  const match = links.find((link) => link.getAttribute('href')?.includes('artist='));
  return match?.getAttribute('href') ?? null;
}

function readArtistHreflangCount(): number {
  return Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).filter((link) =>
    link.getAttribute('href')?.includes('artist=')
  ).length;
}

function readJsonLdScripts(): string[] {
  return Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
    (node) => node.textContent ?? ''
  );
}

function renderArtistHome() {
  const store = configureStore({
    reducer: {
      lang: langReducer,
      articles: articlesReducer,
      albums: albumsReducer,
      artistAlbumCatalog: artistAlbumCatalogReducer,
      albumDetails: albumDetailsReducer,
      currentArtist: currentArtistReducer,
      uiDictionary: uiDictionaryReducer,
      player: playerReducer,
      popup: popupReducer,
    } as never,
    preloadedState: {
      lang: { current: 'en' },
      currentArtist: { publicSlug: 'draft-artist' },
      uiDictionary: {
        en: {
          status: 'succeeded',
          error: null,
          data: [uiDictionary],
          lastUpdated: Date.now(),
        },
        ru: { status: 'idle', error: null, data: [], lastUpdated: null },
      },
      popup: { isOpen: false },
    } as never,
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>
          <MemoryRouter initialEntries={['/?artist=draft-artist']}>{children}</MemoryRouter>
        </Provider>
      </HelmetProvider>
    );
  }

  return render(<HomePage />, { wrapper: Wrapper });
}

describe('HomePage — visitor under-construction SEO', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    Object.assign(builderStub, {
      isOwner: false,
      ownerResolved: true,
      showOnboarding: false,
      showOnboardingSkeleton: false,
      showNotFound: false,
      showVisitorUnderConstruction: false,
      showArtistPageSkeleton: false,
      builderVisibility: { canShowBlocks: false },
      hasPublicReleases: true,
      pageReady: false,
      albumsSurfaceReady: false,
    });
  });

  test('emits noindex and omits artist-specific canonical, hreflang, and JSON-LD', async () => {
    builderStub.showVisitorUnderConstruction = true;

    renderArtistHome();

    expect(
      await screen.findByRole('heading', { name: 'Page is under construction' })
    ).toBeInTheDocument();

    await expectNoindexRobotsMeta();

    await waitFor(() => {
      expect(readArtistCanonical()).toBeNull();
      expect(readArtistHreflangCount()).toBe(0);
      expect(readJsonLdScripts()).toHaveLength(0);
    });
  });

  test('published artist still emits artist canonical and remains indexable', async () => {
    builderStub.showVisitorUnderConstruction = false;
    builderStub.albumsSurfaceReady = true;
    builderStub.pageReady = true;

    renderArtistHome();

    expect(await screen.findByTestId('albums-section')).toBeInTheDocument();

    await waitFor(() => {
      expect(readArtistCanonical()).toBe('https://example.com/en?artist=draft-artist');
    });

    await expectNoRobotsMeta();
  });
});
