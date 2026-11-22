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

const PARAGRAPH_BEFORE = 'paragraph-before';
const DIVIDER_BLOCK_ID = 'divider-block-test';
const PARAGRAPH_AFTER = 'paragraph-after';
const IMAGE_BLOCK_ID = 'image-block-test';

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
    json: async () => ({
      data: [
        {
          articleId: 'article-with-divider',
          nameArticle: 'Title',
          description: '',
          img: '',
          isDraft: true,
          details: [
            {
              type: 'text',
              blockKind: 'paragraph',
              blockId: PARAGRAPH_BEFORE,
              content: 'Before divider',
            },
            {
              type: 'text',
              blockKind: 'divider',
              blockId: DIVIDER_BLOCK_ID,
              content: '---',
            },
            {
              type: 'text',
              blockKind: 'paragraph',
              blockId: PARAGRAPH_AFTER,
              content: 'After divider',
            },
          ],
        },
      ],
    }),
  })),
  shouldSuppressApiErrorUi: async () => false,
}));

jest.mock('@shared/lib/toast/showArticleEditorToast', () => ({
  showArticleEditorToast: jest.fn(),
}));

const ARTICLE: IArticles = {
  articleId: 'article-with-divider',
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

function renderEditor() {
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
      <EditArticleModalV2 isOpen article={ARTICLE} onClose={() => undefined} />
    </MemoryRouter>,
    { wrapper: Wrapper }
  );
}

describe('EditArticleModalV2 — divider block Delete/Backspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function waitForEditor() {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Название статьи' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${DIVIDER_BLOCK_ID}"]`)).toBeTruthy();
    });
  }

  function queryDivider() {
    return document.querySelector(`[data-block-id="${DIVIDER_BLOCK_ID}"]`);
  }

  function getRichRoot(blockId: string): HTMLElement {
    const root = document.querySelector(
      `[data-block-id="${blockId}"][data-testid="rich-text-block-editor-rich"]`
    ) as HTMLElement | null;
    if (!root) throw new Error(`Expected rich editor for block ${blockId}`);
    return root;
  }

  it('focused divider → Backspace removes divider', async () => {
    await waitForEditor();

    const dividerShell = document.querySelector(
      '.edit-article-v2__block--divider'
    ) as HTMLDivElement;
    dividerShell.focus();

    fireEvent.keyDown(dividerShell, { key: 'Backspace', code: 'Backspace' });

    await waitFor(() => {
      expect(queryDivider()).toBeNull();
    });
    expect(document.querySelector(`[data-block-id="${PARAGRAPH_BEFORE}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-block-id="${PARAGRAPH_AFTER}"]`)).toBeTruthy();
  });

  it('paragraph after divider at start → Backspace focuses divider, then removes it', async () => {
    await waitForEditor();

    const rich = getRichRoot(PARAGRAPH_AFTER);
    rich.focus();
    restoreSelection(rich, 0, 0);

    fireEvent(
      rich,
      new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      })
    );

    const dividerShell = document.querySelector(
      '.edit-article-v2__block--divider'
    ) as HTMLDivElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(dividerShell);
    });
    expect(queryDivider()).toBeTruthy();

    fireEvent.keyDown(dividerShell, { key: 'Backspace', code: 'Backspace' });

    await waitFor(() => {
      expect(queryDivider()).toBeNull();
    });
    expect(document.querySelector(`[data-block-id="${PARAGRAPH_AFTER}"]`)).toBeTruthy();
  });

  it('paragraph before divider at end → Delete focuses divider, then removes it', async () => {
    await waitForEditor();

    const rich = getRichRoot(PARAGRAPH_BEFORE);
    rich.focus();
    const end = rich.textContent?.length ?? 0;
    restoreSelection(rich, end, end);

    fireEvent(
      rich,
      new InputEvent('beforeinput', {
        inputType: 'deleteContentForward',
        bubbles: true,
        cancelable: true,
      })
    );

    const dividerShell = document.querySelector(
      '.edit-article-v2__block--divider'
    ) as HTMLDivElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(dividerShell);
    });
    expect(queryDivider()).toBeTruthy();

    fireEvent.keyDown(dividerShell, { key: 'Delete', code: 'Delete' });

    await waitFor(() => {
      expect(queryDivider()).toBeNull();
    });
    expect(document.querySelector(`[data-block-id="${PARAGRAPH_BEFORE}"]`)).toBeTruthy();
  });
});

describe('EditArticleModalV2 — image before divider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchWithAuthSession).mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: [
              {
                articleId: 'article-with-divider',
                nameArticle: 'Title',
                description: '',
                img: '',
                isDraft: true,
                details: [
                  {
                    type: 'image',
                    blockKind: 'image',
                    blockId: IMAGE_BLOCK_ID,
                    img: 'photo.jpg',
                    caption: '',
                  },
                  {
                    type: 'text',
                    blockKind: 'divider',
                    blockId: DIVIDER_BLOCK_ID,
                    content: '---',
                  },
                  {
                    type: 'text',
                    blockKind: 'paragraph',
                    blockId: PARAGRAPH_AFTER,
                    content: 'Tail',
                  },
                ],
              },
            ],
          }),
        }) as Response
    );
  });

  it('Backspace at start of paragraph after divider does not remove image block', async () => {
    renderEditor();
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${IMAGE_BLOCK_ID}"]`)).toBeTruthy();
    });

    const rich = document.querySelector(
      `[data-block-id="${PARAGRAPH_AFTER}"][data-testid="rich-text-block-editor-rich"]`
    ) as HTMLElement;
    rich.focus();
    restoreSelection(rich, 0, 0);

    fireEvent(
      rich,
      new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      })
    );

    await waitFor(() => {
      expect(document.activeElement?.classList.contains('edit-article-v2__block--divider')).toBe(
        true
      );
    });
    expect(document.querySelector(`[data-block-id="${DIVIDER_BLOCK_ID}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-block-id="${IMAGE_BLOCK_ID}"]`)).toBeTruthy();
  });
});
