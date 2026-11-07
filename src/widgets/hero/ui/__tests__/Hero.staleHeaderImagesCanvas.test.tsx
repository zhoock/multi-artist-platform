import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
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
    displayName: 'Stale URLs Artist',
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

jest.mock('@shared/lib/publicArtistsCache', () => ({
  ensurePublicArtistsLoaded: jest.fn(() =>
    Promise.resolve([
      {
        name: 'Stale URLs Artist',
        publicSlug: 'stale-hero',
        genreCode: 'rock',
        userId: 'user-1',
      },
    ])
  ),
}));

const Universe3DConstructorMock = jest.fn();
jest.mock('@/components/view/loadUniverse3DModule', () => ({
  loadUniverse3DModule: jest.fn(() =>
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
  ),
}));

const artistAlbumCatalogState = {
  status: 'idle' as const,
  error: null,
  data: [],
  lastUpdated: null,
  fetchContextKey: null,
  artistMissing: false,
};

const DELETED_A = '/api/proxy-image?path=users/u1/hero/deleted-a-1920.jpg';
const DELETED_B = '/api/proxy-image?path=users/u1/hero/deleted-b-1920.jpg';

function mockArtistHeaderImages(images: string[]) {
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
    headerImages: images,
    isHeaderImagesReady: true,
    albumDetailsReleaseGatePending: false,
    catalogReleaseGatePending: false,
    suppressPublishedArtistChrome: false,
    monetizationEnabled: false,
    paymentSurfaceReady: true,
  });
}

describe('Hero canvas with stale header_images URLs', () => {
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

    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queueMicrotask(() => cb(0));
      return 1;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    navigateMock.mockReset();
    Universe3DConstructorMock.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('empty header_images — Universe3D without cover', async () => {
    mockArtistHeaderImages([]);
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=stale-hero'],
      preloadedState: {
        lang: { current: 'ru' },
        currentArtist: { publicSlug: 'stale-hero' },
        artistAlbumCatalog: artistAlbumCatalogState,
      },
    });
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
  });

  test('stale URLs — Universe3D on mount, not after img errors', async () => {
    mockArtistHeaderImages([DELETED_A, DELETED_B]);
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=stale-hero'],
      preloadedState: {
        lang: { current: 'ru' },
        currentArtist: { publicSlug: 'stale-hero' },
        artistAlbumCatalog: artistAlbumCatalogState,
      },
    });

    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1));

    fireEvent.error(document.querySelector('img.hero__cover-image')!);
    fireEvent.error(document.querySelector('img.hero__cover-image')!);

    expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
  });
});
