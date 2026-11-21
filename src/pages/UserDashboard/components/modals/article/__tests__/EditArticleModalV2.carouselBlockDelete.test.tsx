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

const CAROUSEL_BLOCK_ID = 'carousel-block-test';

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  getUser: () => ({ id: 'test-user-id' }),
}));

jest.mock('@shared/api/albums', () => ({
  getUserImageUrl: () => 'https://example.test/carousel-slide.jpg',
}));

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(async () => ({
    ok: true,
    json: async () => ({
      data: [
        {
          articleId: 'article-with-carousel',
          nameArticle: 'Title',
          description: '',
          img: '',
          isDraft: true,
          details: [
            {
              type: 'carousel',
              blockKind: 'carousel',
              blockId: CAROUSEL_BLOCK_ID,
              images: [{ imageKey: 'slide-1.jpg', caption: 'x' }, { imageKey: 'slide-2.jpg' }],
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
  articleId: 'article-with-carousel',
  nameArticle: 'Title',
  img: '',
  date: '2026-09-14',
  details: [],
  description: '',
  isDraft: true,
};

function renderEditor() {
  const store = configureStore({
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

describe('EditArticleModalV2 — carousel block Delete/Backspace vs caption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('empty carousel caption → Backspace removes carousel block', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Название статьи' })).toBeTruthy();
    });

    const wrapper = await waitFor(() => {
      const node = document.querySelector(
        `[data-block-id="${CAROUSEL_BLOCK_ID}"] .edit-article-v2__carousel-image-wrapper`
      );
      if (!node) throw new Error('Expected carousel wrapper');
      return node as HTMLDivElement;
    });

    fireEvent.click(wrapper);

    const caption = await waitFor(() => {
      const input = screen.getByLabelText('Подпись к изображению (необязательно)');
      if (!input) throw new Error('Expected carousel caption input');
      return input as HTMLInputElement;
    });
    caption.focus();
    expect(document.activeElement).toBe(caption);

    fireEvent.change(caption, { target: { value: '' } });
    fireEvent.keyDown(caption, { key: 'Backspace', code: 'Backspace' });

    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${CAROUSEL_BLOCK_ID}"]`)).toBeNull();
    });
  });
});
