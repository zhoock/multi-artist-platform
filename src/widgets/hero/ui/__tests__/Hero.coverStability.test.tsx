import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react';
import { Hero } from '../Hero';
import { renderWithProviders } from '@shared/lib/test-utils';
const navigateMock = jest.fn();
const mockUseArtistPageBuilder = jest.fn();

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

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
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
    useArtistPageBuilderNav: () => ({ openDashboard: jest.fn() }),
  };
});

jest.mock('@shared/lib/publicArtistsCache', () => ({
  ensurePublicArtistsLoaded: jest.fn(() =>
    Promise.resolve([
      {
        name: 'Beatles',
        publicSlug: 'beatles',
        genreCode: 'rock',
        userId: 'user-1',
      },
    ])
  ),
}));

const HERO_ENCODED = '/api/proxy-image?path=users%2Fu1%2Fhero%2Fbeatles-cover-1920.jpg';
const HERO_DECODED = '/api/proxy-image?path=users/u1/hero/beatles-cover-1920.jpg';

const baseBuilder = {
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
  isHeaderImagesReady: true,
  albumDetailsReleaseGatePending: false,
  catalogReleaseGatePending: false,
  suppressPublishedArtistChrome: false,
  monetizationEnabled: false,
  paymentSurfaceReady: true,
};

const catalogState = {
  status: 'idle' as const,
  error: null,
  data: [],
  lastUpdated: null,
  fetchContextKey: null,
  artistMissing: false,
};

function queryImg() {
  return document.querySelector('img.hero__cover-image') as HTMLImageElement | null;
}

describe('Hero cover stability (independent canvas)', () => {
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
    mockUseArtistPageBuilder.mockReturnValue({
      ...baseBuilder,
      headerImages: [HERO_ENCODED],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('1 cover loaded before Universe3D — stays visible after canvas init', async () => {
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: catalogState,
      },
    });
    const img = queryImg();
    expect(img).toBeTruthy();
    fireEvent.load(img!);
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(false);

    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(false);
    expect(document.querySelector('.hero__cover-layer')).toBeTruthy();
  });

  test('3 profile-equivalent headerImages renorm does not hide cover', async () => {
    const { rerender } = renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: catalogState,
      },
    });
    const img = queryImg()!;
    fireEvent.load(img);
    expect(img.classList.contains('hero__cover-image--pending')).toBe(false);

    mockUseArtistPageBuilder.mockReturnValue({
      ...baseBuilder,
      headerImages: [HERO_DECODED],
    });
    rerender(<Hero />);

    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    const imgAfter = queryImg();
    expect(imgAfter?.classList.contains('hero__cover-image--pending')).toBe(false);
  });

  test('4 unrelated Hero state (displayName) does not remount cover img', async () => {
    const { rerender } = renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: catalogState,
      },
    });
    const img = queryImg()!;
    fireEvent.load(img);
    const nodeBefore = img;

    mockUseArtistPageBuilder.mockReturnValue({
      ...baseBuilder,
      headerImages: [HERO_ENCODED],
    });
    rerender(<Hero />);

    expect(queryImg()).toBe(nodeBefore);
    expect(queryImg()?.classList.contains('hero__cover-image--pending')).toBe(false);
  });

  test('5 real URL change picks new src', () => {
    const NEW_HERO = '/api/proxy-image?path=users/u1/hero/other-1920.jpg';
    const { rerender } = renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: catalogState,
      },
    });
    fireEvent.load(queryImg()!);

    mockUseArtistPageBuilder.mockReturnValue({
      ...baseBuilder,
      headerImages: [NEW_HERO],
    });
    rerender(<Hero />);

    expect(queryImg()?.getAttribute('src')).toBe(NEW_HERO);
    expect(queryImg()?.classList.contains('hero__cover-image--pending')).toBe(true);
  });

  test('6 layer order cover under canvas', async () => {
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: catalogState,
      },
    });
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    const hero = document.querySelector('.hero');
    const cover = hero?.querySelector('.hero__cover-layer');
    const canvas = hero?.querySelector('.hero__canvas');
    expect(cover && canvas).toBeTruthy();
    expect(cover!.compareDocumentPosition(canvas!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
