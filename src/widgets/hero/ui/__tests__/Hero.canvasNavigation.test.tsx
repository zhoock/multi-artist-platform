import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Hero } from '../Hero';
import { renderWithProviders } from '@shared/lib/test-utils';
import { UNIVERSE_FOCUS_ARTIST_STORAGE_KEY, Universe3D } from '@/components/view/Universe3D';

const navigateMock = jest.fn();
const mockTryActivateArtistFromClick = jest.fn(() => false);
const mockActivatePrimaryArtist = jest.fn(() => false);
const mockIsArtistCardTarget = jest.fn(() => false);

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: jest.fn(() => ({
    builderVisibility: { mode: 'hidden', canShowBlocks: false },
    skeletonVariant: 'public' as const,
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
    headerImages: [],
    isHeaderImagesReady: true,
    albumDetailsReleaseGatePending: false,
    catalogReleaseGatePending: false,
    suppressPublishedArtistChrome: false,
    monetizationEnabled: false,
    paymentSurfaceReady: true,
  })),
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

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            name: 'Beatles',
            publicSlug: 'beatles',
            genreCode: 'rock',
            userId: 'user-1',
          },
        ],
      }),
    })
  ),
}));

jest.mock('@/components/view/Universe3D', () => {
  const actual = jest.requireActual<typeof import('@/components/view/Universe3D')>(
    '@/components/view/Universe3D'
  );
  return {
    ...actual,
    Universe3D: jest.fn(function Universe3DMock(
      this: Record<string, unknown>,
      container: HTMLElement
    ) {
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      this.destroy = jest.fn();
      this.tryActivateArtistFromClick = mockTryActivateArtistFromClick;
      this.activatePrimaryArtist = mockActivatePrimaryArtist;
      this.isArtistCardTarget = mockIsArtistCardTarget;
    }),
  };
});

describe('Hero canvas navigation', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    mockTryActivateArtistFromClick.mockReset();
    mockTryActivateArtistFromClick.mockReturnValue(false);
    mockActivatePrimaryArtist.mockReset();
    mockActivatePrimaryArtist.mockReturnValue(false);
    mockIsArtistCardTarget.mockReset();
    mockIsArtistCardTarget.mockReturnValue(false);
    sessionStorage.clear();
    jest.mocked(Universe3D).mockClear();
  });

  test('click canvas navigates home without activating artist card', async () => {
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: {
          artistMissing: false,
        },
      },
    });

    await waitFor(() => {
      expect(jest.mocked(Universe3D)).toHaveBeenCalled();
    });

    const canvasButton = screen.getByRole('button', { name: /Beatles, go to home page/i });
    fireEvent.click(canvasButton);

    expect(mockTryActivateArtistFromClick).not.toHaveBeenCalled();
    expect(mockActivatePrimaryArtist).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY)).toBe('beatles');
    expect(navigateMock).toHaveBeenCalledWith('/en');
    expect(document.querySelector('.universe3d-card')).toBeNull();
  });

  test('keyboard activation navigates home without opening artist card', async () => {
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: {
          artistMissing: false,
        },
      },
    });

    await waitFor(() => {
      expect(jest.mocked(Universe3D)).toHaveBeenCalled();
    });

    const canvasButton = screen.getByRole('button', { name: /Beatles, go to home page/i });
    fireEvent.keyDown(canvasButton, { key: 'Enter' });

    expect(mockActivatePrimaryArtist).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/en');
    expect(document.querySelector('.universe3d-card')).toBeNull();
  });
});
