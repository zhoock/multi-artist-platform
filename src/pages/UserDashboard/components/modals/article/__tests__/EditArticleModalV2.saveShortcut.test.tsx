/** @jest-environment jsdom */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';

import { langReducer } from '@shared/model/lang/langSlice';
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

import { showArticleEditorToast } from '@shared/lib/toast/showArticleEditorToast';
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

const NEW_ARTICLE: IArticles = {
  articleId: 'new-test-article',
  nameArticle: '',
  img: '',
  date: '2026-09-14',
  details: [],
  description: '',
  isDraft: true,
};

const DIRTY_TITLE = 'Dirty title';

let postOk = true;
let holdSave: Promise<void> | null = null;

const showArticleEditorToastMock = showArticleEditorToast as jest.MockedFunction<
  typeof showArticleEditorToast
>;

function parseBody(init: RequestInit | undefined): Record<string, unknown> | null {
  if (!init?.body || typeof init.body !== 'string') return null;
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function countDraftSaves(): number {
  return fetchWithAuthSessionMock.mock.calls.filter((call) => {
    const init = call[1] as RequestInit | undefined;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'POST' && method !== 'PUT') return false;
    const body = parseBody(init);
    return body?.isDraft === true;
  }).length;
}

function countPublishSaves(): number {
  return fetchWithAuthSessionMock.mock.calls.filter((call) => {
    const init = call[1] as RequestInit | undefined;
    const body = parseBody(init);
    return body?.isDraft === false;
  }).length;
}

function dispatchSaveShortcut(modifier: 'meta' | 'ctrl'): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 's',
    metaKey: modifier === 'meta',
    ctrlKey: modifier === 'ctrl',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function createStore() {
  return configureStore({
    reducer: {
      lang: langReducer,
      uiDictionary: uiDictionaryReducer,
      articles: articlesReducer,
    } as never,
    preloadedState: {
      lang: { current: 'en' as const },
      uiDictionary: {
        ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        en: {
          status: 'succeeded' as const,
          error: null,
          data: [
            {
              dashboard: {
                closeDiscardConfirm: {
                  message: 'Unsaved changes will be lost.',
                  stay: 'Stay',
                  discard: 'Discard',
                },
              },
            },
          ] as never,
          lastUpdated: Date.now(),
        },
      },
    } as never,
  });
}

function ArticleEditorSaveShortcutHarness({ startOpen = true }: { startOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  return (
    <>
      {isOpen ? (
        <EditArticleModalV2 isOpen article={NEW_ARTICLE} onClose={() => setIsOpen(false)} />
      ) : null}
      <button type="button" onClick={() => setIsOpen(true)}>
        Open editor
      </button>
      <button type="button" onClick={() => setIsOpen(false)}>
        Close editor
      </button>
    </>
  );
}

function renderEditor(options?: { startOpen?: boolean }) {
  const store = createStore();
  const startOpen = options?.startOpen ?? true;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>{children}</Provider>
      </HelmetProvider>
    );
  }

  render(
    <MemoryRouter initialEntries={['/dashboard/posts']}>
      <ArticleEditorSaveShortcutHarness startOpen={startOpen} />
    </MemoryRouter>,
    { wrapper: Wrapper }
  );
}

async function waitForEditor() {
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Article Title' })).toBeTruthy();
  });
}

async function waitUntilDirty() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Article Title' }), {
    target: { value: DIRTY_TITLE },
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toBeDisabled();
  });
}

