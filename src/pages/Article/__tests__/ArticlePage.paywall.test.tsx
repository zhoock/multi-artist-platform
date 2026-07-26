import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ArticlePage } from '../ui/ArticlePage';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { ArchiveStatus } from '@shared/api/archive';
import type { IArticles } from '@models';

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Test Artist',
    displayLabel: 'Test Artist',
    isLoading: false,
  }),
}));

const mockOpen = jest.fn();
const mockAddToArchive = jest.fn<() => Promise<ArchiveStatus | null>>();
const mockActivateInArchive = jest.fn<() => Promise<ArchiveStatus | null>>();

jest.mock('@shared/ui/artistPageBuilder/useArtistPageBuilderNav', () => ({
  useArtistPageBuilderNav: () => ({
    openDashboard: jest.fn(),
  }),
}));

jest.mock('@features/artistArchive/ui/CollectionFullModal', () => ({
  CollectionFullModal: () => null,
}));

jest.mock('@shared/lib/hooks/useArtistPageAccess', () => ({
  useArtistPageAccess: () => ({
    monetizationEnabled: true,
    paymentSurfaceReady: true,
  }),
}));

jest.mock('@features/premiumSubscription', () => ({
  usePremiumSubscription: jest.fn(() => ({
    isPremium: false,
    loading: false,
    slotsLimit: 3,
    slotsUsed: 0,
    planSlug: null,
    refetch: async () => {},
  })),
}));

jest.mock('@features/artistArchive/lib/useArtistArchiveStatus', () => ({
  useArtistArchiveStatus: jest.fn(() => ({
    artistInArchive: false,
    artistActiveInArchive: false,
    loading: false,
    status: null,
    adding: false,
    activating: false,
    error: null,
    buttonState: 'not_premium',
    slotsRemaining: 0,
    isOwner: false,
    refetch: async () => null,
    addToArchive: mockAddToArchive,
    activateInArchive: mockActivateInArchive,
    clearError: () => {},
  })),
}));

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: mockOpen,
    requestAccess: jest.fn(),
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    startCheckout: jest.fn(),
  }),
}));

import { usePremiumSubscription } from '@features/premiumSubscription';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';

const lockedArticle: IArticles = {
  articleId: 'locked-article',
  nameArticle: 'Locked Article',
  description: '',
  date: '2024-01-01',
  img: 'article.jpg',
  userId: 'artist-uuid',
  articleLocked: true,
  visibility: 'subscribers_only',
  details: [{ id: 1, content: 'Preview paragraph' }],
};

function renderLockedArticlePage() {
  return renderWithProviders(
    <Routes>
      <Route path="/articles/:articleId" element={<ArticlePage />} />
    </Routes>,
    {
      initialEntries: ['/articles/locked-article?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [lockedArticle],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: 'test-artist',
          inFlightFetchContextKey: null,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: { articleSubscriptionLockedCta: 'Start Support' },
                titles: {
                  articles: 'Articles',
                  articleSubscriptionLockedOverlayTitle: 'Support required',
                  articleSubscriptionLockedOverlayHint: 'Read the full article.',
                },
                links: {},
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      } as never,
    }
  );
}

