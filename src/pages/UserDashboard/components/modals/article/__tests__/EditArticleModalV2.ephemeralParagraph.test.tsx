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
import { blocksToDetails } from '../EditArticleModalV2.utils';

const TEXT_A_ID = 'text-a';
const IMAGE_ID = 'image-ephemeral';
const CAROUSEL_ID = 'carousel-ephemeral';
const DIVIDER_ID = 'divider-ephemeral';

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  getUser: () => ({ id: 'test-user-id' }),
}));

jest.mock('@shared/api/albums', () => ({
  getUserImageUrl: () => 'https://example.test/article-image.jpg',
}));

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
  shouldSuppressApiErrorUi: async () => false,
}));

jest.mock('@shared/lib/toast/showArticleEditorToast', () => ({
  showArticleEditorToast: jest.fn(),
}));

const ARTICLE: IArticles = {
  articleId: 'article-ephemeral',
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

async function waitForModal() {
  renderEditor();
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Название статьи' })).toBeTruthy();
  });
}

function mockArticleDetails(details: Array<Record<string, unknown>>) {
  jest.mocked(fetchWithAuthSession).mockImplementation(
    async () =>
      ({
        ok: true,
        json: async () => ({
          data: [
            {
              articleId: 'article-ephemeral',
              nameArticle: 'Title',
              img: '',
              isDraft: true,
              details,
            },
          ],
        }),
      }) as Response
  );
}

function countParagraphsAfter(blockId: string): number {
  let next = document.querySelector(`[data-block-id="${blockId}"]`)?.nextElementSibling;
  let count = 0;
  while (next?.classList.contains('edit-article-v2__block-wrapper--paragraph')) {
    count += 1;
    next = next.nextElementSibling;
  }
  return count;
}

async function enterFromImageCaption() {
  const imageContainer = await waitFor(() => {
    const el = document.querySelector(
      `[data-block-id="${IMAGE_ID}"] .edit-article-v2__image-container`
    );
    if (!el) throw new Error('image container');
    return el as HTMLDivElement;
  });
  fireEvent.click(imageContainer);
  const caption = await waitFor(() => {
    const input = screen.getByLabelText('Подпись к изображению (необязательно)');
    expect(input).toHaveFocus();
    return input as HTMLInputElement;
  });
  fireEvent.keyDown(caption, { key: 'Enter', code: 'Enter' });
}

async function blurEphemeralRichText(rich: HTMLElement) {
  rich.blur();
  const title = screen.getByRole('textbox', {
    name: 'Название статьи',
  }) as HTMLTextAreaElement;
  title.focus();
  await waitFor(() => expect(document.activeElement).toBe(title));
}

function clickUndoButton() {
  fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
}

