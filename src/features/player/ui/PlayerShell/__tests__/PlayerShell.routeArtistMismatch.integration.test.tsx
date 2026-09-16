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
import type { PlayerState, PlayerTrack } from '@features/player/model/types/playerSchema';
import { resetPlayerSessionBootstrapForTests } from '@features/player/model/lib/bootstrapPlayerSession';

const mockUseSiteArtistDisplayName = jest.fn(
  (_lang: string, options?: { artistSlug?: string | null; variant?: string }) => {
    const slug = options?.artistSlug?.trim() ?? '';
    if (slug === 'the-beatles') {
      return { displayName: 'Beatles', displayLabel: 'Beatles', isLoading: false };
    }
    if (slug === 'smolyanoe-chuchelko') {
      return {
        displayName: 'Смоляное чучелко',
        displayLabel: 'Смоляное чучелко',
        isLoading: false,
      };
    }
    return { displayName: '', displayLabel: '', isLoading: false };
  }
);

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: (lang: string, options?: { artistSlug?: string | null }) =>
    mockUseSiteArtistDisplayName(lang, options),
}));

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

jest.mock('../loadAudioPlayerModule', () => ({
  loadAudioPlayerModule: () =>
    Promise.resolve({
      default: ({ albumMeta }: { albumMeta: { artist: string | null } }) => (
        <div data-testid="audio-player" data-artist={albumMeta.artist ?? ''} />
      ),
    }),
}));

jest.mock('../MiniPlayer', () => ({
  MiniPlayer: ({ title }: { title: string }) => <div data-testid="mini-player">{title}</div>,
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

jest.mock('@shared/lib/profileDisplayName', () => ({
  formatAlbumDisplayFullName: (artist: string, album: string) => `${artist} — ${album}`,
  readStoredProfileDisplayName: () => '',
  siteArtistUiLabel: (name: string, fallback?: string) => name.trim() || fallback || '',
}));

const beatlesTrack: PlayerTrack = {
  id: 'norwegian-wood',
  title: 'Norwegian Wood (This Bird Has Flown)',
  duration: 180,
  src: 'https://example.com/norwegian-wood.mp3',
};

const beatlesAlbumMeta = {
  albumId: 'rubber-soul',
  userId: 'beatles-user',
  publicSlug: 'the-beatles',
  album: 'Rubber Soul',
  artist: 'Beatles',
  fullName: 'Beatles — Rubber Soul',
  cover: 'https://example.com/rubber-soul.jpg',
};

function createStoreWithBeatlesSession() {
  const player: PlayerState = {
    isPlaying: true,
    volume: 50,
    isSeeking: false,
    progress: 0,
    time: { current: 30, duration: 180 },
    currentTrackIndex: 0,
    playlist: [beatlesTrack],
    originalPlaylist: [beatlesTrack],
    playRequestId: 1,
    albumId: beatlesAlbumMeta.albumId,
    albumTitle: beatlesAlbumMeta.album,
    albumMeta: beatlesAlbumMeta,
    sourceLocation: { pathname: '/ru/albums/rubber-soul', search: '?artist=the-beatles' },
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
      lang: { current: 'ru' as const },
      popup: { isOpen: false },
    },
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
  });
}

function renderPlayerShell(initialEntries: string[]) {
  const store = createStoreWithBeatlesSession();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        <PlayerShell />
      </MemoryRouter>
    </Provider>
  );
  return { store };
}

describe('PlayerShell route vs track artist identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlayerSessionBootstrapForTests();

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

  test('does not overwrite playback artist from page ?artist= when opening full player', async () => {
    const { store } = renderPlayerShell(['/ru/?artist=smolyanoe-chuchelko#player']);

    await waitFor(() => {
      expect(screen.getByTestId('player-popup')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByTestId('audio-player')).toBeTruthy();
    });

    const playerEl = screen.getByTestId('audio-player');
    expect(playerEl.getAttribute('data-artist')).toBe('Beatles');
    expect(store.getState().player.albumMeta?.artist).toBe('Beatles');
    expect(store.getState().player.albumMeta?.fullName).toBe('Beatles — Rubber Soul');

    expect(mockUseSiteArtistDisplayName).toHaveBeenCalled();
    const lastCall = mockUseSiteArtistDisplayName.mock.calls.at(-1);
    expect(lastCall?.[1]?.artistSlug).toBe('the-beatles');
    expect(lastCall?.[1]?.artistSlug).not.toBe('smolyanoe-chuchelko');
  });

  test('mini-player on mismatched artist page keeps track album meta', async () => {
    const { store } = renderPlayerShell(['/ru/?artist=smolyanoe-chuchelko']);

    await waitFor(() => {
      expect(screen.getByTestId('mini-player')).toBeTruthy();
    });

    expect(screen.getByText('Norwegian Wood (This Bird Has Flown)')).toBeTruthy();
    expect(store.getState().player.albumMeta?.artist).toBe('Beatles');
    expect(store.getState().player.albumMeta?.cover).toBe(beatlesAlbumMeta.cover);
  });

  test('artist → artist navigation does not adopt second page artist for ongoing playback', async () => {
    const { store, rerender } = (() => {
      const store = createStoreWithBeatlesSession();
      const ui = render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/ru/?artist=artist-a#player']}>
            <PlayerShell />
          </MemoryRouter>
        </Provider>
      );
      return { store, rerender: ui.rerender };
    })();

    await waitFor(() => expect(screen.getByTestId('audio-player')).toBeTruthy());

    rerender(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/ru/?artist=smolyanoe-chuchelko#player']}>
          <PlayerShell />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(store.getState().player.albumMeta?.artist).toBe('Beatles');
    });
  });
});
