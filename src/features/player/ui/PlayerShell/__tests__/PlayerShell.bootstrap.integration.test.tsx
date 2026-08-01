import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { PlayerShell } from '../PlayerShell';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { playerListenerMiddleware } from '@features/player/model/middleware/playerListeners';
import { langReducer } from '@shared/model/lang/langSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { resetPlayerSessionBootstrapForTests } from '@features/player/model/lib/bootstrapPlayerSession';

jest.mock('@features/player/model/lib/audioController', () => {
  const mockAudio = {
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
    } as unknown as HTMLAudioElement,
  };
  return { audioController: mockAudio };
});

jest.mock('@features/player/model/lib/playerPersist', () => ({
  savePlayerState: jest.fn(),
  loadPlayerState: jest.fn(),
  clearPlayerState: jest.fn(),
}));

jest.mock('@features/player/ui/AudioPlayer/AudioPlayer', () => ({
  __esModule: true,
  default: () => <div data-testid="audio-player" />,
}));

jest.mock('../MiniPlayer', () => ({
  MiniPlayer: ({ title, isPlaying }: { title: string; isPlaying: boolean }) => (
    <div data-testid="mini-player" data-playing={String(isPlaying)}>
      {title}
    </div>
  ),
}));

jest.mock('@shared/ui/popup', () => ({
  Popup: ({ isActive, children }: { isActive: boolean; children: React.ReactNode }) =>
    isActive ? <div data-testid="player-popup">{children}</div> : null,
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

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { loadPlayerState } from '@features/player/model/lib/playerPersist';

const mockLoadPlayerState = loadPlayerState as jest.MockedFunction<typeof loadPlayerState>;

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

const persistedSession = {
  albumId: 'album-1',
  albumTitle: 'Test Album',
  currentTrackIndex: 0,
  volume: 60,
  isPlaying: false,
  albumMeta: mockAlbumMeta,
  sourceLocation: { pathname: '/ru/albums/album-1', search: '?artist=test' },
  playlist: mockTracks,
  originalPlaylist: mockTracks,
  shuffle: false,
  repeat: 'none' as const,
  time: { current: 15, duration: 180 },
  showLyrics: false,
  controlsVisible: true,
};

function createPlayerShellStore() {
  return configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      popup: popupReducer,
    },
    preloadedState: {
      player: initialPlayerState,
      lang: { current: 'ru' as const },
      popup: { isOpen: false },
    },
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
  });
}

function renderPlayerShell(initialEntries: string[]) {
  const store = createPlayerShellStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        <PlayerShell />
      </MemoryRouter>
    </Provider>
  );
  return { store };
}

describe('PlayerShell bootstrap integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlayerSessionBootstrapForTests();
    mockLoadPlayerState.mockReturnValue(null);

    class ResizeObserverMock {
      observe = jest.fn();
      disconnect = jest.fn();
      unobserve = jest.fn();
    }
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
  });

  test('restores session and shows mini-player without #player hash', async () => {
    mockLoadPlayerState.mockReturnValue(persistedSession);

    const { store } = renderPlayerShell(['/ru/albums/album-1?artist=test']);

    await waitFor(() => {
      expect(store.getState().player.playlist).toHaveLength(1);
    });

    expect(store.getState().player.currentTrackIndex).toBe(0);
    expect(store.getState().player.time.current).toBe(15);
    expect(screen.getByTestId('mini-player')).toBeTruthy();
    expect(screen.getByText('First Track')).toBeTruthy();
    expect(screen.queryByTestId('player-popup')).toBeNull();
  });

  test('restores session and opens fullscreen popup when URL has #player', async () => {
    mockLoadPlayerState.mockReturnValue(persistedSession);

    const { store } = renderPlayerShell(['/ru/albums/album-1?artist=test#player']);

    await waitFor(() => {
      expect(store.getState().player.playlist).toHaveLength(1);
    });

    expect(screen.getByTestId('player-popup')).toBeTruthy();
    expect(screen.getByTestId('audio-player')).toBeTruthy();
    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  test('restores session on a different page without hash (mini-player)', async () => {
    mockLoadPlayerState.mockReturnValue({
      ...persistedSession,
      sourceLocation: { pathname: '/ru/albums/album-1', search: '?artist=test' },
    });

    const { store } = renderPlayerShell(['/ru/?artist=test']);

    await waitFor(() => {
      expect(store.getState().player.playlist).toHaveLength(1);
    });

    expect(screen.getByTestId('mini-player')).toBeTruthy();
    expect(screen.getByText('First Track')).toBeTruthy();
  });

  test('renders nothing when localStorage has no session', async () => {
    mockLoadPlayerState.mockReturnValue(null);

    const { store } = renderPlayerShell(['/ru/albums/album-1?artist=test']);

    await waitFor(() => {
      expect(mockLoadPlayerState).toHaveBeenCalled();
    });

    expect(store.getState().player.playlist).toHaveLength(0);
    expect(screen.queryByTestId('mini-player')).toBeNull();
    expect(screen.queryByTestId('player-popup')).toBeNull();
  });

  test('strips orphan #player hash when there is no playback session', async () => {
    mockLoadPlayerState.mockReturnValue(null);

    renderPlayerShell(['/ru/albums/album-1?artist=test#player']);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        {
          pathname: '/ru/albums/album-1',
          search: '?artist=test',
          hash: '',
        },
        { replace: true }
      );
    });

    expect(screen.queryByTestId('player-popup')).toBeNull();
    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  test('bootstrap runs regardless of hash — loadPlayerState called on mini URL', async () => {
    mockLoadPlayerState.mockReturnValue(null);

    renderPlayerShell(['/ru/?artist=test']);

    await waitFor(() => {
      expect(mockLoadPlayerState).toHaveBeenCalledTimes(1);
    });
  });
});
