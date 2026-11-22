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

import { EditArticleModalV2 } from '../EditArticleModalV2';

const IMAGE_ID = 'image-enter';
const CAROUSEL_ID = 'carousel-enter';
const DIVIDER_ID = 'divider-enter';
const PARA_BEFORE_ID = 'para-before';

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
  articleId: 'article-enter-focus',
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

function mockArticleDetails(details: Array<Record<string, unknown>>) {
  jest.mocked(fetchWithAuthSession).mockImplementation(
    async () =>
      ({
        ok: true,
        json: async () => ({
          data: [
            {
              articleId: 'article-enter-focus',
              nameArticle: 'Title',
              description: '',
              img: '',
              isDraft: true,
              details,
            },
          ],
        }),
      }) as Response
  );
}

async function waitForModal() {
  renderEditor();
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Название статьи' })).toBeTruthy();
  });
}

function getNextBlockWrapper(blockId: string): Element | null {
  const current = document.querySelector(`[data-block-id="${blockId}"]`);
  return current?.nextElementSibling ?? null;
}

describe('EditArticleModalV2 — Enter clears media selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Image → Enter creates paragraph, clears yellow selection, focuses new rich text', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: PARA_BEFORE_ID, content: 'A' },
      {
        type: 'image',
        blockKind: 'image',
        blockId: IMAGE_ID,
        img: 'photo.jpg',
        caption: '',
      },
    ]);

    await waitForModal();
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy();
    });

    const imageContainer = document.querySelector(
      `[data-block-id="${IMAGE_ID}"] .edit-article-v2__image-container`
    ) as HTMLDivElement;
    fireEvent.click(imageContainer);

    await waitFor(() => {
      expect(
        document.querySelector(
          `[data-block-id="${IMAGE_ID}"].edit-article-v2__block-wrapper--selected`
        )
      ).toBeTruthy();
    });

    const caption = await waitFor(() => {
      const input = screen.getByLabelText('Подпись к изображению (необязательно)');
      expect(input).toHaveFocus();
      return input as HTMLInputElement;
    });
    fireEvent.keyDown(caption, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      const next = getNextBlockWrapper(IMAGE_ID);
      expect(next?.classList.contains('edit-article-v2__block-wrapper--paragraph')).toBe(true);
    });

    const newRich = await waitFor(() => {
      const next = getNextBlockWrapper(IMAGE_ID);
      const el = next?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!el) throw new Error('Expected new paragraph after image');
      return el as HTMLElement;
    });

    expect(
      document.querySelector(
        `[data-block-id="${IMAGE_ID}"].edit-article-v2__block-wrapper--selected`
      )
    ).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(newRich);
    });

    newRich.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'X',
        bubbles: true,
        cancelable: true,
      })
    );

    await waitFor(() => {
      expect(newRich.textContent).toContain('X');
    });
  });

  it('Carousel → Enter clears selection and focuses new paragraph', async () => {
    mockArticleDetails([
      {
        type: 'carousel',
        blockKind: 'carousel',
        blockId: CAROUSEL_ID,
        images: [
          { imageKey: 'a.jpg', caption: '' },
          { imageKey: 'b.jpg', caption: '' },
        ],
      },
    ]);

    await waitForModal();
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${CAROUSEL_ID}"]`)).toBeTruthy();
    });

    const carouselWrapper = document.querySelector(
      `[data-block-id="${CAROUSEL_ID}"] .edit-article-v2__carousel-image-wrapper`
    ) as HTMLDivElement;
    fireEvent.click(carouselWrapper);

    await waitFor(() => {
      expect(
        document.querySelector(
          `[data-block-id="${CAROUSEL_ID}"].edit-article-v2__block-wrapper--selected`
        )
      ).toBeTruthy();
    });

    const carouselShell = document.querySelector(
      `[data-block-id="${CAROUSEL_ID}"] .edit-article-v2__block--carousel`
    ) as HTMLDivElement;
    carouselShell.focus();
    fireEvent.keyDown(carouselShell, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      const next = getNextBlockWrapper(CAROUSEL_ID);
      expect(next?.classList.contains('edit-article-v2__block-wrapper--paragraph')).toBe(true);
    });

    expect(
      document.querySelector(
        `[data-block-id="${CAROUSEL_ID}"].edit-article-v2__block-wrapper--selected`
      )
    ).toBeNull();

    const newRich = await waitFor(() => {
      const el = document
        .querySelector(`[data-block-id="${CAROUSEL_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!el) throw new Error('Expected rich editor after carousel');
      return el as HTMLElement;
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(newRich);
    });
  });

  it('Divider → Enter clears divider focus and focuses new paragraph', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: PARA_BEFORE_ID, content: 'Before' },
      {
        type: 'text',
        blockKind: 'divider',
        blockId: DIVIDER_ID,
        content: '---',
      },
    ]);

    await waitForModal();
    await waitFor(() => {
      expect(document.querySelector(`[data-block-id="${DIVIDER_ID}"]`)).toBeTruthy();
    });

    const dividerShell = document.querySelector(
      '.edit-article-v2__block--divider'
    ) as HTMLDivElement;
    dividerShell.focus();

    fireEvent.keyDown(dividerShell, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      const next = getNextBlockWrapper(DIVIDER_ID);
      expect(next?.classList.contains('edit-article-v2__block-wrapper--paragraph')).toBe(true);
    });

    const newRich = await waitFor(() => {
      const el = document
        .querySelector(`[data-block-id="${DIVIDER_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!el) throw new Error('Expected rich editor after divider');
      return el as HTMLElement;
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(newRich);
    });
    expect(document.activeElement).not.toBe(dividerShell);
  });
});
