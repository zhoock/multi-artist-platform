import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ArticlePage } from '../ui/ArticlePage';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { IArticles } from '@models';

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Test Artist',
    displayLabel: 'Test Artist',
    isLoading: false,
  }),
}));

const mockOpen = jest.fn();

jest.mock('@shared/lib/hooks/useArtistPageAccess', () => ({
  useArtistPageAccess: () => ({
    monetizationEnabled: true,
    paymentSurfaceReady: true,
  }),
}));

jest.mock('@features/premiumSubscription', () => ({
  usePremiumSubscription: () => ({
    isPremium: false,
    loading: false,
    slotsLimit: 3,
    slotsUsed: 0,
    planSlug: null,
    refetch: async () => {},
  }),
}));

jest.mock('@features/artistArchive/lib/useArtistArchiveStatus', () => ({
  useArtistArchiveStatus: () => ({
    artistInArchive: false,
    loading: false,
    status: null,
    adding: false,
    error: null,
    buttonState: 'guest',
    slotsRemaining: 0,
    isOwner: false,
    refetch: async () => null,
    addToArchive: async () => null,
    clearError: () => {},
  }),
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

const lockedArticle: IArticles = {
  articleId: 'locked-article',
  nameArticle: 'Locked Article',
  description: '',
  date: '2024-01-01',
  img: 'article.jpg',
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
                  articleSubscriptionLockedOverlayTitle: 'Continue Reading',
                  articleSubscriptionLockedOverlayHint: 'Subscribers only',
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
  });

  test('shows subscription gate on the article page for locked content', () => {
    renderLockedArticlePage();

    expect(screen.getByRole('heading', { name: 'Locked Article' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Continue Reading/i })).toBeInTheDocument();
    expect(screen.getByText('Preview paragraph')).toBeInTheDocument();
  });

  test('subscription CTA on the article page opens the plan modal', async () => {
    const user = userEvent.setup();
    renderLockedArticlePage();

    await user.click(screen.getByRole('button', { name: 'Start Support' }));

    expect(mockOpen).toHaveBeenCalledTimes(1);
  });
});
