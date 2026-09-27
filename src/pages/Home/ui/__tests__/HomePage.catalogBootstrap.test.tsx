import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@shared/lib/payment/devPaymentMode', () => ({
  logDevPaymentSubscriptionRedirect: jest.fn(),
}));

const mockFetchArtistAlbumCatalog = jest.fn((arg: unknown) => ({
  type: 'artistAlbumCatalog/fetch/pending',
  meta: { arg },
}));
const mockBootstrapArticles = jest.fn();
const mockScheduleAfterPostPaint = jest.fn((onReady: () => void) => {
  onReady();
  return () => {};
});

jest.mock('@shared/lib/scheduleAfterPostPaint', () => ({
  scheduleAfterPostPaint: (onReady: () => void) => mockScheduleAfterPostPaint(onReady),
}));

jest.mock('@shared/lib/bootstrapPublicArtistPageSurfaces', () => {
  const actual = jest.requireActual<typeof import('@shared/lib/bootstrapPublicArtistPageSurfaces')>(
    '@shared/lib/bootstrapPublicArtistPageSurfaces'
  );
  return {
    ...actual,
    bootstrapPublicArtistArticlesCatalog: (...args: unknown[]) => mockBootstrapArticles(...args),
  };
});

jest.mock('@shared/lib/dashboardModalBackground', () => {
  const actual = jest.requireActual<typeof import('@shared/lib/dashboardModalBackground')>(
    '@shared/lib/dashboardModalBackground'
  );
  return {
    ...actual,
    shouldUsePublicArtistCatalogInRedux: jest.fn(),
  };
});

jest.mock('@entities/album', () => {
  const actual = jest.requireActual<typeof import('@entities/album')>('@entities/album');
  return {
    ...actual,
    fetchArtistAlbumCatalog: (arg: unknown) => mockFetchArtistAlbumCatalog(arg),
    fetchDashboardAlbums: jest.fn(() => ({ type: 'albums/fetchDashboard/pending' })),
  };
});

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => ({
    isOwner: false,
    ownerResolved: true,
    showOnboarding: false,
    showOnboardingSkeleton: false,
    showNotFound: false,
    showVisitorUnderConstruction: false,
    showArtistPageSkeleton: false,
    albumsSurfaceReady: false,
    pageReady: false,
    builderVisibility: { canShowBlocks: false },
    hasPublicReleases: false,
  }),
}));

jest.mock('../AlbumsSection', () => ({
  AlbumsSection: () => null,
}));
jest.mock('../ArticlesSection', () => ({
  ArticlesSection: () => null,
}));
jest.mock('../AboutSection', () => ({
  AboutSection: () => null,
}));
jest.mock('../ArtistPageBuilderPaymentBar', () => ({
  ArtistPageBuilderPaymentBar: () => null,
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

import { render, waitFor } from '@testing-library/react';
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
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';
import { HomePage } from '../HomePage';

const uiDictionary = {
  menu: {},
  titles: { albums: 'Albums', articles: 'Articles', theBand: 'The Band' },
  buttons: { show: 'Show more' },
};

function renderArtistHome(initialEntries = ['/?artist=beatles']) {
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
          <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        </Provider>
      </HelmetProvider>
    );
  }

  render(<HomePage />, { wrapper: Wrapper });
}

describe('HomePage catalog bootstrap under dashboard overlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleAfterPostPaint.mockImplementation((onReady: () => void) => {
      onReady();
      return () => {};
    });
  });

  test('запускает bootstrap каталога сразу и статьи после post-paint (не на LCP path)', async () => {
    jest.mocked(shouldUsePublicArtistCatalogInRedux).mockReturnValue(true);

    renderArtistHome();

    await waitFor(() => {
      expect(mockFetchArtistAlbumCatalog).toHaveBeenCalledWith({
        publicArtistSlug: 'beatles',
      });
      expect(mockScheduleAfterPostPaint).toHaveBeenCalled();
      expect(mockBootstrapArticles).toHaveBeenCalled();
    });

    const catalogOrder = mockFetchArtistAlbumCatalog.mock.invocationCallOrder[0];
    const articlesOrder = mockBootstrapArticles.mock.invocationCallOrder[0];
    expect(catalogOrder).toBeLessThan(articlesOrder);
  });

  test('не запускает bootstrap fetch на полноэкранном dashboard без public overlay', async () => {
    jest.mocked(shouldUsePublicArtistCatalogInRedux).mockReturnValue(false);

    renderArtistHome();

    await waitFor(() => {
      expect(mockFetchArtistAlbumCatalog).not.toHaveBeenCalled();
      expect(mockBootstrapArticles).not.toHaveBeenCalled();
    });
  });

  test('не вызывает articles bootstrap до scheduleAfterPostPaint', async () => {
    jest.mocked(shouldUsePublicArtistCatalogInRedux).mockReturnValue(true);
    mockScheduleAfterPostPaint.mockImplementation(() => () => {});

    renderArtistHome();

    await waitFor(() => {
      expect(mockFetchArtistAlbumCatalog).toHaveBeenCalled();
    });
    expect(mockBootstrapArticles).not.toHaveBeenCalled();
  });
});
