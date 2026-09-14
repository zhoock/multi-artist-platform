/** @jest-environment jsdom */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';

import { langActions, langReducer, type SupportedLang } from '@shared/model/lang';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import type { IArticles } from '@models';

const getTokenMock = jest.fn<() => string | null>();

jest.mock('@shared/lib/auth', () => ({
  getToken: () => getTokenMock(),
}));

const fetchWithAuthSessionMock = jest.fn<(...args: unknown[]) => Promise<Response>>();

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (...args: unknown[]) => fetchWithAuthSessionMock(...args),
  shouldSuppressApiErrorUi: async () => false,
}));

jest.mock('@entities/article', () => {
  const actual = jest.requireActual('@entities/article') as Record<string, unknown>;
  return {
    ...actual,
    fetchArticles: () => ({
      type: 'articles/fetchArticles/fulfilled',
      payload: [],
      unwrap: () => Promise.resolve([]),
    }),
  };
});

jest.mock('@shared/lib/toast/showArticleEditorToast', () => ({
  showArticleEditorToast: jest.fn(),
}));

import { EditArticleModalV2 } from '../EditArticleModalV2';

if (typeof Request === 'undefined') {
  class TestRequest {
    url: string;
    constructor(input: string | { url?: string }) {
      this.url = typeof input === 'string' ? input : String(input.url ?? '');
    }
  }
  (globalThis as unknown as { Request: typeof Request }).Request =
    TestRequest as unknown as typeof Request;
}

const RU_TITLE = 'Русский заголовок';
const EN_TITLE = 'English title';
const DIRTY_RU_TITLE = 'Dirty RU draft';
const DIRTY_EN_TITLE = 'Dirty EN draft';

const BILINGUAL_ARTICLE: IArticles = {
  id: 'db-article-1',
  articleId: 'article-lang-1',
  nameArticle: RU_TITLE,
  img: '',
  date: '2026-09-14',
  details: [{ type: 'text', blockKind: 'paragraph', content: 'RU body', blockId: 'p-ru' }],
  description: 'Описание RU',
  isDraft: true,
  translations: {
    ru: {
      nameArticle: RU_TITLE,
      description: 'Описание RU',
      details: [{ type: 'text', blockKind: 'paragraph', content: 'RU body', blockId: 'p-ru' }],
    },
    en: {
      nameArticle: EN_TITLE,
      description: 'Description EN',
      details: [{ type: 'text', blockKind: 'paragraph', content: 'EN body', blockId: 'p-en' }],
    },
  },
};

const EDITOR_ARTICLE: IArticles = {
  id: 'db-article-1',
  articleId: 'article-lang-1',
  nameArticle: '',
  img: '',
  date: '2026-09-14',
  details: [],
  description: '',
  isDraft: true,
};

const CLOSE_DISCARD_CONFIRM = {
  message: 'Unsaved changes will be lost.',
  stay: 'Stay',
  discard: 'Discard',
};

let saveOk = true;

function titleFieldName(lang: SupportedLang): string {
  return lang === 'en' ? 'Article Title' : 'Название статьи';
}

function saveDraftName(lang: SupportedLang): string {
  return lang === 'en' ? 'Save draft' : 'Сохранить черновик';
}

function countArticleLoads(): number {
  return fetchWithAuthSessionMock.mock.calls.filter((call) => {
    const init = call[1] as RequestInit | undefined;
    const method = (init?.method ?? 'GET').toUpperCase();
    return method === 'GET';
  }).length;
}

function createStore(lang: SupportedLang) {
  return configureStore({
    reducer: {
      lang: langReducer,
      uiDictionary: uiDictionaryReducer,
      articles: articlesReducer,
    } as never,
    preloadedState: {
      lang: { current: lang },
      uiDictionary: {
        ru: {
          status: 'succeeded' as const,
          error: null,
          data: [{ dashboard: { closeDiscardConfirm: CLOSE_DISCARD_CONFIRM } }] as never,
          lastUpdated: Date.now(),
        },
        en: {
          status: 'succeeded' as const,
          error: null,
          data: [{ dashboard: { closeDiscardConfirm: CLOSE_DISCARD_CONFIRM } }] as never,
          lastUpdated: Date.now(),
        },
      },
    } as never,
  });
}

function renderEditor(lang: SupportedLang) {
  const store = createStore(lang);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>{children}</Provider>
      </HelmetProvider>
    );
  }

  render(
    <MemoryRouter initialEntries={['/dashboard/posts']}>
      <EditArticleModalV2 isOpen article={EDITOR_ARTICLE} onClose={() => undefined} />
    </MemoryRouter>,
    { wrapper: Wrapper }
  );

  return { store };
}

async function waitForLoadedTitle(lang: SupportedLang, title: string) {
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: titleFieldName(lang) })).toHaveValue(title);
  });
}

function typeTitle(lang: SupportedLang, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: titleFieldName(lang) }), {
    target: { value },
  });
}

