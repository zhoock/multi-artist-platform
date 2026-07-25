import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import { Footer } from '../ui/Footer';
import { renderWithProviders } from '@shared/lib/test-utils';
import { DEFAULT_SUPPORT_EMAIL } from '@shared/lib/supportEmail';

const loadSocialLinksFromDatabase =
  jest.fn<(options?: Record<string, unknown>) => Promise<Record<string, string>>>();

jest.mock('@entities/user/lib', () => ({
  loadSocialLinksFromDatabase: (options?: Record<string, unknown>) =>
    loadSocialLinksFromDatabase(options),
  loadTheBandFromDatabase: jest.fn(() => Promise.resolve(null)),
  loadHeaderImagesFromDatabase: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: jest.fn(() => ({
    builderVisibility: { mode: 'hidden', canShowBlocks: false },
    skeletonVariant: 'public' as const,
    showArtistPageSkeleton: false,
  })),
}));

const uiDictionaryState = {
  en: {
    status: 'succeeded' as const,
    error: null,
    data: [
      {
        menu: {},
        buttons: {},
        titles: {
          support: 'Support',
        },
        links: {
          publicOffer: 'Public Offer',
        },
      },
    ],
    lastUpdated: Date.now(),
  },
  ru: {
    status: 'idle' as const,
    error: null,
    data: [],
    lastUpdated: null,
  },
};

function renderFooter(initialEntries: string[] = ['/?artist=test-artist']) {
  return renderWithProviders(<Footer />, {
    initialEntries,
    preloadedState: {
      lang: { current: 'en' },
      uiDictionary: uiDictionaryState,
      currentArtist: { publicSlug: 'test-artist' },
    },
  });
}

describe('Footer integration tests', () => {
  beforeEach(() => {
    loadSocialLinksFromDatabase.mockReset();
    loadSocialLinksFromDatabase.mockResolvedValue({});
  });

  test('отображает соцсети артиста из профиля', async () => {
    loadSocialLinksFromDatabase.mockResolvedValue({
      youtube: 'https://www.youtube.com/@test-artist',
      instagram: 'https://www.instagram.com/test-artist/',
      facebook: 'https://www.facebook.com/test-artist/',
      vk: 'https://vk.com/test-artist',
    });

    renderFooter();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /youtube/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /instagram/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /facebook/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vk/i })).toBeInTheDocument();

    const youtubeLink = screen.getByRole('link', { name: /youtube/i });
    expect(youtubeLink).toHaveAttribute('href', 'https://www.youtube.com/@test-artist');
    expect(youtubeLink).toHaveAttribute('target', '_blank');
    expect(youtubeLink).toHaveAttribute('rel', 'noopener noreferrer');

    expect(loadSocialLinksFromDatabase).toHaveBeenCalledWith({
      artistSlugOverride: 'test-artist',
    });
  });

  test('не отображает соцсети без контекста артиста', async () => {
    renderWithProviders(<Footer />, {
      initialEntries: ['/'],
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: uiDictionaryState,
        currentArtist: { publicSlug: null },
      },
    });

    await waitFor(() => {
      expect(loadSocialLinksFromDatabase).not.toHaveBeenCalled();
    });

    expect(screen.queryByRole('link', { name: /youtube/i })).not.toBeInTheDocument();
  });

  test('не отображает пустые соцсети', async () => {
    loadSocialLinksFromDatabase.mockResolvedValue({});

    renderFooter();

    await waitFor(() => {
      expect(loadSocialLinksFromDatabase).toHaveBeenCalled();
    });

    expect(screen.queryByRole('link', { name: /youtube/i })).not.toBeInTheDocument();
  });

  test('должен отобразить копирайт', async () => {
    renderFooter();

    await waitFor(() => {
      expect(screen.getByText(/© 2026 Название сайта/i)).toBeInTheDocument();
    });
  });

  test('должен отобразить ссылку поддержки из UI словаря', async () => {
    renderFooter();

    const supportLink = await screen.findByRole('link', { name: /support/i });
    expect(supportLink).toBeInTheDocument();
    expect(supportLink).toHaveAttribute('href', `mailto:${DEFAULT_SUPPORT_EMAIL}`);
  });

  test('должен использовать fallback текст если UI словарь не загружен', async () => {
    renderWithProviders(<Footer />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: {
          en: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
        currentArtist: { publicSlug: 'test-artist' },
      },
    });

    const supportLink = await screen.findByRole('link', { name: /поддержка/i });
    expect(supportLink).toBeInTheDocument();
  });

  test('должен иметь role="contentinfo" для footer', async () => {
    const { container } = renderFooter();

    await waitFor(() => {
      expect(container.querySelector('footer[role="contentinfo"]')).toBeInTheDocument();
    });
  });
});
