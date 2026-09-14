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

let postOk = true;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function ArticleEditorLeaveGuardHarness({ startOpen = true }: { startOpen?: boolean }) {
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
      <button type="button" onClick={() => setIsOpen(false)}>
        Unmount editor
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

function renderHarness(options?: { startOpen?: boolean }) {
  const store = createStore();
  const startOpen = options?.startOpen ?? true;

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
        element: <ArticleEditorLeaveGuardHarness startOpen={startOpen} />,
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
    target: { value: 'Dirty title' },
  });
}

async function waitUntilDirty() {
  makeArticleDirty();
  await waitFor(() => {
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });
}

function dispatchBeforeUnload(): BeforeUnloadEvent {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
  Object.defineProperty(event, 'returnValue', { configurable: true, writable: true, value: '' });
  window.dispatchEvent(event);
  return event;
}

describe('EditArticleModalV2 — unsaved navigation leave guard', () => {
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
            data: [{ id: 'db-id', articleId: 'article-1', nameArticle: 'Dirty title' }],
          }),
        } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    });
  });

  // A
  it('does not block navigation when the article is clean', async () => {
    renderHarness();
    await waitForEditor();

    expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));

    await waitFor(() => {
      expect(screen.getByTestId('public-home')).toBeTruthy();
    });
  });

  // B
  it('blocks leaving the dashboard route when the article is dirty', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));

    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/posts');
    expect(screen.queryByTestId('public-home')).toBeNull();
  });

  // C
  it('proceeds with navigation after confirming leave on a dirty article', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm leave' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm leave' }));

    await waitFor(() => {
      expect(screen.getByTestId('public-home')).toBeTruthy();
    });
  });

  // D
  it('keeps navigation blocked when leave is cancelled', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('unblocked');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/posts');
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });

  // E
  it('calls preventDefault on beforeunload while the article is dirty', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
  });

  // F
  it('does not warn on beforeunload when the article is clean', async () => {
    renderHarness();
    await waitForEditor();

    expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  // G
  it('clears the leave guard after a successful Save draft', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByTestId('public-home')).toBeTruthy();
    });
  });

  // H
  it('keeps the leave guard after a failed Save draft', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/posts');
  });

  // I
  it('removes the leave guard when the article modal is closed', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Unmount editor' }));

    await waitFor(() => {
      expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    });
    expect(screen.queryByRole('textbox', { name: 'Article Title' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByTestId('public-home')).toBeTruthy();
    });
  });

  // J
  it('keeps modal-close confirmation and does not also block the dashboard route', async () => {
    renderHarness();
    await waitForEditor();
    await waitUntilDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(document.querySelector('.edit-album-modal__inline-discard-overlay')).toBeTruthy();
    });
    expect(screen.getByTestId('blocker-state')).toHaveTextContent('unblocked');
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/posts');
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });
});
