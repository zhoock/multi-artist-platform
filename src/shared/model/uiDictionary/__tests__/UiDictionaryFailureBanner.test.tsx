import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@shared/lib/test-utils';
import { UiDictionaryFailureBanner } from '../UiDictionaryFailureBanner';

jest.mock('@shared/api/http', () => ({
  getJSON: jest.fn(),
}));

import { getJSON } from '@shared/api/http';

const mockGetJSON = getJSON as jest.MockedFunction<typeof getJSON>;

const failedUiDictionaryState = {
  en: {
    status: 'failed' as const,
    error: 'Network error',
    data: [],
    lastUpdated: null,
  },
  ru: {
    status: 'idle' as const,
    error: null,
    data: [],
    lastUpdated: null,
  },
};

const succeededUiDictionaryState = {
  en: {
    status: 'succeeded' as const,
    error: null,
    data: [{ menu: {}, titles: {}, buttons: {} }],
    lastUpdated: 1,
  },
  ru: {
    status: 'idle' as const,
    error: null,
    data: [],
    lastUpdated: null,
  },
};

describe('UiDictionaryFailureBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('не показывается при status succeeded', () => {
    renderWithProviders(<UiDictionaryFailureBanner />, {
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: succeededUiDictionaryState,
      },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('показывает EN copy при lang=en и failed', () => {
    renderWithProviders(<UiDictionaryFailureBanner />, {
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: failedUiDictionaryState,
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some interface content could not be loaded.'
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('показывает RU copy при lang=ru и failed', () => {
    renderWithProviders(<UiDictionaryFailureBanner />, {
      preloadedState: {
        lang: { current: 'ru' },
        uiDictionary: {
          en: succeededUiDictionaryState.en,
          ru: {
            status: 'failed' as const,
            error: 'Network error',
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить часть интерфейса.');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  test('Retry запускает fetchUiDictionary для текущего языка', async () => {
    mockGetJSON.mockImplementation(() => new Promise(() => {}));

    const user = userEvent.setup();
    const { store } = renderWithProviders(<UiDictionaryFailureBanner />, {
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: failedUiDictionaryState,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockGetJSON).toHaveBeenCalledWith('en.json', expect.any(Object));
    expect(store.getState().uiDictionary.en.status).toBe('loading');
  });

  test('исчезает после успешного retry', async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(<UiDictionaryFailureBanner />, {
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: failedUiDictionaryState,
      },
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();

    mockGetJSON.mockResolvedValueOnce([
      {
        menu: {},
        titles: {},
        buttons: {},
      },
    ]);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(store.getState().uiDictionary.en.status).toBe('succeeded');
  });
});
