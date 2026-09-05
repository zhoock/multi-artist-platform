import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import { Hero } from '../Hero';
import { renderWithProviders } from '@shared/lib/test-utils';

const navigateMock = jest.fn();

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
    pageReady: false,
    showArtistPageSkeleton: false,
    showArtistPageSurfacePending: false,
    showArtistPageHeroPending: false,
    showArtistPageLayoutPending: false,
    headerImages: [],
    isHeaderImagesReady: false,
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

jest.mock('@shared/lib/publicArtistsCache', () => ({
  ensurePublicArtistsLoaded: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/components/view/loadUniverse3DModule', () => ({
  loadUniverse3DModule: jest.fn(() =>
    Promise.resolve({
      Universe3D: class Universe3D {
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

describe('Hero headerImages cold load', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  test('does not replace Hero with skeleton while headerImages are pending', async () => {
    renderWithProviders(<Hero />, {
      initialEntries: ['/?artist=beatles'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'beatles' },
        artistAlbumCatalog: artistAlbumCatalogState,
      },
    });

    expect(screen.queryByLabelText(/loading artist page hero/i)).toBeNull();
    expect(document.querySelector('section.hero')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Beatles' })).toBeTruthy();

    await waitFor(() => {
      expect(document.querySelector('section.hero')).toBeTruthy();
    });
  });
});