describe('EditArticleModalV2 — ephemeral paragraph after media', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Image → Enter → blur without typing removes empty paragraph', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: TEXT_A_ID, content: 'A' },
      { type: 'image', blockKind: 'image', blockId: IMAGE_ID, img: 'photo.jpg', caption: '' },
    ]);

    await waitForModal();
    await waitFor(() =>
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy()
    );

    await enterFromImageCaption();
    const rich = await waitFor(() => {
      const next = document
        .querySelector(`[data-block-id="${IMAGE_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!next) throw new Error('expected rich after image');
      return next as HTMLElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(rich));
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(1));

    await blurEphemeralRichText(rich);
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(0));
  });

  it('Image → Enter → typing keeps paragraph', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: TEXT_A_ID, content: 'A' },
      { type: 'image', blockKind: 'image', blockId: IMAGE_ID, img: 'photo.jpg', caption: '' },
    ]);

    await waitForModal();
    await waitFor(() =>
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy()
    );

    await enterFromImageCaption();
    const rich = await waitFor(() => {
      const next = document
        .querySelector(`[data-block-id="${IMAGE_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!next) throw new Error('expected rich after image');
      return next as HTMLElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(rich));

    rich.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'Новый',
        bubbles: true,
        cancelable: true,
      })
    );

    await waitFor(() => expect(rich.textContent).toContain('Новый'));
    await blurEphemeralRichText(rich);
    expect(countParagraphsAfter(IMAGE_ID)).toBe(1);
  });

  it('Image → Enter → blur → Enter again reuses paragraph (no duplicate)', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: TEXT_A_ID, content: 'A' },
      { type: 'image', blockKind: 'image', blockId: IMAGE_ID, img: 'photo.jpg', caption: '' },
    ]);

    await waitForModal();
    await waitFor(() =>
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy()
    );

    await enterFromImageCaption();
    const rich1 = await waitFor(() => {
      const next = document
        .querySelector(`[data-block-id="${IMAGE_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!next) throw new Error('expected rich after image');
      return next as HTMLElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(rich1));
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(1));
    await blurEphemeralRichText(rich1);
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(0));

    await enterFromImageCaption();
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(1));
  });

  it('Image → Enter → empty Text B → focus Image removes Text B', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: TEXT_A_ID, content: 'A' },
      { type: 'image', blockKind: 'image', blockId: IMAGE_ID, img: 'photo.jpg', caption: '' },
    ]);

    await waitForModal();
    await waitFor(() =>
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy()
    );

    await enterFromImageCaption();
    const rich = await waitFor(() => {
      const next = document
        .querySelector(`[data-block-id="${IMAGE_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!next) throw new Error('expected rich after image');
      return next as HTMLElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(rich));
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(1));

    const imageContainer = document.querySelector(
      `[data-block-id="${IMAGE_ID}"] .edit-article-v2__image-container`
    ) as HTMLDivElement;
    fireEvent.click(imageContainer);
    await waitFor(() => {
      const input = screen.getByLabelText('Подпись к изображению (необязательно)');
      expect(input).toHaveFocus();
    });

    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(0));
  });

  it('empty ephemeral paragraph is omitted from saved details shape', async () => {
    const details = blocksToDetails([
      { id: TEXT_A_ID, type: 'paragraph', content: [{ text: 'A', marks: [] }] },
      { id: IMAGE_ID, type: 'image', imageKey: 'photo.jpg', caption: '' },
    ]);
    expect(details.some((d) => d.blockId === IMAGE_ID)).toBe(true);
    expect(details.filter((d) => d.blockKind === 'paragraph')).toHaveLength(1);
  });

  it('Carousel → Enter → blur removes ephemeral paragraph', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: TEXT_A_ID, content: 'A' },
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
    await waitFor(() =>
      expect(document.querySelector(`[data-block-id="${CAROUSEL_ID}"]`)).toBeTruthy()
    );

    const carouselShell = document.querySelector(
      `[data-block-id="${CAROUSEL_ID}"] .edit-article-v2__block--carousel`
    ) as HTMLDivElement;
    fireEvent.click(
      document.querySelector(
        `[data-block-id="${CAROUSEL_ID}"] .edit-article-v2__carousel-image-wrapper`
      ) as HTMLDivElement
    );
    carouselShell.focus();
    fireEvent.keyDown(carouselShell, { key: 'Enter', code: 'Enter' });

    const rich = await waitFor(() => {
      const next = document
        .querySelector(`[data-block-id="${CAROUSEL_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!next) throw new Error('expected rich after carousel');
      return next as HTMLElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(rich));
    await waitFor(() => expect(countParagraphsAfter(CAROUSEL_ID)).toBe(1));
    await blurEphemeralRichText(rich);
    await waitFor(() => expect(countParagraphsAfter(CAROUSEL_ID)).toBe(0));
  });

  it('Undo after ephemeral removal restores empty paragraph without extra blocks', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: TEXT_A_ID, content: 'A' },
      { type: 'image', blockKind: 'image', blockId: IMAGE_ID, img: 'photo.jpg', caption: '' },
    ]);

    await waitForModal();
    await waitFor(() =>
      expect(document.querySelector(`[data-block-id="${IMAGE_ID}"]`)).toBeTruthy()
    );

    await enterFromImageCaption();
    const rich = await waitFor(() => {
      const next = document
        .querySelector(`[data-block-id="${IMAGE_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!next) throw new Error('expected rich after image');
      return next as HTMLElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(rich));
    await blurEphemeralRichText(rich);
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(0));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отменить' })).not.toHaveAttribute('disabled');
    });
    clickUndoButton();
    await waitFor(() => expect(countParagraphsAfter(IMAGE_ID)).toBe(1));
  });

  it('Divider → Enter → blur removes ephemeral paragraph', async () => {
    mockArticleDetails([
      { type: 'text', blockKind: 'paragraph', blockId: TEXT_A_ID, content: 'A' },
      { type: 'text', blockKind: 'divider', blockId: DIVIDER_ID, content: '---' },
    ]);

    await waitForModal();
    await waitFor(() =>
      expect(document.querySelector(`[data-block-id="${DIVIDER_ID}"]`)).toBeTruthy()
    );

    const dividerShell = document.querySelector(
      '.edit-article-v2__block--divider'
    ) as HTMLDivElement;
    dividerShell.focus();
    fireEvent.keyDown(dividerShell, { key: 'Enter', code: 'Enter' });

    const rich = await waitFor(() => {
      const next = document
        .querySelector(`[data-block-id="${DIVIDER_ID}"]`)
        ?.nextElementSibling?.querySelector('[data-testid="rich-text-block-editor-rich"]');
      if (!next) throw new Error('expected rich after divider');
      return next as HTMLElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(rich));
    await waitFor(() => expect(countParagraphsAfter(DIVIDER_ID)).toBe(1));
    await blurEphemeralRichText(rich);
    await waitFor(() => expect(countParagraphsAfter(DIVIDER_ID)).toBe(0));
  });
});
