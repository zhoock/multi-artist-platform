/** @jest-environment jsdom */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';

import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import type { IArticles } from '@models';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { restoreSelection } from '@shared/lib/richText';

import { EditArticleModalV2 } from '../EditArticleModalV2';

const TEXT_A_ID = 'text-a';
const TEXT_B_ID = 'text-b';
const IMAGE_ID = 'image-between';
const CAROUSEL_ID = 'carousel-between';

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  getUser: () => ({ id: 'test-user-id' }),
}));

jest.mock('@shared/api/albums', () => ({
  getUserImageUrl: () => 'https://example.test/article-image.jpg',
}));

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  })),
  shouldSuppressApiErrorUi: async () => false,
}));

jest.mock('@shared/lib/toast/showArticleEditorToast', () => ({
  showArticleEditorToast: jest.fn(),
}));

const ARTICLE: IArticles = {
  articleId: 'article-nav-test',
  nameArticle: 'Title',
  img: '',
  date: '2026-09-14',
  details: [],
  description: '',
  isDraft: true,
};

function createStore() {
  return configureStore({
    reducer: {
      lang: langReducer,
      uiDictionary: uiDictionaryReducer,
      articles: articlesReducer,
    } as never,
    preloadedState: {
      lang: { current: 'ru' as const },
      uiDictionary: {
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      },
    } as never,
  });
}

function renderEditor(article: IArticles) {
  const store = createStore();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>{children}</Provider>
      </HelmetProvider>
    );
  }

  render(
    <MemoryRouter>
      <EditArticleModalV2 isOpen article={article} onClose={() => undefined} />
    </MemoryRouter>,
    { wrapper: Wrapper }
  );
}

function getRichRoot(blockId: string): HTMLElement {
  const root = document.querySelector(
    `[data-block-id="${blockId}"][data-testid="rich-text-block-editor-rich"]`
  ) as HTMLElement | null;
  if (!root) throw new Error(`Expected rich editor for block ${blockId}`);
  return root;
}

function dispatchDeleteForward(root: HTMLElement) {
  fireEvent(
    root,
    new InputEvent('beforeinput', {
      inputType: 'deleteContentForward',
      bubbles: true,
      cancelable: true,
    })
  );
}

function dispatchBackspaceAtStart(root: HTMLElement) {
  fireEvent(
    root,
    new InputEvent('beforeinput', {
      inputType: 'deleteContentBackward',
      bubbles: true,
      cancelable: true,
    })
  );
}

function dispatchDocumentKey(key: 'Delete' | 'Backspace') {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true })
  );
}

describe('EditArticleModalV2 — text → image → text', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchWithAuthSession).mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: [
              {
                articleId: 'article-nav-test',
                nameArticle: 'Title',
                description: '',
                img: '',
                isDraft: true,
                details: [
                  {
                    type: 'text',
                    blockKind: 'paragraph',
                    blockId: TEXT_A_ID,
                    content: 'Text A',
                  },
                  {
                    type: 'image',
                    blockKind: 'image',
                    blockId: IMAGE_ID,
                    img: 'photo.jpg',
                    caption: '',
                  },
                  {
                    type: 'text',
                    blockKind: 'paragraph',
                    blockId: TEXT_B_ID,
                    content: '',
                  },
                ],
              },
            ],
          }),
        }) as Response
    );
  });

  it('empty Text B at end → first Delete focuses image; second Delete removes image', async () => {
    renderEditor({ ...ARTICLE, articleId: 'article-nav-test' });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Название статьи' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy();
    });

    const richB = getRichRoot(TEXT_B_ID);
    richB.focus();
    restoreSelection(richB, 0, 0);
    dispatchDeleteForward(richB);

    await waitFor(() => {
      expect(
        document.querySelector(
          `[data-block-id="${IMAGE_ID}"].edit-article-v2__block-wrapper--selected`
        )
      ).toBeTruthy();
    });
    expect(document.querySelector(`[data-block-id="${TEXT_A_ID}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-block-id="${TEXT_B_ID}"]`)).toBeTruthy();

    dispatchDocumentKey('Delete');

    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeNull();
    });
    expect(document.querySelector(`[data-block-id="${TEXT_A_ID}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-block-id="${TEXT_B_ID}"]`)).toBeTruthy();

    const richA = getRichRoot(TEXT_A_ID);
    await waitFor(() => {
      expect(document.activeElement).toBe(richA);
    });
  });

  it('start of Text B → first Backspace focuses image; second Backspace removes image', async () => {
    renderEditor({ ...ARTICLE, articleId: 'article-nav-test' });
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy();
    });

    const richB = getRichRoot(TEXT_B_ID);
    richB.focus();
    restoreSelection(richB, 0, 0);
    dispatchBackspaceAtStart(richB);

    await waitFor(() => {
      expect(
        document.querySelector(
          `[data-block-id="${IMAGE_ID}"].edit-article-v2__block-wrapper--selected`
        )
      ).toBeTruthy();
    });

    dispatchDocumentKey('Backspace');

    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeNull();
    });
    expect(document.querySelector(`[data-block-id="${TEXT_A_ID}"]`)).toBeTruthy();

    const richA = getRichRoot(TEXT_A_ID);
    await waitFor(() => {
      expect(document.activeElement).toBe(richA);
    });
  });
});

describe('EditArticleModalV2 — text → carousel → text', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchWithAuthSession).mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: [
              {
                articleId: 'article-nav-test',
                nameArticle: 'Title',
                description: '',
                img: '',
                isDraft: true,
                details: [
                  {
                    type: 'text',
                    blockKind: 'paragraph',
                    blockId: TEXT_A_ID,
                    content: 'Lead',
                  },
                  {
                    type: 'carousel',
                    blockKind: 'carousel',
                    blockId: CAROUSEL_ID,
                    images: [
                      { imageKey: 'a.jpg', caption: '' },
                      { imageKey: 'b.jpg', caption: '' },
                    ],
                  },
                  {
                    type: 'text',
                    blockKind: 'paragraph',
                    blockId: TEXT_B_ID,
                    content: '',
                  },
                ],
              },
            ],
          }),
        }) as Response
    );
  });

  it('empty Text B at end → first Delete focuses carousel; second Delete removes carousel', async () => {
    renderEditor({ ...ARTICLE, articleId: 'article-nav-test' });
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${CAROUSEL_ID}"]`)).toBeTruthy();
    });

    const richB = getRichRoot(TEXT_B_ID);
    richB.focus();
    restoreSelection(richB, 0, 0);
    dispatchDeleteForward(richB);

    await waitFor(() => {
      expect(
        document.querySelector(
          `[data-block-id="${CAROUSEL_ID}"].edit-article-v2__block-wrapper--selected`
        )
      ).toBeTruthy();
    });

    dispatchDocumentKey('Delete');

    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${CAROUSEL_ID}"]`)).toBeNull();
    });
    expect(document.querySelector(`[data-block-id="${TEXT_A_ID}"]`)).toBeTruthy();

    const richA = getRichRoot(TEXT_A_ID);
    await waitFor(() => {
      expect(document.activeElement).toBe(richA);
    });
  });
});
