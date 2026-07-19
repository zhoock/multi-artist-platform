import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { fetchUiDictionary, uiDictionaryReducer } from '../uiDictionarySlice';
import {
  selectUiDictionaryStatus,
  selectUiDictionaryError,
  selectUiDictionaryData,
  selectUiDictionaryFirst,
} from '../selectors';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { AppDispatch } from '@shared/model/appStore/types';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';

// Мокируем getJSON
jest.mock('@shared/api/http', () => ({
  getJSON: jest.fn(),
}));

import { getJSON } from '@shared/api/http';

const mockGetJSON = getJSON as jest.MockedFunction<typeof getJSON>;

// Вспомогательная функция для создания тестового store
const createTestStore = () => {
  return configureStore({
    reducer: {
      uiDictionary: uiDictionaryReducer,
      currentArtist: () => ({ publicSlug: null as string | null }),
      lang: () => ({ current: 'en' as SupportedLang }),
      popup: () => ({ isOpen: false }),
      player: () => initialPlayerState,
      articles: () => ({
        status: 'idle' as const,
        error: null,
        data: [],
        lastUpdated: null,
        lastPublicArtistSlug: null,
        inFlightFetchContextKey: null,
        dashboard: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      }),
      albums: () => ({
        dashboard: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      }),
      artistAlbumCatalog: () => ({
        status: 'idle' as const,
        error: null,
        data: [],
        lastUpdated: null,
        fetchContextKey: null,
        artistMissing: false,
      }),
      albumDetails: () => ({
        status: 'idle' as const,
        error: null,
        errorCode: null,
        data: null,
        fetchContextKey: null,
        artistSlug: null,
        albumId: null,
        lastUpdated: null,
      }),
      helpArticles: () => ({
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      }),
      trackLyrics: trackLyricsReducer,
    },
  });
};

