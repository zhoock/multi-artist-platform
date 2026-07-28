import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { ArtistPageBuilderPaymentBar } from '../ArtistPageBuilderPaymentBar';
import { renderWithProviders } from '@shared/lib/test-utils';

const baseAccess = {
  isLoading: false,
  isOwner: true,
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
};

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: jest.fn(() => ({
    builderVisibility: { mode: 'active', canShowBlocks: true },
    skeletonVariant: 'builder' as const,
    canShowBuilderBlocks: true,
    ...baseAccess,
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

import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';

describe('ArtistPageBuilderPaymentBar', () => {
  beforeEach(() => {
    jest.mocked(useArtistPageBuilder).mockReturnValue({
      builderVisibility: { mode: 'active', canShowBlocks: true },
      skeletonVariant: 'builder',
      canShowBuilderBlocks: true,
      ...baseAccess,
    });
  });

  test('does not show connect CTA while payment status is unresolved', () => {
    jest.mocked(useArtistPageBuilder).mockReturnValue({
      builderVisibility: { mode: 'active', canShowBlocks: true },
      skeletonVariant: 'builder',
      canShowBuilderBlocks: true,
      ...baseAccess,
      paymentSurfaceReady: false,
      monetizationEnabled: false,
    });

    renderWithProviders(<ArtistPageBuilderPaymentBar />, {
      initialEntries: ['/?artist=test-artist'],
    });

    expect(
      screen.queryByText(/Подключите приём платежей|Connect payments/i)
    ).not.toBeInTheDocument();
  });

  test('does not show connect CTA when monetization is already enabled', () => {
    jest.mocked(useArtistPageBuilder).mockReturnValue({
      builderVisibility: { mode: 'active', canShowBlocks: true },
      skeletonVariant: 'builder',
      canShowBuilderBlocks: true,
      ...baseAccess,
      paymentSurfaceReady: true,
      monetizationEnabled: true,
    });

    renderWithProviders(<ArtistPageBuilderPaymentBar />, {
      initialEntries: ['/?artist=test-artist'],
    });

    expect(
      screen.queryByText(/Подключите приём платежей|Connect payments/i)
    ).not.toBeInTheDocument();
  });

  test('shows connect CTA only when payments are known to be disconnected', () => {
    renderWithProviders(<ArtistPageBuilderPaymentBar />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'ru' },
        uiDictionary: {
          ru: {
            status: 'succeeded',
            error: null,
            data: [
              {
                artistPageBuilder: {
                  payment: {
                    text: 'Подключите приём платежей',
                    cta: 'Настроить платежи',
                  },
                },
              },
            ],
            lastUpdated: Date.now(),
          },
          en: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      } as never,
    });

    expect(screen.getByText('Подключите приём платежей')).toBeInTheDocument();
  });
});
