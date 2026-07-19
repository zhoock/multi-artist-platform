import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { ArticlesSection } from '../ArticlesSection';
import { renderWithProviders } from '@shared/lib/test-utils';

const baseAccess = {
  isLoading: false,
  isOwner: false,
  ownerResolved: true,
  ownerContentLoaded: true,
  ownerStillNeedsOnboarding: false,
  hasPublicReleases: false,
  showOnboarding: false,
  showOnboardingSkeleton: false,
  showOwnerUnderConstruction: false,
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
  suppressPublishedArtistChrome: false,
  monetizationEnabled: false,
  paymentSurfaceReady: true,
};

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: jest.fn(() => ({
    builderVisibility: { mode: 'hidden', canShowBlocks: false },
    skeletonVariant: 'public' as const,
    canShowBuilderBlocks: false,
    ...baseAccess,
  })),
}));

import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';

describe('ArticlesSection — builder visibility', () => {
  beforeEach(() => {
    jest.mocked(useArtistPageBuilder).mockReturnValue({
      builderVisibility: { mode: 'hidden', canShowBlocks: false },
      skeletonVariant: 'public',
      canShowBuilderBlocks: false,
      ...baseAccess,
    });
  });

  test('посетитель не видит builder при пустых статьях', () => {
    renderWithProviders(<ArticlesSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'ru' },
        currentArtist: { publicSlug: 'test-artist' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: 'test-artist',
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
      } as never,
    });

    expect(screen.queryByText(/нет статей/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/You have no articles/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Написать первую статью|Write your first article/i })
    ).not.toBeInTheDocument();
  });

  test('владелец видит builder при пустых статьях', () => {
    jest.mocked(useArtistPageBuilder).mockReturnValue({
      builderVisibility: { mode: 'active', canShowBlocks: true },
      skeletonVariant: 'builder',
      canShowBuilderBlocks: true,
      ...baseAccess,
      isOwner: true,
      hasPublicReleases: true,
    });

    renderWithProviders(<ArticlesSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'ru' },
        currentArtist: { publicSlug: 'test-artist' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: 'test-artist',
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          ru: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: { articles: 'статьи' },
                artistPageBuilder: {
                  articles: {
                    title: 'У вас пока нет статей',
                    text: 'Текст',
                    cta: 'Написать первую статью',
                  },
                },
              },
            ],
            lastUpdated: Date.now(),
          },
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      } as never,
    });

    expect(screen.getByRole('button', { name: /Написать первую статью/i })).toBeInTheDocument();
    expect(screen.getByText('У вас пока нет статей')).toBeInTheDocument();
  });
});
