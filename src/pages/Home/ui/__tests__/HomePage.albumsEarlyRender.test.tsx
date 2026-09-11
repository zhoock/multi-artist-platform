import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@shared/lib/payment/devPaymentMode', () => ({
  logDevPaymentSubscriptionRedirect: jest.fn(),
}));

type ArtistPageBuilderStub = {
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

const artistPageBuilderStub: ArtistPageBuilderStub = {
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
  useArtistPageBuilder: () => artistPageBuilderStub,
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
  useSiteArtistDisplayName: () => ({ displayName: 'Test Artist' }),
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

import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import { articlesReducer } from '@entities/article/model/articlesSlice';
import { albumsReducer } from '@entities/album/model/albumsSlice';
import { artistAlbumCatalogReducer } from '@entities/album/model/artistAlbumCatalogSlice';
import { albumDetailsReducer } from '@entities/album/model/albumDetailsSlice';
import { currentArtistReducer } from '@shared/model/currentArtist';
import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { HomePage } from '../HomePage';

const uiDictionary = {
  menu: {},
  titles: { albums: 'Albums', articles: 'Articles', theBand: 'The Band' },
  buttons: { show: 'Show more' },
};

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
      currentArtist: { publicSlug: 'beatles' },
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
          <MemoryRouter initialEntries={['/?artist=beatles']}>{children}</MemoryRouter>
        </Provider>
      </HelmetProvider>
    );
  }

  return render(<HomePage />, { wrapper: Wrapper });
}

function albumsSkeletonBlock() {
  return document.querySelector('.artist-page-skeleton__main #albums');
}

describe('HomePage — ранний рендер AlbumsSection (LCP обложка)', () => {
  beforeEach(() => {
    Object.assign(artistPageBuilderStub, {
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

  test('монтирует альбомы до pageReady, когда каталог готов', () => {
    artistPageBuilderStub.albumsSurfaceReady = true;

    renderArtistHome();

    expect(screen.getByTestId('albums-section')).toBeInTheDocument();
    // Остальная страница ещё в скелетоне, но альбомы уже реальные.
    expect(document.querySelector('.artist-page-skeleton__main')).toBeInTheDocument();
    expect(albumsSkeletonBlock()).not.toBeInTheDocument();
  });

  test('articles / about / payment gates не блокируют альбомы', () => {
    artistPageBuilderStub.albumsSurfaceReady = true;

    renderArtistHome();

    expect(screen.getByTestId('albums-section')).toBeInTheDocument();
    expect(screen.queryByTestId('articles-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('about-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-bar')).not.toBeInTheDocument();
  });

  test('без готового каталога альбомы остаются скелетоном', () => {
    artistPageBuilderStub.albumsSurfaceReady = false;

    renderArtistHome();

    expect(screen.queryByTestId('albums-section')).not.toBeInTheDocument();
    expect(albumsSkeletonBlock()).toBeInTheDocument();
  });

  test('artist not found не получает раннего публичного рендера', () => {
    artistPageBuilderStub.albumsSurfaceReady = true;
    artistPageBuilderStub.showNotFound = true;

    renderArtistHome();

    expect(screen.queryByTestId('albums-section')).not.toBeInTheDocument();
  });

  test('artist under construction не получает раннего публичного рендера', () => {
    artistPageBuilderStub.albumsSurfaceReady = true;
    artistPageBuilderStub.showVisitorUnderConstruction = true;

    renderArtistHome();

    expect(screen.queryByTestId('albums-section')).not.toBeInTheDocument();
  });

  test('pageReady + reveal рендерит полную страницу без скелетона', async () => {
    artistPageBuilderStub.albumsSurfaceReady = true;
    artistPageBuilderStub.pageReady = true;

    renderArtistHome();

    expect(await screen.findByTestId('articles-section')).toBeInTheDocument();
    expect(screen.getByTestId('albums-section')).toBeInTheDocument();
    expect(screen.getByTestId('about-section')).toBeInTheDocument();
    expect(screen.getByTestId('payment-bar')).toBeInTheDocument();
    expect(document.querySelector('.artist-page-skeleton__main')).not.toBeInTheDocument();
  });
});
