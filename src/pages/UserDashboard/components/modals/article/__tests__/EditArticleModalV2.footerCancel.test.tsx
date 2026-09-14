/** @jest-environment jsdom */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';

import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import { useUnsavedNavigationLeaveGuard } from '@shared/lib/hooks/useUnsavedNavigationLeaveGuard';
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function ArticleEditorFooterCancelHarness({ startOpen = true }: { startOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  const [discardRisk, setDiscardRisk] = useState(false);
  const navigate = useNavigate();
  const blocker = useUnsavedNavigationLeaveGuard(Boolean(isOpen && discardRisk));

  return (
    <>
      <LocationProbe />
      <div data-testid="guard-active">{String(Boolean(isOpen && discardRisk))}</div>
      <div data-testid="blocker-state">{blocker.state}</div>
      {isOpen ? (
        <EditArticleModalV2
          isOpen
          article={NEW_ARTICLE}
          onClose={() => setIsOpen(false)}
          onDiscardRiskChange={setDiscardRisk}
        />
      ) : null}
      <button type="button" onClick={() => navigate('/')}>
        Leave dashboard
      </button>
      {blocker.state === 'blocked' ? (
        <>
          <button type="button" onClick={() => blocker.proceed?.()}>
            Confirm leave
          </button>
          <button type="button" onClick={() => blocker.reset?.()}>
            Stay
          </button>
        </>
      ) : null}
    </>
  );
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

function renderHarness() {
  const store = createStore();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>{children}</Provider>
      </HelmetProvider>
    );
  }

  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/posts',
        element: <ArticleEditorFooterCancelHarness />,
      },
      { path: '/', element: <div data-testid="public-home">home</div> },
    ],
    { initialEntries: ['/dashboard/posts'] }
  );

  render(<RouterProvider router={router} />, { wrapper: Wrapper });
  return { router };
}

async function waitForEditor() {
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Article Title' })).toBeTruthy();
  });
}

function makeArticleDirty() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Article Title' }), {
    target: { value: DIRTY_TITLE },
  });
}

async function waitUntilDirty() {
  makeArticleDirty();
  await waitFor(() => {
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });
}

function footerCancelButton() {
  return screen.getByRole('button', { name: 'Cancel' });
}

function discardOverlays() {
  return document.querySelectorAll('.edit-album-modal__inline-discard-overlay');
}

async function waitForDiscardDialog() {
  await waitFor(() => {
    expect(discardOverlays()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
  });
}

describe('EditArticleModalV2 — Footer Cancel uses close confirmation', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    postOk = true;
    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
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
  it('closes the editor without a dialog when Footer Cancel is used on a clean article', async () => {
    renderHarness();
    await waitForEditor();

    expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    fireEvent.click(footerCancelButton());

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Article Title' })).toBeNull();
    });
    expect(discardOverlays()).toHaveLength(0);
  });

  // B
  it('does not close immediately and shows discard confirmation when Footer Cancel is used on a dirty article', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(footerCancelButton());
    await waitForDiscardDialog();

    expect(screen.getByRole('textbox', { name: 'Article Title' })).toHaveValue(DIRTY_TITLE);
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });

  // C
  it('keeps the editor open and the dirty draft after Stay', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(footerCancelButton());
    await waitForDiscardDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    await waitFor(() => {
      expect(discardOverlays()).toHaveLength(0);
    });
    expect(screen.getByRole('textbox', { name: 'Article Title' })).toHaveValue(DIRTY_TITLE);
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toBeDisabled();
  });

  // D
  it('reverts the draft, closes the editor, and clears the leave guard after Discard', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(footerCancelButton());
    await waitForDiscardDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Article Title' })).toBeNull();
    });
    expect(discardOverlays()).toHaveLength(0);
    expect(screen.getByTestId('guard-active')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByTestId('public-home')).toBeTruthy();
    });
  });

  // E
  it('does not discard when Footer Cancel is clicked again while confirmation is open', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(footerCancelButton());
    await waitForDiscardDialog();
    fireEvent.click(footerCancelButton());

    expect(discardOverlays()).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Article Title' })).toHaveValue(DIRTY_TITLE);
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });

  // F
  it('keeps a single discard dialog for the existing close flow', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitForDiscardDialog();
    expect(screen.getByRole('textbox', { name: 'Article Title' })).toHaveValue(DIRTY_TITLE);

    fireEvent.click(footerCancelButton());
    expect(discardOverlays()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(discardOverlays()).toHaveLength(1);
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });

  // G
  it('closes without a dialog when the existing close flow is used on a clean article', async () => {
    renderHarness();
    await waitForEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Article Title' })).toBeNull();
    });
    expect(discardOverlays()).toHaveLength(0);
  });

  // H
  it('closes without confirmation after a successful Save draft', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    });

    fireEvent.click(footerCancelButton());
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Article Title' })).toBeNull();
    });
    expect(discardOverlays()).toHaveLength(0);
  });

  // I
  it('keeps the dirty draft when Stay is chosen after a failed Save draft', async () => {
    postOk = false;
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
    });

    fireEvent.click(footerCancelButton());
    await waitForDiscardDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    await waitFor(() => {
      expect(discardOverlays()).toHaveLength(0);
    });
    expect(screen.getByRole('textbox', { name: 'Article Title' })).toHaveValue(DIRTY_TITLE);
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });

  // J
  it('does not leave the navigation guard active after Discard from Footer Cancel', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(footerCancelButton());
    await waitForDiscardDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('blocker-state')).toHaveTextContent('unblocked');
  });
});
