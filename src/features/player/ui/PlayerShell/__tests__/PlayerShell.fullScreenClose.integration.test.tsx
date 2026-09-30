/**
 * Regression: closing Full Player must not stop audio or desync mini-player isPlaying.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { PlayerShell } from '../PlayerShell';
import { playerReducer, playerActions } from '@features/player/model/slice/playerSlice';
import { playerListenerMiddleware } from '@features/player/model/middleware/playerListeners';
import { langReducer } from '@shared/model/lang/langSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { resetPlayerSessionBootstrapForTests } from '@features/player/model/lib/bootstrapPlayerSession';
import { audioController } from '@features/player/model/lib/audioController';

jest.mock('@features/player/model/lib/playerPersist', () => ({
  savePlayerState: jest.fn(),
  loadPlayerState: jest.fn(() => null),
  clearPlayerState: jest.fn(),
}));

jest.mock('../MiniPlayer', () => ({
  MiniPlayer: ({ title, isPlaying }: { title: string; isPlaying: boolean }) => (
    <div data-testid="mini-player" data-playing={String(isPlaying)}>
      {title}
    </div>
  ),
}));

jest.mock('../loadAudioPlayerModule', () => ({
  loadAudioPlayerModule: () =>
    Promise.resolve({
      default: function MockFullAudioPlayer() {
        React.useEffect(() => {
          audioController.ensureElementInDocument();
          return () => {
            // Previously the real AudioPlayer reparented audio into this subtree;
            // unmount must not remove audio from the persistent mount host.
          };
        }, []);
        return <div data-testid="audio-player" />;
      },
    }),
}));

jest.mock('@shared/ui/popup', () => ({
  Popup: ({
    isActive,
    children,
    onClose,
  }: {
    isActive: boolean;
    children: React.ReactNode;
    onClose?: () => void;
  }) =>
    isActive ? (
      <div data-testid="player-popup">
        <button type="button" data-testid="close-full-player" onClick={() => onClose?.()}>
          Close
        </button>
        {children}
      </div>
    ) : null,
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
  publicSlug: 'test-artist',
};

function createPlayerStore(isPlaying: boolean) {
  return configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      popup: popupReducer,
    },
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
    preloadedState: {
      player: {
        ...initialPlayerState,
        playlist: mockTracks,
        originalPlaylist: mockTracks,
        currentTrackIndex: 0,
        albumMeta: mockAlbumMeta,
        albumId: 'album-1',
        albumTitle: 'Test Album',
        isPlaying,
        sourceLocation: { pathname: '/ru/albums/album-1', search: '?artist=test' },
      },
      lang: { current: 'ru' as const },
      popup: { isOpen: false },
    },
  });
}

function renderPlayerShellAt(initialEntry: string, isPlaying: boolean) {
  const store = createPlayerStore(isPlaying);

  const playSpy = jest
    .spyOn(audioController.element, 'play')
    .mockImplementation(() => Promise.resolve());
  const pauseSpy = jest.spyOn(audioController.element, 'pause').mockImplementation(() => {});

  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <PlayerShell />
      </MemoryRouter>
    </Provider>
  );

  return { store, view, playSpy, pauseSpy };
}

describe('PlayerShell Full Player close regression', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = jest.fn();
      disconnect = jest.fn();
      unobserve = jest.fn();
    }
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    resetPlayerSessionBootstrapForTests();
    document.querySelectorAll('[data-player-audio-mount]').forEach((n) => n.remove());
    audioController.ensureElementInDocument();
    jest.clearAllMocks();
  });

  test('playing -> close Full Player -> playback continues -> Mini Player remains in Playing state', async () => {
    const { store, playSpy, pauseSpy } = renderPlayerShellAt(
      '/ru/albums/album-1?artist=test#player',
      true
    );

    await waitFor(() => {
      expect(screen.getByTestId('player-popup')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('audio-player')).toBeTruthy();
    });

    expect(document.body.contains(audioController.element)).toBe(true);

    const hostBefore = document.querySelector('[data-player-audio-mount]');
    expect(hostBefore?.contains(audioController.element)).toBe(true);

    fireEvent.click(screen.getByTestId('close-full-player'));

    await waitFor(() => {
      expect(screen.queryByTestId('player-popup')).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByTestId('mini-player')).toBeTruthy();
    });

    expect(screen.getByTestId('mini-player').getAttribute('data-playing')).toBe('true');
    expect(store.getState().player.isPlaying).toBe(true);

    const hostAfter = document.querySelector('[data-player-audio-mount]');
    expect(hostAfter?.contains(audioController.element)).toBe(true);
    expect(document.body.contains(audioController.element)).toBe(true);

    expect(pauseSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  test('paused -> close Full Player -> playback remains paused -> Mini Player shows Play', async () => {
    const { store, pauseSpy } = renderPlayerShellAt('/ru/albums/album-1?artist=test#player', false);

    await waitFor(() => {
      expect(screen.getByTestId('player-popup')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('close-full-player'));

    await waitFor(() => {
      expect(screen.getByTestId('mini-player')).toBeTruthy();
    });

    expect(screen.getByTestId('mini-player').getAttribute('data-playing')).toBe('false');
    expect(store.getState().player.isPlaying).toBe(false);
    expect(pauseSpy).not.toHaveBeenCalled();
    pauseSpy.mockRestore();
  });
});