describe('EditArticleModalV2 — Cmd/Ctrl+S saves draft', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    showArticleEditorToastMock.mockReset();
    postOk = true;
    holdSave = null;
    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'POST' || method === 'PUT') {
        if (holdSave) await holdSave;
        if (!postOk) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'Save failed' }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 'db-id', articleId: 'article-1', nameArticle: DIRTY_TITLE }],
          }),
        } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    });
  });

  // A
  it('does not save when the article editor is closed', () => {
    renderEditor({ startOpen: false });
    const event = dispatchSaveShortcut('meta');
    dispatchSaveShortcut('ctrl');
    expect(event.defaultPrevented).toBe(false);
    expect(countDraftSaves()).toBe(0);
    expect(countPublishSaves()).toBe(0);
  });

  // B
  it('saves a dirty article once with Cmd+S and preventDefault', async () => {
    renderEditor();
    await waitForEditor();
    await waitUntilDirty();

    const event = dispatchSaveShortcut('meta');
    expect(event.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(countDraftSaves()).toBe(1);
    });
    expect(countPublishSaves()).toBe(0);
  });

  // C
  it('saves a dirty article once with Ctrl+S and preventDefault', async () => {
    renderEditor();
    await waitForEditor();
    await waitUntilDirty();

    const event = dispatchSaveShortcut('ctrl');
    expect(event.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(countDraftSaves()).toBe(1);
    });
    expect(countPublishSaves()).toBe(0);
  });

  // D
  it('does not POST when the editor is clean, matching the disabled Save draft button', async () => {
    renderEditor();
    await waitForEditor();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

    dispatchSaveShortcut('meta');
    dispatchSaveShortcut('ctrl');

    expect(countDraftSaves()).toBe(0);
    expect(countPublishSaves()).toBe(0);
  });

  // E
  it('does not start a concurrent save while a save is in flight', async () => {
    let releaseSave: (() => void) | undefined;
    holdSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });

    renderEditor();
    await waitForEditor();
    await waitUntilDirty();

    await act(async () => {
      dispatchSaveShortcut('meta');
    });
    await waitFor(() => {
      expect(countDraftSaves()).toBe(1);
    });

    await act(async () => {
      dispatchSaveShortcut('meta');
      dispatchSaveShortcut('ctrl');
      dispatchSaveShortcut('meta');
    });
    expect(countDraftSaves()).toBe(1);
    expect(countPublishSaves()).toBe(0);

    await act(async () => {
      releaseSave?.();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    });
    expect(countDraftSaves()).toBe(1);
  });

  // F
  it('keeps dirty state after a failed shortcut save and allows retry', async () => {
    postOk = false;
    renderEditor();
    await waitForEditor();
    await waitUntilDirty();

    await act(async () => {
      dispatchSaveShortcut('meta');
    });
    await waitFor(() => {
      expect(showArticleEditorToastMock).toHaveBeenCalled();
    });
    expect(
      showArticleEditorToastMock.mock.calls.some(
        (call) => (call[0] as { kind?: string }).kind === 'error'
      )
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Article Title' })).toHaveValue(DIRTY_TITLE);

    await act(async () => {
      dispatchSaveShortcut('ctrl');
    });
    await waitFor(() => {
      expect(countDraftSaves()).toBe(2);
    });
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toBeDisabled();
  });

  // G
  it('does not POST again after a successful shortcut save', async () => {
    renderEditor();
    await waitForEditor();
    await waitUntilDirty();

    await act(async () => {
      dispatchSaveShortcut('meta');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    });
    expect(countDraftSaves()).toBe(1);

    dispatchSaveShortcut('meta');
    dispatchSaveShortcut('ctrl');
    expect(countDraftSaves()).toBe(1);
    expect(countPublishSaves()).toBe(0);
  });

  // H
  it('never publishes from Cmd/Ctrl+S', async () => {
    renderEditor();
    await waitForEditor();
    await waitUntilDirty();

    await act(async () => {
      dispatchSaveShortcut('meta');
      dispatchSaveShortcut('ctrl');
    });
    await waitFor(() => {
      expect(countDraftSaves()).toBeGreaterThan(0);
    });
    expect(countPublishSaves()).toBe(0);
  });

  // I
  it('does not steal Undo, Redo, Select All, or plain typing', async () => {
    renderEditor();
    await waitForEditor();
    await waitUntilDirty();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true })
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true })
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })
    );

    await waitFor(() => {
      expect(document.querySelector('[data-document-selected="true"]')).toBeTruthy();
    });
    expect(countDraftSaves()).toBe(0);

    const title = screen.getByRole('textbox', { name: 'Article Title' });
    fireEvent.change(title, { target: { value: `${DIRTY_TITLE}s` } });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true })
    );

    expect(countDraftSaves()).toBe(0);
    expect(title).toHaveValue(`${DIRTY_TITLE}s`);
  });

  // J
  it('attaches the shortcut only while the editor is open and does not stack listeners', async () => {
    renderEditor({ startOpen: false });
    dispatchSaveShortcut('meta');
    expect(countDraftSaves()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }));
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.change(screen.getByRole('textbox', { name: 'Article Title' }), {
      target: { value: `${DIRTY_TITLE} more` },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Article Title' }), {
      target: { value: `${DIRTY_TITLE} again` },
    });

    await act(async () => {
      dispatchSaveShortcut('meta');
    });
    await waitFor(() => {
      expect(countDraftSaves()).toBe(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Article Title' })).toBeNull();
    });

    dispatchSaveShortcut('meta');
    dispatchSaveShortcut('ctrl');
    expect(countDraftSaves()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }));
    await waitForEditor();
    await waitUntilDirty();
    await act(async () => {
      dispatchSaveShortcut('ctrl');
    });
    await waitFor(() => {
      expect(countDraftSaves()).toBe(2);
    });
  });
});