describe('ArticlePage paywall', () => {
  beforeEach(() => {
    mockOpen.mockClear();
    mockAddToArchive.mockReset();
    mockAddToArchive.mockResolvedValue(null);
    mockActivateInArchive.mockReset();
    mockActivateInArchive.mockResolvedValue(null);
    jest.mocked(usePremiumSubscription).mockReturnValue({
      isPremium: false,
      loading: false,
      slotsLimit: 3,
      slotsUsed: 0,
      planSlug: null,
      refetch: async () => {},
    });
    jest.mocked(useArtistArchiveStatus).mockReturnValue({
      artistInArchive: false,
      artistActiveInArchive: false,
      loading: false,
      status: null,
      adding: false,
      activating: false,
      error: null,
      buttonState: 'not_premium',
      slotsRemaining: 0,
      isOwner: false,
      refetch: async () => null,
      addToArchive: mockAddToArchive,
      activateInArchive: mockActivateInArchive,
      clearError: () => {},
    });
  });

  test('shows subscription gate on the article page for locked content', () => {
    renderLockedArticlePage();

    expect(screen.getByRole('heading', { name: 'Locked Article' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Support required/i })).toBeInTheDocument();
    expect(screen.getByText('Preview paragraph')).toBeInTheDocument();
  });

  test('shows pending gate skeleton while entitlements are loading', () => {
    jest.mocked(usePremiumSubscription).mockReturnValue({
      isPremium: false,
      loading: true,
      slotsLimit: 3,
      slotsUsed: 0,
      planSlug: null,
      refetch: async () => {},
    });

    renderLockedArticlePage();

    expect(screen.queryByRole('region', { name: /Support required/i })).not.toBeInTheDocument();
    expect(document.querySelector('.article__archive-gate--pending')).toBeTruthy();
    expect(document.querySelectorAll('.article__archive-gate-skeleton')).toHaveLength(4);
  });

  test('subscription CTA on the article page opens the plan modal', async () => {
    const user = userEvent.setup();
    renderLockedArticlePage();

    await user.click(screen.getByRole('button', { name: 'Start Support' }));

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockAddToArchive).not.toHaveBeenCalled();
  });

  test('archive CTA adds artist directly when a slot is available', async () => {
    jest.mocked(usePremiumSubscription).mockReturnValue({
      isPremium: true,
      loading: false,
      slotsLimit: 3,
      slotsUsed: 1,
      planSlug: 'explorer',
      refetch: async () => {},
    });
    jest.mocked(useArtistArchiveStatus).mockReturnValue({
      artistInArchive: false,
      artistActiveInArchive: false,
      loading: false,
      status: null,
      adding: false,
      activating: false,
      error: null,
      buttonState: 'can_add',
      slotsRemaining: 2,
      isOwner: false,
      refetch: async () => null,
      addToArchive: mockAddToArchive,
      activateInArchive: mockActivateInArchive,
      clearError: () => {},
    });

    const user = userEvent.setup();
    renderLockedArticlePage();

    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    expect(mockAddToArchive).toHaveBeenCalledTimes(1);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  test('archive CTA opens plan modal when subscription is inactive', async () => {
    jest.mocked(usePremiumSubscription).mockReturnValue({
      isPremium: true,
      loading: false,
      slotsLimit: 3,
      slotsUsed: 1,
      planSlug: 'explorer',
      refetch: async () => {},
    });
    jest.mocked(useArtistArchiveStatus).mockReturnValue({
      artistInArchive: false,
      artistActiveInArchive: false,
      loading: false,
      status: null,
      adding: false,
      activating: false,
      error: null,
      buttonState: 'not_premium',
      slotsRemaining: 2,
      isOwner: false,
      refetch: async () => null,
      addToArchive: mockAddToArchive,
      activateInArchive: mockActivateInArchive,
      clearError: () => {},
    });

    const user = userEvent.setup();
    renderLockedArticlePage();

    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockAddToArchive).not.toHaveBeenCalled();
  });

  test('activate CTA activates artist directly when slot is inactive', async () => {
    jest.mocked(usePremiumSubscription).mockReturnValue({
      isPremium: true,
      loading: false,
      slotsLimit: 3,
      slotsUsed: 1,
      planSlug: 'explorer',
      refetch: async () => {},
    });
    jest.mocked(useArtistArchiveStatus).mockReturnValue({
      artistInArchive: true,
      artistActiveInArchive: false,
      loading: false,
      status: null,
      adding: false,
      activating: false,
      error: null,
      buttonState: 'in_collection_inactive',
      slotsRemaining: 2,
      isOwner: false,
      refetch: async () => null,
      addToArchive: mockAddToArchive,
      activateInArchive: mockActivateInArchive,
      clearError: () => {},
    });

    const user = userEvent.setup();
    renderLockedArticlePage();

    expect(screen.getByRole('region', { name: /Activate artist/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Activate' }));

    expect(mockActivateInArchive).toHaveBeenCalledTimes(1);
    expect(mockAddToArchive).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
