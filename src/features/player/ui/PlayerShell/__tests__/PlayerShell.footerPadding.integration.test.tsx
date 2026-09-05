import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { PlayerShell } from '../PlayerShell';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { playerListenerMiddleware } from '@features/player/model/middleware/playerListeners';
import { langReducer } from '@shared/model/lang/langSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { resetPlayerSessionBootstrapForTests } from '@features/player/model/lib/bootstrapPlayerSession';
import { measureFixedElementBottomInset } from '@shared/lib/layout';

const MINI_PLAYER_HEIGHT = 64;
const MINI_PLAYER_BOTTOM = 12;

jest.mock('@features/player/model/lib/audioController', () => ({
  audioController: {
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    setSource: jest.fn(),
    setCurrentTime: jest.fn(),
    setVolume: jest.fn(),
    element: {
      currentTime: 0,
      duration: 180,
      readyState: 0,
      src: '',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  },
}));

jest.mock('@features/player/model/lib/playerPersist', () => ({
  savePlayerState: jest.fn(),
  loadPlayerState: jest.fn(() => null),
  clearPlayerState: jest.fn(),
}));

jest.mock('../loadAudioPlayerModule', () => ({
  loadAudioPlayerModule: () =>
    Promise.resolve({
      default: () => <div data-testid="audio-player" />,
    }),
}));

jest.mock('@features/player/ui/AudioPlayer/AudioPlayer', () => ({
  __esModule: true,
  default: () => <div data-testid="audio-player" />,
}));

jest.mock('../MiniPlayer', () => ({
  MiniPlayer: ({
    containerRef,
    title,
  }: {
    containerRef?: React.Ref<HTMLDivElement>;
    title: string;
  }) => (
    <div
      ref={(node) => {
        if (node) {
          node.style.position = 'fixed';
          node.style.bottom = `${MINI_PLAYER_BOTTOM}px`;
          Object.defineProperty(node, 'offsetHeight', {
            configurable: true,
            value: MINI_PLAYER_HEIGHT,
          });
        }

        if (typeof containerRef === 'function') {
          containerRef(node);
          return;
        }

        if (containerRef && typeof containerRef === 'object') {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      }}
      data-testid="mini-player"
      className="mini-player"
    >
      {title}
    </div>
  ),
}));

jest.mock('@shared/ui/popup', () => ({
  Popup: () => null,
  PopupHamburgerToggle: () => null,
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' as const }),
}));

jest.mock('@shared/lib/dashboardModalShellContext', () => ({
  useDashboardModalShell: () => ({ overlayOpen: false, surfaceLocation: null }),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({ displayName: 'Test Artist', isLoading: false }),
}));

jest.mock('@shared/lib/profileDisplayName', () => ({
  formatAlbumDisplayFullName: (artist: string, album: string) => `${artist} — ${album}`,
  readStoredProfileDisplayName: () => '',
}));

const mockTracks: PlayerTrack[] = [
  {
    id: 'track-1',
    title: 'First Track',
    duration: 180,
    src: 'https://example.com/track1.mp3',
  },
];

const mockAlbumMeta = {
  albumId: 'album-1',
  userId: 'user-1',
  album: 'Test Album',
  artist: 'Test Artist',
  fullName: 'Test Artist — Test Album',
  cover: null,
};

function NavigationTrigger() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      data-testid="navigate-to-album"
      onClick={() => navigate('/ru/albums/album-1?artist=test')}
    >
      Navigate
    </button>
  );
}

function TestLayout() {
  return (
    <>
      <NavigationTrigger />
      <Routes>
        <Route path="/ru" element={<PlayerShell />} />
        <Route
          path="/ru/albums/:albumId"
          element={
            <>
              <footer role="contentinfo" data-testid="site-footer">
                Footer
              </footer>
              <PlayerShell />
            </>
          }
        />
      </Routes>
    </>
  );
}

function renderPlayerShellLayout(initialEntry: string) {
  const store = configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      popup: popupReducer,
    },
    preloadedState: {
      player: {
        ...initialPlayerState,
        albumId: mockAlbumMeta.albumId,
        albumTitle: mockAlbumMeta.album,
        albumMeta: mockAlbumMeta,
        playlist: mockTracks,
        originalPlaylist: mockTracks,
        currentTrackIndex: 0,
        sourceLocation: { pathname: '/ru', search: '' },
      },
      lang: { current: 'ru' as const },
      popup: { isOpen: false },
    },
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
  });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <TestLayout />
      </MemoryRouter>
    </Provider>
  );

  return { store };
}

describe('PlayerShell footer padding integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlayerSessionBootstrapForTests();

    class ResizeObserverMock {
      observe = jest.fn();
      disconnect = jest.fn();
      unobserve = jest.fn();
    }
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  test('reserves footer space after navigating from home without footer to a page with footer', async () => {
    renderPlayerShellLayout('/ru');

    await waitFor(() => {
      expect(screen.getByTestId('mini-player')).toBeTruthy();
    });

    expect(document.querySelector('footer[role="contentinfo"]')).toBeNull();

    fireEvent.click(screen.getByTestId('navigate-to-album'));

    await waitFor(() => {
      expect(screen.getByTestId('site-footer')).toBeTruthy();
    });

    const footerEl = document.querySelector('footer[role="contentinfo"]') as HTMLElement;
    const playerEl = screen.getByTestId('mini-player') as HTMLElement;
    const expectedPadding = `${measureFixedElementBottomInset(playerEl)}px`;

    await waitFor(() => {
      expect(footerEl.style.paddingBottom).toBe(expectedPadding);
    });

    expect(expectedPadding).toBe(`${MINI_PLAYER_HEIGHT + MINI_PLAYER_BOTTOM}px`);
  });
});
