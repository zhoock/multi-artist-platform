import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, act } from '@testing-library/react';
import { ArtistContactManagerSection } from '../ArtistContactManagerSection';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { ArtistPageBuilderVisibility } from '@shared/lib/artistPageBuilder';

const fetchPublicArtistUserProfile = jest.fn<
  () => Promise<{
    managerTelegramUrl: string | null;
    managerEmail: string | null;
  } | null>
>();

type ArtistPageBuilderMockReturn = {
  builderVisibility: ArtistPageBuilderVisibility;
  isOwner: boolean;
  monetizationEnabled: boolean;
  showArtistPageSkeleton: boolean;
};

const useArtistPageBuilderMock = jest.fn<() => ArtistPageBuilderMockReturn>(() => ({
  builderVisibility: { canShowBlocks: false, mode: 'hidden' },
  isOwner: false,
  monetizationEnabled: false,
  showArtistPageSkeleton: false,
}));

jest.mock('@shared/lib/publicArtistUserProfile', () => ({
  fetchPublicArtistUserProfile: () => fetchPublicArtistUserProfile(),
}));

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => useArtistPageBuilderMock(),
}));

const uiDictionaryState = {
  ru: {
    status: 'succeeded' as const,
    error: null,
    data: [
      {
        menu: {},
        artistContactManager: {
          linkLabel: 'Связаться с менеджером',
          title: 'Связаться с менеджером',
        },
      },
    ],
    lastUpdated: Date.now(),
  },
  en: {
    status: 'idle' as const,
    error: null,
    data: [],
    lastUpdated: null,
  },
};

function renderContactSection() {
  return renderWithProviders(<ArtistContactManagerSection />, {
    initialEntries: ['/?artist=test-artist'],
    preloadedState: {
      lang: { current: 'ru' },
      uiDictionary: uiDictionaryState,
    },
  });
}

describe('ArtistContactManagerSection integration tests', () => {
  beforeEach(() => {
    fetchPublicArtistUserProfile.mockReset();
    useArtistPageBuilderMock.mockReset();
    useArtistPageBuilderMock.mockReturnValue({
      builderVisibility: { canShowBlocks: false, mode: 'hidden' },
      isOwner: false,
      monetizationEnabled: false,
      showArtistPageSkeleton: false,
    });
    fetchPublicArtistUserProfile.mockResolvedValue({
      managerTelegramUrl: null,
      managerEmail: null,
    });
  });

  test('не показывает секцию посетителю без контактов', async () => {
    renderContactSection();

    await waitFor(() => {
      expect(fetchPublicArtistUserProfile).toHaveBeenCalled();
    });

    expect(document.getElementById('contact-manager')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /связаться с менеджером/i })
    ).not.toBeInTheDocument();
  });

  test('показывает ссылку «Связаться с менеджером» и открывает fullscreen popup', async () => {
    fetchPublicArtistUserProfile.mockResolvedValue({
      managerTelegramUrl: null,
      managerEmail: 'manager@test.com',
    });

    renderContactSection();

    await waitFor(() => {
      expect(document.getElementById('contact-manager')).toBeInTheDocument();
    });

    const contactTrigger = screen.getByRole('button', { name: /связаться с менеджером/i });
    await act(async () => {
      contactTrigger.click();
    });

    expect(screen.getByRole('heading', { name: /связаться с менеджером/i })).toBeInTheDocument();
    expect(document.querySelector('.artist-contact-manager')).toBeInTheDocument();
  });

  test('показывает конструктор контактов владельцу без заполненных полей', async () => {
    useArtistPageBuilderMock.mockReturnValue({
      builderVisibility: { canShowBlocks: true, mode: 'active' },
      isOwner: true,
      monetizationEnabled: false,
      showArtistPageSkeleton: false,
    });

    renderContactSection();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set up manager contacts/i })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /^связаться с менеджером$/i })
    ).not.toBeInTheDocument();
  });
});