describe('uiDictionarySlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('reducer', () => {
    test('должен возвращать начальное состояние', () => {
      const state = uiDictionaryReducer(undefined, { type: 'unknown' });
      expect(state).toEqual({
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
      });
    });
  });

  describe('fetchUiDictionary thunk', () => {
    const mockDictionary: IInterface[] = [
      {
        titles: {
          albums: 'Albums',
          articles: 'Articles',
        },
        menu: {
          stems: 'Mixer',
        },
        buttons: {
          playButton: 'Play',
        },
      },
    ];

    test('должен успешно загрузить UI словарь', async () => {
      mockGetJSON.mockResolvedValueOnce(mockDictionary);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      expect(result.type).toBe('uiDictionary/fetchByLang/fulfilled');
      expect(result.payload).toEqual(mockDictionary);

      const state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('succeeded');
      expect(selectUiDictionaryError(state, 'en')).toBeNull();
      expect(selectUiDictionaryData(state, 'en')).toEqual(mockDictionary);
      expect(selectUiDictionaryData(state, 'en')[0].titles?.albums).toBe('Albums');
    });

    test('должен обработать ошибку загрузки', async () => {
      const errorMessage = 'Network error';
      mockGetJSON.mockRejectedValueOnce(new Error(errorMessage));

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      expect(result.type).toBe('uiDictionary/fetchByLang/rejected');

      const state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');
      expect(selectUiDictionaryError(state, 'en')).toBe(errorMessage);
      expect(selectUiDictionaryData(state, 'en')).toEqual([]);
    });

    test('должен установить статус loading при начале загрузки', async () => {
      mockGetJSON.mockImplementation(() => new Promise(() => {})); // Никогда не разрешается

      const store = createTestStore();
      const promise = (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      // Проверяем состояние во время загрузки
      const loadingState = store.getState();
      expect(selectUiDictionaryStatus(loadingState, 'en')).toBe('loading');
      expect(selectUiDictionaryError(loadingState, 'en')).toBeNull();

      // Отменяем промис, чтобы тест завершился
      promise.abort();
    });

    test('не должен запускать загрузку, если данные уже загружаются', async () => {
      mockGetJSON.mockImplementation(() => new Promise(() => {})); // Никогда не разрешается

      const store = createTestStore();

      // Первая загрузка
      const promise1 = (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      // Вторая загрузка (должна быть отменена condition)
      const promise2 = (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      // Проверяем, что getJSON был вызван только один раз
      expect(mockGetJSON).toHaveBeenCalledTimes(1);

      promise1.abort();
      promise2.abort();
    });

    test('не должен запускать загрузку, если данные уже загружены', async () => {
      mockGetJSON.mockResolvedValueOnce(mockDictionary);

      const store = createTestStore();

      // Первая загрузка
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      // Очищаем мок
      jest.clearAllMocks();

      // Вторая загрузка (должна быть отменена condition)
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      // Проверяем, что getJSON не был вызван повторно
      expect(mockGetJSON).not.toHaveBeenCalled();
    });

    test('должен работать независимо для разных языков', async () => {
      const enDictionary: IInterface[] = [
        {
          titles: {
            albums: 'Albums',
            articles: 'Articles',
          },
          menu: {
            stems: 'Mixer',
          },
          buttons: {
            playButton: 'Play',
          },
        },
      ];

      const ruDictionary: IInterface[] = [
        {
          titles: {
            albums: 'Альбомы',
            articles: 'Статьи',
          },
          menu: {
            stems: 'Миксер',
          },
          buttons: {
            playButton: 'Воспроизвести',
          },
        },
      ];

      mockGetJSON.mockResolvedValueOnce(enDictionary).mockResolvedValueOnce(ruDictionary);

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'ru' }));

      const state = store.getState();
      expect(selectUiDictionaryData(state, 'en')).toEqual(enDictionary);
      expect(selectUiDictionaryData(state, 'ru')).toEqual(ruDictionary);
      expect(selectUiDictionaryData(state, 'en')[0].titles?.albums).toBe('Albums');
      expect(selectUiDictionaryData(state, 'ru')[0].titles?.albums).toBe('Альбомы');
    });

    test('должен обработать пустой массив данных', async () => {
      mockGetJSON.mockResolvedValueOnce([]);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      expect(result.type).toBe('uiDictionary/fetchByLang/fulfilled');
      expect(result.payload).toEqual([]);

      const state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('succeeded');
      expect(selectUiDictionaryData(state, 'en')).toEqual([]);
      expect(selectUiDictionaryFirst(state, 'en')).toBeNull();
    });

    test('должен обработать ошибку без Error объекта (null)', async () => {
      mockGetJSON.mockRejectedValueOnce(null);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      expect(result.type).toBe('uiDictionary/fetchByLang/rejected');

      const state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');
      expect(selectUiDictionaryError(state, 'en')).toBe('Unknown error');
    });

    test('должен обработать ошибку без Error объекта (строка)', async () => {
      mockGetJSON.mockRejectedValueOnce('String error');

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      expect(result.type).toBe('uiDictionary/fetchByLang/rejected');

      const state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');
      expect(selectUiDictionaryError(state, 'en')).toBe('Unknown error');
    });

    test('должен обработать ошибку без Error объекта (undefined)', async () => {
      mockGetJSON.mockRejectedValueOnce(undefined);

      const store = createTestStore();
      const result = await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      expect(result.type).toBe('uiDictionary/fetchByLang/rejected');

      const state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');
      expect(selectUiDictionaryError(state, 'en')).toBe('Unknown error');
    });

    test('должен обработать отмену запроса (abort signal)', async () => {
      const abortController = new AbortController();
      mockGetJSON.mockImplementation(() => {
        abortController.abort();
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      });

      const store = createTestStore();
      const promise = (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      abortController.abort();
      await promise.catch(() => {});

      const state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');
    });

    test('должен позволить повторную загрузку после ошибки', async () => {
      // Первая попытка - ошибка
      mockGetJSON.mockRejectedValueOnce(new Error('Network error'));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      let state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');
      expect(selectUiDictionaryError(state, 'en')).toBe('Network error');

      // Вторая попытка - успех
      mockGetJSON.mockResolvedValueOnce(mockDictionary);
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('succeeded');
      expect(selectUiDictionaryError(state, 'en')).toBeNull();
      expect(selectUiDictionaryData(state, 'en')).toEqual(mockDictionary);
    });

    test('должен обновлять lastUpdated при успешной загрузке', async () => {
      mockGetJSON.mockResolvedValueOnce(mockDictionary);

      const store = createTestStore();
      const beforeTime = Date.now();

      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      const afterTime = Date.now();
      const state = store.getState();
      const entry = state.uiDictionary.en;

      expect(entry.lastUpdated).not.toBeNull();
      expect(entry.lastUpdated).toBeGreaterThanOrEqual(beforeTime);
      expect(entry.lastUpdated).toBeLessThanOrEqual(afterTime);
    });

    test('должен очищать ошибку при новой загрузке после ошибки', async () => {
      // Первая попытка - ошибка
      mockGetJSON.mockRejectedValueOnce(new Error('First error'));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      let state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');
      expect(selectUiDictionaryError(state, 'en')).toBe('First error');

      // Начинаем новую загрузку - ошибка должна быть очищена
      mockGetJSON.mockImplementation(() => new Promise(() => {}));
      const promise = (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('loading');
      expect(selectUiDictionaryError(state, 'en')).toBeNull();

      promise.abort();
    });

    test('не должен запускать загрузку если статус failed, но уже выполняется другая', async () => {
      // Сначала создаем ошибку
      mockGetJSON.mockRejectedValueOnce(new Error('Error'));

      const store = createTestStore();
      await (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      let state = store.getState();
      expect(selectUiDictionaryStatus(state, 'en')).toBe('failed');

      // Запускаем новую загрузку
      mockGetJSON.mockImplementation(() => new Promise(() => {}));
      const promise1 = (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      // Пытаемся запустить еще одну параллельную загрузку
      const promise2 = (store.dispatch as AppDispatch)(fetchUiDictionary({ lang: 'en' }));

      // Проверяем, что getJSON был вызван только один раз
      expect(mockGetJSON).toHaveBeenCalledTimes(2); // Первый вызов - ошибка, второй - loading

      promise1.abort();
      promise2.abort();
    });
  });

  describe('selectors', () => {
    const mockState = {
      currentArtist: { publicSlug: null as string | null },
      uiDictionary: {
        en: {
          status: 'succeeded' as const,
          error: null,
          data: [
            {
              titles: {
                albums: 'Albums',
                articles: 'Articles',
              },
              menu: {
                stems: 'Mixer',
              },
              buttons: {
                playButton: 'Play',
              },
            },
          ],
          lastUpdated: 1234567890,
        },
        ru: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
        },
      },
      lang: { current: 'en' as SupportedLang },
      popup: { isOpen: false },
      player: initialPlayerState,
      articles: {
        status: 'idle' as const,
        error: null,
        data: [],
        lastUpdated: null,
        lastPublicArtistSlug: null,
        inFlightFetchContextKey: null,
        dashboard: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      },
      albums: {
        dashboard: {
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          inFlightFetchContextKey: null,
        },
      },
      helpArticles: {
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      },
    };

    test('selectUiDictionaryStatus должен возвращать статус', () => {
      expect(selectUiDictionaryStatus(mockState as any, 'en')).toBe('succeeded');
      expect(selectUiDictionaryStatus(mockState as any, 'ru')).toBe('idle');
    });

    test('selectUiDictionaryError должен возвращать ошибку', () => {
      expect(selectUiDictionaryError(mockState as any, 'en')).toBeNull();
      expect(selectUiDictionaryError(mockState as any, 'ru')).toBeNull();
    });

    test('selectUiDictionaryData должен возвращать данные', () => {
      const enData = selectUiDictionaryData(mockState as any, 'en');
      expect(enData).toHaveLength(1);
      expect(enData[0].titles?.albums).toBe('Albums');

      const ruData = selectUiDictionaryData(mockState as any, 'ru');
      expect(ruData).toEqual([]);
    });

    test('selectUiDictionaryFirst должен возвращать первый элемент', () => {
      const first = selectUiDictionaryFirst(mockState as any, 'en');
      expect(first).toBeDefined();
      expect(first?.titles?.albums).toBe('Albums');
      expect(first?.menu?.stems).toBe('Mixer');
    });

    test('selectUiDictionaryFirst должен возвращать null для пустого массива', () => {
      const first = selectUiDictionaryFirst(mockState as any, 'ru');
      expect(first).toBeNull();
    });

    test('selectUiDictionaryStatus должен обработать несуществующий язык', () => {
      // @ts-expect-error - тестируем edge case с невалидным языком
      expect(() => selectUiDictionaryStatus(mockState as any, 'fr')).toThrow();
    });

    test('selectUiDictionaryError должен обработать состояние с ошибкой', () => {
      const errorState = {
        ...mockState,
        uiDictionary: {
          ...mockState.uiDictionary,
          en: {
            ...mockState.uiDictionary.en,
            status: 'failed' as const,
            error: 'Test error message',
          },
        },
      };

      expect(selectUiDictionaryError(errorState as any, 'en')).toBe('Test error message');
    });

    test('selectUiDictionaryData должен обработать очень большой массив данных', () => {
      const largeData: IInterface[] = Array.from({ length: 1000 }, (_, i) => ({
        titles: {
          albums: `Albums ${i}`,
          articles: `Articles ${i}`,
        },
        menu: {
          stems: `Mixer ${i}`,
        },
        buttons: {
          playButton: `Play ${i}`,
        },
      }));

      const largeState = {
        ...mockState,
        uiDictionary: {
          ...mockState.uiDictionary,
          en: {
            ...mockState.uiDictionary.en,
            data: largeData,
          },
        },
      };

      const data = selectUiDictionaryData(largeState as any, 'en');
      expect(data).toHaveLength(1000);
      expect(data[0].titles?.albums).toBe('Albums 0');
      expect(data[999].titles?.albums).toBe('Albums 999');
    });

    test('selectUiDictionaryFirst должен обработать массив с одним элементом', () => {
      const singleItemState = {
        ...mockState,
        uiDictionary: {
          ...mockState.uiDictionary,
          ru: {
            ...mockState.uiDictionary.ru,
            status: 'succeeded' as const,
            data: [
              {
                titles: {
                  albums: 'Single Album',
                  articles: 'Single Article',
                },
                menu: {
                  stems: 'Single Mixer',
                },
                buttons: {
                  playButton: 'Single Play',
                },
              },
            ],
          },
        },
      };

      const first = selectUiDictionaryFirst(singleItemState as any, 'ru');
      expect(first).toBeDefined();
      expect(first?.titles?.albums).toBe('Single Album');
    });

    test('selectUiDictionaryFirst должен обработать массив с множественными элементами', () => {
      const multipleItemsState = {
        ...mockState,
        uiDictionary: {
          ...mockState.uiDictionary,
          en: {
            ...mockState.uiDictionary.en,
            data: [
              {
                titles: {
                  albums: 'First Album',
                  articles: 'First Article',
                },
                menu: {
                  stems: 'First Mixer',
                },
                buttons: {
                  playButton: 'First Play',
                },
              },
              {
                titles: {
                  albums: 'Second Album',
                  articles: 'Second Article',
                },
                menu: {
                  stems: 'Second Mixer',
                },
                buttons: {
                  playButton: 'Second Play',
                },
              },
            ],
          },
        },
      };

      const first = selectUiDictionaryFirst(multipleItemsState as any, 'en');
      expect(first).toBeDefined();
      expect(first?.titles?.albums).toBe('First Album');
      // Проверяем, что возвращается именно первый элемент
      expect(multipleItemsState.uiDictionary.en.data[1].titles?.albums).toBe('Second Album');
    });
  });
});
