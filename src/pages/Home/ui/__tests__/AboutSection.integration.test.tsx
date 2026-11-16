import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, act } from '@testing-library/react';
import { AboutSection } from '../AboutSection';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { ArtistPageBuilderVisibility } from '@shared/lib/artistPageBuilder';

const loadTheBandFromDatabase =
  jest.fn<(lang: string, options?: Record<string, unknown>) => Promise<string[] | null>>();

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

jest.mock('@entities/user/lib', () => ({
  loadTheBandFromDatabase: (lang: string, options?: Record<string, unknown>) =>
    loadTheBandFromDatabase(lang, options),
  loadSocialLinksFromDatabase: jest.fn(async () => ({})),
  loadHeaderImagesFromDatabase: jest.fn(async () => []),
}));

jest.mock('@shared/lib/publicArtistUserProfile', () => ({
  fetchPublicArtistUserProfile: () => fetchPublicArtistUserProfile(),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({ displayLabel: 'Test Artist', isLoading: false }),
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
        titles: { theBand: 'о группе' },
        buttons: { show: 'Показать' },
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

function renderAboutSection() {
  return renderWithProviders(
    <AboutSection isAboutModalOpen={false} onOpen={() => {}} onClose={() => {}} />,
    {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'ru' },
        uiDictionary: uiDictionaryState,
      },
    }
  );
}

describe('AboutSection integration tests', () => {
  beforeEach(() => {
    loadTheBandFromDatabase.mockReset();
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

  test('не рендерит секцию на странице артиста без заполненного описания', async () => {
    loadTheBandFromDatabase.mockResolvedValue(null);

    renderAboutSection();

    await waitFor(() => {
      expect(loadTheBandFromDatabase).toHaveBeenCalled();
    });

    expect(screen.queryByRole('heading', { name: /о группе/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Показать')).not.toBeInTheDocument();
  });

  test('рендерит секцию на странице артиста с непустым описанием', async () => {
    loadTheBandFromDatabase.mockImplementation(() => Promise.resolve(['Описание группы']));

    renderAboutSection();

    await waitFor(() => {
      expect(document.getElementById('about')).toBeInTheDocument();
    });
    const aboutSection = document.getElementById('about');
    expect(aboutSection).toBeInTheDocument();
    expect(aboutSection).toHaveTextContent('Описание группы');
  });

  test('скрывает секцию после artist:updated, когда описание очищено', async () => {
    loadTheBandFromDatabase.mockResolvedValueOnce(['Описание группы']).mockResolvedValueOnce(null);

    renderAboutSection();

    await waitFor(() => {
      expect(document.getElementById('about')).toBeInTheDocument();
    });

    await act(async () => {
      window.dispatchEvent(new Event('artist:updated'));
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /о группе/i })).not.toBeInTheDocument();
    });
    expect(loadTheBandFromDatabase).toHaveBeenCalledTimes(2);
  });

  test('на soft refresh (artist:updated) оставляет секцию на экране до ответа', async () => {
    let resolveRefresh!: (value: string[]) => void;
    const refreshPromise = new Promise<string[]>((resolve) => {
      resolveRefresh = resolve;
    });

    loadTheBandFromDatabase
      .mockResolvedValueOnce(['Описание группы'])
      .mockImplementationOnce(() => refreshPromise);

    renderAboutSection();

    await waitFor(() => {
      expect(document.getElementById('about')).toBeInTheDocument();
    });
    expect(document.getElementById('about')).toHaveTextContent('Описание группы');

    await act(async () => {
      window.dispatchEvent(new Event('artist:updated'));
    });

    // SWR: previous content stays mounted while the background fetch is in flight.
    expect(document.getElementById('about')).toBeInTheDocument();
    expect(document.getElementById('about')).toHaveTextContent('Описание группы');

    await act(async () => {
      resolveRefresh(['Обновлённое описание']);
    });

    await waitFor(() => {
      expect(document.getElementById('about')).toHaveTextContent('Обновлённое описание');
    });
  });

  test('открывает модалку при клике по области превью описания', async () => {
    loadTheBandFromDatabase.mockImplementation(() => Promise.resolve(['Описание группы']));

    const onOpen = jest.fn();
    renderWithProviders(
      <AboutSection isAboutModalOpen={false} onOpen={onOpen} onClose={() => {}} />,
      {
        initialEntries: ['/?artist=test-artist'],
        preloadedState: {
          lang: { current: 'ru' },
          uiDictionary: uiDictionaryState,
        },
      }
    );

    await waitFor(() => {
      expect(document.getElementById('about')).toBeInTheDocument();
    });

    const previewTrigger = screen.getByRole('button', { name: /описание группы/i });
    await act(async () => {
      previewTrigger.click();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('не показывает «Связаться с менеджером» посетителю без контактов', async () => {
    loadTheBandFromDatabase.mockResolvedValue(['Описание группы']);

    renderAboutSection();

    await waitFor(() => {
      expect(document.getElementById('about')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /связаться с менеджером/i })
    ).not.toBeInTheDocument();
  });

  test('показывает ссылку «Связаться с менеджером» и открывает fullscreen popup', async () => {
    loadTheBandFromDatabase.mockResolvedValue(['Описание группы']);
    fetchPublicArtistUserProfile.mockResolvedValue({
      managerTelegramUrl: null,
      managerEmail: 'manager@test.com',
    });

    renderAboutSection();

    await waitFor(() => {
      expect(document.getElementById('about')).toBeInTheDocument();
    });

    const contactTrigger = screen.getByRole('button', { name: /связаться с менеджером/i });
    await act(async () => {
      contactTrigger.click();
    });

    expect(screen.getByRole('heading', { name: /связаться с менеджером/i })).toBeInTheDocument();
    expect(document.querySelector('.artist-contact-manager')).toBeInTheDocument();
  });

  test('показывает конструктор контактов владельцу без заполненных полей', async () => {
    loadTheBandFromDatabase.mockResolvedValue(['Описание группы']);
    useArtistPageBuilderMock.mockReturnValue({
      builderVisibility: { canShowBlocks: true, mode: 'active' },
      isOwner: true,
      monetizationEnabled: false,
      showArtistPageSkeleton: false,
    });

    renderAboutSection();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set up manager contacts/i })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /^связаться с менеджером$/i })
    ).not.toBeInTheDocument();
  });

  test('показывает описание на RU-странице, если текст сохранён только на EN', async () => {
    loadTheBandFromDatabase.mockResolvedValue(['English-only bio paragraph']);

    renderAboutSection();

    await waitFor(() => {
      expect(document.getElementById('about')).toBeInTheDocument();
    });

    const aboutSection = document.getElementById('about');
    expect(aboutSection).toBeInTheDocument();
    expect(aboutSection).toHaveTextContent('English-only bio paragraph');
  });
});
