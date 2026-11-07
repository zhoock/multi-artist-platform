import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react';
import { Hero } from '../Hero';
import { renderWithProviders } from '@shared/lib/test-utils';

const navigateMock = jest.fn();

const Universe3DConstructorMock = jest.fn();
const loadUniverse3DModuleMock = jest.fn(() =>
  Promise.resolve({
    Universe3D: class Universe3D {
      constructor(...args: unknown[]) {
        Universe3DConstructorMock(...args);
      }
      destroy = jest.fn();
      isArtistCardTarget() {
        return false;
      }
    },
  })
);

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

jest.mock('@/components/view/loadUniverse3DModule', () => ({
  loadUniverse3DModule: () => loadUniverse3DModuleMock(),
}));

jest.mock('@shared/lib/publicArtistsCache', () => ({
  ensurePublicArtistsLoaded: jest.fn(() =>
    Promise.resolve([
      {
        name: 'Test Artist',
        publicSlug: 'test-artist',
        genreCode: 'rock',
        userId: 'user-1',
      },
    ])
  ),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: jest.fn(() => ({
    displayName: 'Test Artist',
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

const mockUseArtistPageBuilder = jest.fn();

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: (slug: string) => mockUseArtistPageBuilder(slug),
}));

const HERO_A = '/api/proxy-image?path=users/u1/hero/cover-a-1920.jpg';
const HERO_B = '/api/proxy-image?path=users/u1/hero/cover-b-1920.jpg';
const HERO_VALID = '/api/proxy-image?path=users/u1/hero/live-1920.jpg';

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

function mockHeaders(images: string[]) {
  mockUseArtistPageBuilder.mockReturnValue({
    ...baseBuilder,
    headerImages: images,
  });
}

function renderArtist(slug = 'test-artist') {
  return renderWithProviders(<Hero />, {
    initialEntries: [`/?artist=${slug}`],
    preloadedState: {
      lang: { current: 'ru' },
      currentArtist: { publicSlug: slug },
      artistAlbumCatalog: catalogState,
    },
  });
}

function heroLayerOrder(): string[] {
  const hero = document.querySelector('.hero');
  if (!hero) return [];
  const layers: string[] = [];
  if (hero.querySelector('.hero__cover-layer')) layers.push('cover');
  if (hero.querySelector('.hero__canvas')) layers.push('canvas');
  if (hero.querySelector('.hero__content')) layers.push('content');
  return layers;
}

describe('Hero canvas independent from hero cover', () => {
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
    loadUniverse3DModuleMock.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('1 empty header_images — Universe3D starts without cover img', async () => {
    mockHeaders([]);
    renderArtist();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    expect(document.querySelector('img.hero__cover-image')).toBeNull();
  });

  test('2 valid cover — Universe3D starts before img load completes', async () => {
    mockHeaders([HERO_VALID]);
    renderArtist();
    const img = document.querySelector('img.hero__cover-image');
    expect(img).toBeTruthy();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(true);
  });

  test('3 single broken URL — Universe3D before img error', async () => {
    mockHeaders([HERO_A]);
    renderArtist();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1));
    fireEvent.error(document.querySelector('img.hero__cover-image')!);
    expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
  });

  test('4 multiple broken URLs — Universe3D before any img error', async () => {
    mockHeaders([HERO_A, HERO_B]);
    renderArtist();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1));
    fireEvent.error(document.querySelector('img.hero__cover-image')!);
    expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
  });

  test('5 all broken — cover dismissed after errors, canvas stays', async () => {
    mockHeaders([HERO_A, HERO_B]);
    renderArtist();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    fireEvent.error(document.querySelector('img.hero__cover-image')!);
    fireEvent.error(document.querySelector('img.hero__cover-image')!);
    await waitFor(() => expect(document.querySelector('.hero__cover-layer')).toBeNull());
    expect(document.querySelector('.hero__canvas')).toBeTruthy();
    expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
  });

  test('6 delayed cover — Universe3D while img still pending (no load)', async () => {
    mockHeaders([HERO_VALID]);
    renderArtist();
    const img = document.querySelector('img.hero__cover-image');
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(true);
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    expect(img?.classList.contains('hero__cover-image--pending')).toBe(true);
  });

  test('7 cover loads after canvas — img becomes visible, single Universe3D', async () => {
    mockHeaders([HERO_VALID]);
    renderArtist();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1));
    const img = document.querySelector('img.hero__cover-image')!;
    fireEvent.load(img);
    expect(img.classList.contains('hero__cover-image--pending')).toBe(false);
    expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
  });

  test('8 cover never loads — canvas still mounted', async () => {
    mockHeaders([HERO_A]);
    renderArtist();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalled());
    expect(document.querySelector('.hero__canvas')).toBeTruthy();
    expect(Universe3DConstructorMock).toHaveBeenCalled();
  });

  test('9 header_images update — no second Universe3D init', async () => {
    mockHeaders([HERO_A]);
    const { rerender } = renderArtist();
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1));
    mockHeaders([HERO_VALID]);
    rerender(<Hero />);
    await waitFor(() => {
      expect(document.querySelector(`img[src="${HERO_VALID}"]`)).toBeTruthy();
    });
    expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1);
  });

  test('10 artist remount — new Universe3D instance', async () => {
    mockHeaders([HERO_VALID]);
    const first = renderArtist('artist-one');
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalledTimes(1));
    first.unmount();
    mockHeaders([HERO_B]);
    renderArtist('artist-two');
    await waitFor(() => expect(Universe3DConstructorMock).toHaveBeenCalledTimes(2));
  });

  test('DOM layers: cover below canvas when cover is shown', () => {
    mockHeaders([HERO_VALID]);
    renderArtist();
    expect(heroLayerOrder()).toEqual(['cover', 'canvas', 'content']);
  });
});
