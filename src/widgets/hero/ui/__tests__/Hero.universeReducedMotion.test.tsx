import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, waitFor } from '@testing-library/react';
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

jest.mock('@shared/lib/publicArtistsCache', () => ({
  ensurePublicArtistsLoaded: () =>
    Promise.resolve([
      {
        name: 'Beatles',
        publicSlug: 'beatles',
        genreCode: 'rock',
        userId: 'user-1',
        headerImages: ['/api/proxy-image?path=users/u1/hero/cover-1920.jpg'],
      },
    ]),
}));

const universeDestroyMock = jest.fn();
const Universe3DConstructorMock = jest.fn();

const loadUniverse3DModuleMock = jest.fn(() =>
  Promise.resolve({
    Universe3D: class Universe3D {
      constructor(...args: unknown[]) {
        Universe3DConstructorMock(...args);
      }
      destroy() {
        universeDestroyMock();
      }
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

type MatchMediaListener = () => void;

function installMatchMedia(reducedMotion: boolean) {
  const listeners = new Set<MatchMediaListener>();
  const state = { reducedMotion };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn((query: string) => ({
      get matches() {
        return query.includes('prefers-reduced-motion') ? state.reducedMotion : false;
      },
      media: query,
      addEventListener: (_event: string, listener: MatchMediaListener) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: MatchMediaListener) => {
        listeners.delete(listener);
      },
      dispatchEvent: jest.fn(),
    })),
  });
  return {
    setReducedMotion(next: boolean) {
      state.reducedMotion = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function renderPublishedHero() {
  renderWithProviders(<Hero />, {
    initialEntries: ['/?artist=beatles'],
    preloadedState: {
      lang: { current: 'en' },
      currentArtist: { publicSlug: 'beatles' },
      artistAlbumCatalog: artistAlbumCatalogState,
    },
  });
}

function completeHeroCoverPaint() {
  const img = document.querySelector('img.hero__cover-image') as HTMLImageElement | null;
  expect(img).toBeTruthy();
  Object.defineProperty(img!, 'complete', { configurable: true, value: true });
  Object.defineProperty(img!, 'naturalWidth', { configurable: true, value: 1920 });
  img!.dispatchEvent(new Event('load'));
}

describe('Hero Universe3D and prefers-reduced-motion', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    loadUniverse3DModuleMock.mockClear();
    Universe3DConstructorMock.mockClear();
    universeDestroyMock.mockClear();
    installMatchMedia(false);

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

  test('prefers-reduced-motion: does not load Universe3D module or construct Universe3D', async () => {
    installMatchMedia(true);
    renderPublishedHero();
    completeHeroCoverPaint();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(loadUniverse3DModuleMock).not.toHaveBeenCalled();
    expect(Universe3DConstructorMock).not.toHaveBeenCalled();
    expect(document.querySelector('.hero__canvas')).toBeNull();
    expect(document.querySelector('img.hero__cover-image')).toBeTruthy();
  });

  test('normal motion: existing lazy-load flow still loads Universe3D after cover paint', async () => {
    renderPublishedHero();
    expect(loadUniverse3DModuleMock).not.toHaveBeenCalled();

    completeHeroCoverPaint();

    await waitFor(() => {
      expect(loadUniverse3DModuleMock).toHaveBeenCalled();
      expect(Universe3DConstructorMock).toHaveBeenCalled();
    });
  });

  test('transition normal → reduce destroys active Universe3D', async () => {
    const media = installMatchMedia(false);
    renderPublishedHero();
    completeHeroCoverPaint();

    await waitFor(() => {
      expect(Universe3DConstructorMock).toHaveBeenCalled();
    });

    await act(async () => {
      media.setReducedMotion(true);
    });

    await waitFor(() => {
      expect(universeDestroyMock).toHaveBeenCalled();
    });
    expect(loadUniverse3DModuleMock).toHaveBeenCalledTimes(1);
  });
});
