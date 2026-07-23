import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ArticlePreview } from '../ArticlePreview';
import { renderWithProviders } from '@shared/lib/test-utils';

const mockOpen = jest.fn();
const mockRequestAccess = jest.fn();

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: mockOpen,
    requestAccess: mockRequestAccess,
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    startCheckout: jest.fn(),
  }),
}));

const premiumState = {
  isPremium: false,
  loading: false,
  slotsLimit: 3,
  slotsUsed: 0,
  planSlug: null,
  refetch: async () => {},
};

jest.mock('@features/premiumSubscription', () => ({
  usePremiumSubscription: jest.fn(() => premiumState),
}));

jest.mock('@features/artistArchive/lib/useArtistArchiveStatus', () => ({
  useArtistArchiveStatus: jest.fn(() => ({
    status: null,
    loading: false,
    adding: false,
    error: null,
    buttonState: 'not_premium',
    slotsRemaining: 0,
    isOwner: false,
    artistInArchive: false,
    refetch: async () => null,
    addToArchive: async () => null,
    clearError: () => {},
  })),
}));

import { usePremiumSubscription } from '@features/premiumSubscription';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';

function renderLockedPreview(initialEntries = ['/?artist=test-artist']) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <ArticlePreview
            articleId="locked-post"
            nameArticle="Locked post"
            date="2024-01-01"
            img="cover.jpg"
            userId="artist-uuid"
            articleLocked
            visibility="subscribers_only"
            monetizationEnabled
          />
        }
      />
      <Route path="/articles/:articleId" element={<div data-testid="article-page" />} />
    </Routes>,
    {
      initialEntries,
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [{ menu: {}, buttons: {}, titles: {} }],
            lastUpdated: null,
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      } as never,
    }
  );
}

describe('ArticlePreview click behavior', () => {
  beforeEach(() => {
    mockOpen.mockClear();
    mockRequestAccess.mockClear();
    premiumState.isPremium = false;
    premiumState.loading = false;
    jest.mocked(usePremiumSubscription).mockReturnValue(premiumState);
    jest.mocked(useArtistArchiveStatus).mockReturnValue({
      status: null,
      loading: false,
      adding: false,
      error: null,
      buttonState: 'not_premium',
      slotsRemaining: 0,
      isOwner: false,
      artistInArchive: false,
      refetch: async () => null,
      addToArchive: async () => null,
      clearError: () => {},
    });
  });

  test('locked card always links to the article page', () => {
    renderLockedPreview();

    const link = screen.getByRole('link', { name: /Locked post/i });
    expect(link).toHaveAttribute('href', '/articles/locked-post?artist=test-artist');
  });

  test('click navigates to article page and never opens subscription modal', async () => {
    const user = userEvent.setup();
    renderLockedPreview(['/?artist=test-artist']);

    await user.click(screen.getByRole('link', { name: /Locked post/i }));

    expect(await screen.findByTestId('article-page')).toBeInTheDocument();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  test('click is deterministic while premium status is still loading', async () => {
    premiumState.loading = true;
    jest.mocked(usePremiumSubscription).mockReturnValue({ ...premiumState });

    const user = userEvent.setup();
    renderLockedPreview(['/?artist=test-artist']);

    await user.click(screen.getByRole('link', { name: /Locked post/i }));

    expect(await screen.findByTestId('article-page')).toBeInTheDocument();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  test('click is deterministic while archive status is still loading', async () => {
    jest.mocked(useArtistArchiveStatus).mockReturnValue({
      status: null,
      loading: true,
      adding: false,
      error: null,
      buttonState: 'loading',
      slotsRemaining: 0,
      isOwner: false,
      artistInArchive: false,
      refetch: async () => null,
      addToArchive: async () => null,
      clearError: () => {},
    });

    const user = userEvent.setup();
    renderLockedPreview(['/?artist=test-artist']);

    await user.click(screen.getByRole('link', { name: /Locked post/i }));

    expect(await screen.findByTestId('article-page')).toBeInTheDocument();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  test('public card links to article page', () => {
    renderWithProviders(
      <ArticlePreview
        articleId="public-post"
        nameArticle="Public post"
        date="2024-01-01"
        img="cover.jpg"
        userId="artist-uuid"
        articleLocked={false}
        visibility="public"
        monetizationEnabled
      />,
      {
        initialEntries: ['/?artist=test-artist'],
        preloadedState: {
          lang: { current: 'en' },
          uiDictionary: {
            en: { status: 'idle', error: null, data: [], lastUpdated: null },
            ru: { status: 'idle', error: null, data: [], lastUpdated: null },
          },
        } as never,
      }
    );

    expect(screen.getByRole('link', { name: /Public post/i })).toHaveAttribute(
      'href',
      '/articles/public-post?artist=test-artist'
    );
  });
});
