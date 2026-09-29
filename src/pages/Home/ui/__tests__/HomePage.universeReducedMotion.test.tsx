import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

jest.mock('@shared/lib/payment/devPaymentMode', () => ({
  logDevPaymentSubscriptionRedirect: jest.fn(),
}));

jest.mock('@shared/lib/scheduleAfterPostPaint', () => ({
  scheduleAfterPostPaint: (onReady: () => void) => {
    onReady();
    return () => {};
  },
}));

jest.mock('@features/universeSearch', () => ({
  UniverseFloatingSearch: () => null,
}));

const universeDestroyMock = jest.fn();
const Universe3DConstructorMock = jest.fn();

const loadUniverse3DModuleMock = jest.fn(() =>
  Promise.resolve({
    Universe3D: class Universe3D {
      constructor(...args: unknown[]) {
        Universe3DConstructorMock(...args);
      }
      destroy() {
        universeDestroyMock();
      }
      setSearchHighlight() {}
      navigateToArtistFromSearch() {}
      focusOnArtist() {}
    },
  })
);

jest.mock('@/components/view/loadUniverse3DModule', () => ({
  loadUniverse3DModule: () => loadUniverse3DModuleMock(),
}));

jest.mock('@shared/lib/auth', () => ({
  isAuthenticated: () => false,
}));

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => ({
    isOwner: false,
    ownerResolved: true,
    showOnboarding: false,
    showOnboardingSkeleton: false,
    showNotFound: false,
    showVisitorUnderConstruction: false,
    showArtistPageSkeleton: false,
    albumsSurfaceReady: false,
    pageReady: false,
    builderVisibility: { canShowBlocks: false },
    hasPublicReleases: false,
  }),
}));

jest.mock('@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted', () => ({
  useRedirectHomeAfterOwnAccountDeleted: () => false,
}));

import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { HomePage } from '../HomePage';

const uiDictionary = {
  menu: {},
  header: { signIn: 'Sign in' },
  titles: { albums: 'Albums', articles: 'Articles', theBand: 'The Band' },
  buttons: { show: 'Show more' },
};

type MatchMediaListener = () => void;

function installMatchMedia(reducedMotion: boolean) {
  const listeners = new Set<MatchMediaListener>();
  const state = { reducedMotion };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn((query: string) => ({
      get matches() {
        return query.includes('prefers-reduced-motion') ? state.reducedMotion : false;
      },
      media: query,
      addEventListener: (_event: string, listener: MatchMediaListener) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: MatchMediaListener) => {
        listeners.delete(listener);
      },
      dispatchEvent: jest.fn(),
    })),
  });
  return {
    setReducedMotion(next: boolean) {
      state.reducedMotion = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function renderHomeScene() {
  const store = configureStore({
    reducer: {
      lang: langReducer,
      uiDictionary: uiDictionaryReducer,
      player: playerReducer,
      popup: popupReducer,
    } as never,
    preloadedState: {
      lang: { current: 'en' },
      uiDictionary: {
        en: {
          status: 'succeeded',
          error: null,
          data: [uiDictionary],
          lastUpdated: Date.now(),
        },
        ru: { status: 'idle', error: null, data: [], lastUpdated: null },
      },
      popup: { isOpen: false },
    } as never,
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>
          <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
        </Provider>
      </HelmetProvider>
    );
  }

  render(<HomePage />, { wrapper: Wrapper });
}

describe('HomePage Universe3D and prefers-reduced-motion', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    loadUniverse3DModuleMock.mockClear();
    Universe3DConstructorMock.mockClear();
    universeDestroyMock.mockClear();
    installMatchMedia(false);

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/public-artists')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [{ name: 'Artist', publicSlug: 'artist', genreCode: 'rock' }],
          }),
        }) as Promise<Response>;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      }) as Promise<Response>;
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('prefers-reduced-motion: does not load Universe3D module or construct Universe3D', async () => {
    installMatchMedia(true);
    renderHomeScene();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(loadUniverse3DModuleMock).not.toHaveBeenCalled();
    expect(Universe3DConstructorMock).not.toHaveBeenCalled();
  });

  test('normal motion: loads Universe3D after artists bootstrap', async () => {
    renderHomeScene();

    await waitFor(() => {
      expect(loadUniverse3DModuleMock).toHaveBeenCalled();
      expect(Universe3DConstructorMock).toHaveBeenCalled();
    });
  });

  test('transition normal → reduce destroys active Universe3D', async () => {
    const media = installMatchMedia(false);
    renderHomeScene();

    await waitFor(() => {
      expect(Universe3DConstructorMock).toHaveBeenCalled();
    });

    await act(async () => {
      media.setReducedMotion(true);
    });

    await waitFor(() => {
      expect(universeDestroyMock).toHaveBeenCalled();
    });
  });
});
