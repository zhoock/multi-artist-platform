import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { PlayerShell } from '../PlayerShell';
import { playerReducer, playerActions } from '@features/player/model/slice/playerSlice';
import { playerListenerMiddleware } from '@features/player/model/middleware/playerListeners';
import { langReducer } from '@shared/model/lang/langSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import type { PlayerState, PlayerTrack } from '@features/player/model/types/playerSchema';
import { resetPlayerSessionBootstrapForTests } from '@features/player/model/lib/bootstrapPlayerSession';

jest.mock('@features/player/model/lib/audioController', () => ({
  audioController: {
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    setSource: jest.fn(),
    setCurrentTime: jest.fn(),
    setVolume: jest.fn(),
    getCurrentSrc: jest.fn(() => ''),
    ensureElementInDocument: jest.fn(),
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

jest.mock('../MiniPlayer', () => ({
  MiniPlayer: ({ showMixerButton }: { showMixerButton?: boolean }) => (
    <div data-testid="mini-player" data-mixer={String(Boolean(showMixerButton))} />
  ),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' as const }),
}));

jest.mock('@shared/lib/dashboardModalShellContext', () => ({
  useDashboardModalShell: () => ({ overlayOpen: false, surfaceLocation: null }),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Artist',
    displayLabel: 'Artist',
    isLoading: false,
  }),
}));

jest.mock('@shared/lib/profileDisplayName', () => ({
  formatAlbumDisplayFullName: (artist: string, album: string) => `${artist} — ${album}`,
  readStoredProfileDisplayName: () => '',
}));

function track(partial: Partial<PlayerTrack> & Pick<PlayerTrack, 'id' | 'title'>): PlayerTrack {
  return {
    duration: 180,
    src: 'a.mp3',
    albumId: 'album-1',
    ...partial,
  };
}

function createStore(playlist: PlayerTrack[], currentTrackIndex: number) {
  const albumMeta = {
    albumId: 'album-1',
    publicSlug: 'the-beatles',
    album: 'Album',
    artist: 'Artist',
    fullName: 'Artist — Album',
    cover: null,
    userId: 'user-1',
  };

  const player: PlayerState = {
    isPlaying: true,
    volume: 50,
    isSeeking: false,
    progress: 0,
    time: { current: 0, duration: 180 },
    currentTrackIndex,
    playlist,
    originalPlaylist: playlist,
    playRequestId: 1,
    albumId: albumMeta.albumId,
    albumTitle: albumMeta.album,
    albumMeta,
    sourceLocation: { pathname: '/en', search: '?artist=the-beatles' },
    shuffle: false,
    repeat: 'none',
    showLyrics: false,
    controlsVisible: true,
  };

  return configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      popup: popupReducer,
    },
    preloadedState: {
      player,
      lang: { current: 'en' as const },
      popup: { isOpen: false },
    },
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
  });
}

function renderShell(playlist: PlayerTrack[], currentTrackIndex: number) {
  const store = createStore(playlist, currentTrackIndex);
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/en?artist=the-beatles']}>
        <PlayerShell />
      </MemoryRouter>
    </Provider>
  );
  return { store, ...view };
}

describe('PlayerShell mini-player mixer icon', () => {
  beforeEach(() => {
    resetPlayerSessionBootstrapForTests();

    class ResizeObserverMock {
      observe = jest.fn();
      disconnect = jest.fn();
      unobserve = jest.fn();
    }
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  test('shows mixer control when current track has stems', async () => {
    renderShell(
      [
        track({ id: 't1', title: 'With stems', hasStems: true }),
        track({ id: 't2', title: 'No stems' }),
      ],
      0
    );

    await waitFor(() => {
      expect(screen.getByTestId('mini-player').getAttribute('data-mixer')).toBe('true');
    });
  });

  test('hides mixer control when hasStems is cleared on the current track', async () => {
    const { store } = renderShell([track({ id: 't1', title: 'With stems', hasStems: true })], 0);

    await waitFor(() => {
      expect(screen.getByTestId('mini-player').getAttribute('data-mixer')).toBe('true');
    });

    store.dispatch(
      playerActions.syncTrackHasStemsInQueue({
        albumId: 'album-1',
        trackId: 't1',
        hasStems: false,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('mini-player').getAttribute('data-mixer')).toBe('false');
    });
  });

  test('keeps mixer when another track in queue loses stems but current track still has them', async () => {
    const { store } = renderShell(
      [
        track({ id: 't1', title: 'With stems', hasStems: true }),
        track({ id: 't2', title: 'Also stems', hasStems: true }),
      ],
      0
    );

    await waitFor(() => {
      expect(screen.getByTestId('mini-player').getAttribute('data-mixer')).toBe('true');
    });

    store.dispatch(
      playerActions.syncTrackHasStemsInQueue({
        albumId: 'album-1',
        trackId: 't2',
        hasStems: false,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('mini-player').getAttribute('data-mixer')).toBe('true');
    });
  });

  test('shows no mixer after switching to a track whose stems were removed', async () => {
    const { store } = renderShell(
      [
        track({ id: 't1', title: 'With stems', hasStems: true }),
        track({ id: 't2', title: 'Also stems', hasStems: true }),
      ],
      0
    );

    store.dispatch(
      playerActions.syncTrackHasStemsInQueue({
        albumId: 'album-1',
        trackId: 't2',
        hasStems: false,
      })
    );

    store.dispatch(playerActions.setCurrentTrackIndex(1));

    await waitFor(() => {
      expect(screen.getByTestId('mini-player').getAttribute('data-mixer')).toBe('false');
    });
  });
});
