import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, act } from '@testing-library/react';
import { AboutSection } from '../AboutSection';
import { renderWithProviders } from '@shared/lib/test-utils';

const loadTheBandFromDatabase =
  jest.fn<(lang: string, options?: Record<string, unknown>) => Promise<string[] | null>>();
const loadTheBandFromProfileJson = jest.fn<(lang: string) => Promise<string[] | null>>();

jest.mock('@entities/user/lib', () => ({
  loadTheBandFromDatabase: (lang: string, options?: Record<string, unknown>) =>
    loadTheBandFromDatabase(lang, options),
  loadTheBandFromProfileJson: (lang: string) => loadTheBandFromProfileJson(lang),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({ displayLabel: 'Test Artist', isLoading: false }),
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
    loadTheBandFromProfileJson.mockReset();
    loadTheBandFromProfileJson.mockResolvedValue(null);
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