async function switchLang(store: ReturnType<typeof createStore>, lang: SupportedLang) {
  await act(async () => {
    store.dispatch(langActions.setLang(lang));
  });
}

describe('EditArticleModalV2 — language switch must not overwrite a dirty draft', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    saveOk = true;
    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'POST' || method === 'PUT') {
        if (!saveOk) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'Save failed' }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ data: [BILINGUAL_ARTICLE] }),
        } as Response;
      }
      return { ok: true, json: async () => [BILINGUAL_ARTICLE] } as Response;
    });
  });

  // A
  it('loads the EN translation on a clean RU → EN switch without mixing locales', async () => {
    const { store } = renderEditor('ru');
    await waitForLoadedTitle('ru', RU_TITLE);
    expect(screen.queryByDisplayValue(EN_TITLE)).toBeNull();

    await switchLang(store, 'en');
    await waitForLoadedTitle('en', EN_TITLE);

    expect(screen.queryByDisplayValue(RU_TITLE)).toBeNull();
    expect(screen.queryByDisplayValue('RU body')).toBeNull();
  });

  // B
  it('does not overwrite a dirty RU draft when switching to EN', async () => {
    const { store } = renderEditor('ru');
    await waitForLoadedTitle('ru', RU_TITLE);
    typeTitle('ru', DIRTY_RU_TITLE);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: saveDraftName('ru') })).not.toBeDisabled();
    });
    const loadsBeforeSwitch = countArticleLoads();

    await switchLang(store, 'en');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
    });
    expect(screen.getByRole('textbox', { name: titleFieldName('ru') })).toHaveValue(DIRTY_RU_TITLE);
    expect(screen.queryByDisplayValue(EN_TITLE)).toBeNull();
    expect(countArticleLoads()).toBe(loadsBeforeSwitch);
  });

  // C
  it('does not overwrite a dirty EN draft when switching to RU', async () => {
    const { store } = renderEditor('en');
    await waitForLoadedTitle('en', EN_TITLE);
    typeTitle('en', DIRTY_EN_TITLE);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: saveDraftName('en') })).not.toBeDisabled();
    });
    const loadsBeforeSwitch = countArticleLoads();

    await switchLang(store, 'ru');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
    });
    expect(screen.getByRole('textbox', { name: titleFieldName('en') })).toHaveValue(DIRTY_EN_TITLE);
    expect(screen.queryByDisplayValue(RU_TITLE)).toBeNull();
    expect(countArticleLoads()).toBe(loadsBeforeSwitch);
  });

  // D
  it('keeps the current language and draft when the user cancels the switch', async () => {
    const { store } = renderEditor('ru');
    await waitForLoadedTitle('ru', RU_TITLE);
    typeTitle('ru', DIRTY_RU_TITLE);

    await switchLang(store, 'en');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stay' })).toBeNull();
    });
    expect(store.getState().lang.current).toBe('ru');
    expect(screen.getByRole('textbox', { name: titleFieldName('ru') })).toHaveValue(DIRTY_RU_TITLE);
    expect(screen.queryByDisplayValue(EN_TITLE)).toBeNull();
  });

  // E
  it('loads the target language after the user confirms discard', async () => {
    const { store } = renderEditor('ru');
    await waitForLoadedTitle('ru', RU_TITLE);
    typeTitle('ru', DIRTY_RU_TITLE);

    await switchLang(store, 'en');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitForLoadedTitle('en', EN_TITLE);
    expect(store.getState().lang.current).toBe('en');
    expect(screen.queryByDisplayValue(DIRTY_RU_TITLE)).toBeNull();
    expect(screen.queryByDisplayValue(RU_TITLE)).toBeNull();
    expect(screen.getByRole('button', { name: saveDraftName('en') })).toBeDisabled();
  });

  // F
  it('allows a language switch after a successful Save draft', async () => {
    const { store } = renderEditor('ru');
    await waitForLoadedTitle('ru', RU_TITLE);
    typeTitle('ru', DIRTY_RU_TITLE);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: saveDraftName('ru') })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: saveDraftName('ru') }));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: saveDraftName('ru') })).toBeDisabled();
    });

    await switchLang(store, 'en');
    await waitForLoadedTitle('en', EN_TITLE);
    expect(screen.queryByRole('button', { name: 'Stay' })).toBeNull();
    expect(screen.queryByDisplayValue(DIRTY_RU_TITLE)).toBeNull();
  });

  // G
  it('keeps the dirty draft protected after a failed Save draft', async () => {
    saveOk = false;
    const { store } = renderEditor('ru');
    await waitForLoadedTitle('ru', RU_TITLE);
    typeTitle('ru', DIRTY_RU_TITLE);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: saveDraftName('ru') }));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: saveDraftName('ru') })).not.toBeDisabled();
    });

    await switchLang(store, 'en');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
    });
    expect(screen.getByRole('textbox', { name: titleFieldName('ru') })).toHaveValue(DIRTY_RU_TITLE);
    expect(screen.queryByDisplayValue(EN_TITLE)).toBeNull();
  });
});
