import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
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

const loadUniverse3DModuleMock = jest.fn(() =>
  Promise.resolve({
    Universe3D: class Universe3D {
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

describe('Hero Universe3D scheduling after cover paint', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    ensurePublicArtistsLoadedMock.mockClear();
    loadUniverse3DModuleMock.mockClear();

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

    if (typeof HTMLImageElement.prototype.decode !== 'function') {
      Object.defineProperty(HTMLImageElement.prototype, 'decode', {
        configurable: true,
        value: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      });
    } else {
      jest.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue(undefined);
    }
  });

  test('does not load Universe3D module before hero cover img completes load+decode paint chain', async () => {
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

    expect(loadUniverse3DModuleMock).not.toHaveBeenCalled();

    Object.defineProperty(img!, 'complete', { configurable: true, value: true });
    Object.defineProperty(img!, 'naturalWidth', { configurable: true, value: 1920 });
    img!.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(loadUniverse3DModuleMock).toHaveBeenCalled();
    });
  });
});
