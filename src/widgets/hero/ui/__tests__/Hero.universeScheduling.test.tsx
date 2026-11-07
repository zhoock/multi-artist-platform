import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react';
import { Hero } from '../Hero';
import { renderWithProviders } from '@shared/lib/test-utils';

const navigateMock = jest.fn();
const mockUseArtistPageBuilder = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: (slug: string) => mockUseArtistPageBuilder(slug),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: jest.fn(() => ({
    displayName: 'Beatles',
    isLoading: false,
  })),
}));

jest.mock('@shared/ui/artistPageBuilder', () => {
  const actual = jest.requireActual<typeof import('@shared/ui/artistPageBuilder')>(
    '@shared/ui/artistPageBuilder'
  );
  return {
    ...actual,
    useArtistPageBuilderNav: () => ({
      openDashboard: jest.fn(),
    }),
  };
});

const ensurePublicArtistsLoadedMock = jest.fn(() =>
  Promise.resolve([
    {
      name: 'Beatles',
      publicSlug: 'beatles',
      genreCode: 'rock',
      userId: 'user-1',
      headerImages: ['/api/proxy-image?path=users/u1/hero/cover-1920.jpg'],
    },
  ])
);

jest.mock('@shared/lib/publicArtistsCache', () => ({
  ensurePublicArtistsLoaded: () => ensurePublicArtistsLoadedMock(),
}));

const Universe3DConstructorMock = jest.fn();
const loadUniverse3DModuleMock = jest.fn(() =>
  Promise.resolve({
    Universe3D: class Universe3D {
      constructor(...args: unknown[]) {
        Universe3DConstructorMock(...args);
      }
      destroy() {}
      isArtistCardTarget() {
        return false;
      }
    },
  })
);

jest.mock('@/components/view/loadUniverse3DModule', () => ({
  loadUniverse3DModule: () => loadUniverse3DModuleMock(),
}));

const artistAlbumCatalogState = {
  status: 'idle' as const,
  error: null,
  data: [],
  lastUpdated: null,
  fetchContextKey: null,
  artistMissing: false,
};

const HERO_JPG = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';

describe('Hero Universe3D independent from cover', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    navigateMock.mockReset();
    ensurePublicArtistsLoadedMock.mockClear();
    loadUniverse3DModuleMock.mockClear();
    Universe3DConstructorMock.mockClear();

    mockUseArtistPageBuilder.mockReturnValue({
      builderVisibility: { mode: 'hidden', canShowBlocks: false },
      isLoading: false,
      isOwner: false,
      ownerResolved: true,
      ownerContentLoaded: true,
      ownerStillNeedsOnboarding: false,
      hasPublicReleases: true,
      ownerHasPublicPageContent: true,
      showOnboarding: false,
      showOnboardingSkeleton: false,
      showVisitorUnderConstruction: false,
      showNotFound: false,
      showPublished: true,
      pageReady: true,
      showArtistPageSkeleton: false,
      showArtistPageSurfacePending: false,
      showArtistPageHeroPending: false,
      showArtistPageLayoutPending: false,
      headerImages: [HERO_JPG],
      isHeaderImagesReady: true,
      albumDetailsReleaseGatePending: false,
      catalogReleaseGatePending: false,
      suppressPublishedArtistChrome: false,
      monetizationEnabled: false,
      paymentSurfaceReady: true,
    });

    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queueMicrotask(() => cb(0));
      return 1;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  test('starts Universe3D while hero cover img is still pending', async () => {
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: artistAlbumCatalogState,
      },
    });

    const img = document.querySelector('img.hero__cover-image') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(true);

    await waitFor(() => {
      expect(Universe3DConstructorMock).toHaveBeenCalled();
    });
    expect(loadUniverse3DModuleMock).toHaveBeenCalled();
  });

  test('loads module in parallel with cover attempt', async () => {
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: artistAlbumCatalogState,
      },
    });

    expect(loadUniverse3DModuleMock).toHaveBeenCalled();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
  });

  test('headerImages refresh does not re-init Universe3D for same artist', async () => {
    const builder = {
      builderVisibility: { mode: 'hidden', canShowBlocks: false },
      isLoading: false,
      isOwner: false,
      ownerResolved: true,
      ownerContentLoaded: true,
      ownerStillNeedsOnboarding: false,
      hasPublicReleases: true,
      ownerHasPublicPageContent: true,
      showOnboarding: false,
      showOnboardingSkeleton: false,
      showVisitorUnderConstruction: false,
      showNotFound: false,
      showPublished: true,
      pageReady: true,
      showArtistPageSkeleton: false,
      showArtistPageSurfacePending: false,
      showArtistPageHeroPending: false,
      showArtistPageLayoutPending: false,
      headerImages: [HERO_JPG],
      isHeaderImagesReady: true,
      albumDetailsReleaseGatePending: false,
      catalogReleaseGatePending: false,
      suppressPublishedArtistChrome: false,
      monetizationEnabled: false,
      paymentSurfaceReady: true,
    };
    mockUseArtistPageBuilder.mockImplementation(() => builder);

    const { rerender } = renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: artistAlbumCatalogState,
      },
    });

    await waitFor(() => {
      expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
    });

    builder.headerImages = [`${HERO_JPG}&v=2`];
    mockUseArtistPageBuilder.mockImplementation(() => ({ ...builder }));
    rerender(<Hero />);

    fireEvent.load(document.querySelector('img.hero__cover-image')!);

    await waitFor(() => {
      expect(document.querySelector('.hero__canvas')).toBeTruthy();
    });
    expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
  });
});
