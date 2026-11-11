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

import { EditArticleModalV2 } from '../EditArticleModalV2';

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
          articleId: 'article-with-image',
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
  articleId: 'article-with-image',
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

describe('EditArticleModalV2 — delete selected image block while caption focused', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function selectImageAndFocusCaption() {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Название статьи' })).toBeTruthy();
    });

    const imageContainer = await waitFor(() => {
      const container = document.querySelector(
        `[data-block-id="${IMAGE_BLOCK_ID}"] .edit-article-v2__image-container`
      );
      if (!container) throw new Error('Expected image block container');
      return container as HTMLDivElement;
    });

    fireEvent.click(imageContainer);

    const caption = await waitFor(() => {
      const input = screen.getByLabelText('Подпись к изображению (необязательно)');
      expect(input).toHaveFocus();
      return input as HTMLInputElement;
    });

    expect(document.activeElement).toBe(caption);
    return caption;
  }

  it.each(['Delete', 'Backspace'] as const)(
    'select image → caption focused → %s removes image block',
    async (key) => {
      const caption = await selectImageAndFocusCaption();
      fireEvent.keyDown(caption, { key, code: key });

      await waitFor(() => {
        expect(document.querySelector(`[data-block-id="${IMAGE_BLOCK_ID}"]`)).toBeNull();
      });
    }
  );
});
