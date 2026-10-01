/** @jest-environment jsdom */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { PlayerAlbumMeta } from '@features/player/model/types/playerSchema';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary';
import type { UiDictionaryState } from '@shared/model/uiDictionary';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

jest.mock('@shared/lib/hooks/useEffectiveLocation', () => ({
  useEffectiveLocation: () => ({
    pathname: '/ru/albums/album-1',
    search: '?artist=test-artist',
    hash: '#player',
  }),
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom') as typeof import('react-router-dom');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' as const }),
}));

jest.mock('@entities/album', () => ({
  AlbumCover: () => <div data-testid="album-cover" />,
}));

jest.mock('@shared/lib/hooks/useImageColor', () => ({
  clearImageColorCache: jest.fn(),
}));

jest.mock('@features/player/model/lib/audioController', () => {
  const element = document.createElement('audio');
  return {
    audioController: {
      element,
      setCurrentTime: jest.fn(),
      ensureElementInDocument: jest.fn(),
    },
  };
});

const mockFetchTrackLyricsBundle =
  jest.fn<
    (
      albumId: string,
      trackId: string | number,
      lang: string,
      options?: unknown
    ) => Promise<TrackLyricsBundle>
  >();

jest.mock('@entities/lyrics/api/trackLyricsApi', () => ({
  fetchTrackLyricsBundle: (
    albumId: string,
    trackId: string | number,
    lang: string,
    options?: unknown
  ) => mockFetchTrackLyricsBundle(albumId, trackId, lang, options),
}));

jest.mock('../hooks/useLyricsScrollRestore', () => ({ useLyricsScrollRestore: () => undefined }));
jest.mock('../hooks/useLyricsManualScroll', () => ({ useLyricsManualScroll: () => undefined }));
jest.mock('../hooks/useLyricsAutoScroll', () => ({ useLyricsAutoScroll: () => undefined }));
jest.mock('../hooks/useSeek', () => ({
  useSeek: () => ({
    handleProgressChange: jest.fn(),
    handleSeekEnd: jest.fn(),
  }),
}));
jest.mock('../hooks/useTimeDisplay', () => ({
  useTimeDisplay: () => ({ renderTimeDisplay: () => null }),
}));
jest.mock('../hooks/useTrackNavigation', () => ({
  useTrackNavigation: () => ({
    togglePlayPause: jest.fn(),
    prevTrack: jest.fn(),
    nextTrack: jest.fn(),
  }),
}));
jest.mock('../hooks/useRewind', () => ({
  useRewind: () => ({
    handleRewindStart: jest.fn(),
    handleRewindEnd: jest.fn(),
    handleRewindClick: jest.fn(),
    isRewindingActive: () => false,
  }),
}));
jest.mock('../hooks/usePlayerControls', () => ({
  usePlayerControls: () => ({
    resetInactivityTimer: jest.fn(),
    showControls: jest.fn(),
  }),
}));
jest.mock('../hooks/usePlayerToggles', () => ({
  usePlayerToggles: () => ({
    toggleShuffle: jest.fn(),
    toggleRepeat: jest.fn(),
    toggleLyrics: jest.fn(),
  }),
}));
jest.mock('../hooks/useCurrentLineIndex', () => ({
  useCurrentLineIndex: () => null,
}));

import AudioPlayer from '../AudioPlayer';

const emptyUiDictionary: UiDictionaryState = {
  ru: { status: 'idle', data: [], error: null, lastUpdated: null },
  en: { status: 'idle', data: [], error: null, lastUpdated: null },
};

const albumMeta: PlayerAlbumMeta = {
  albumId: 'album-1',
  album: 'Test Album',
  artist: 'Test Artist',
  fullName: 'Test Artist — Test Album',
  cover: null,
  userId: 'user-1',
  publicSlug: 'test-artist',
};

const syncedBundle: TrackLyricsBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'ru',
  content: 'Synced line',
  authorship: '',
  syncedLines: [{ text: 'Synced line', startTime: 0 }],
  state: 'synced',
  syncedAt: '2026-01-01T00:00:00.000Z',
};

const emptyLyricsBundle: TrackLyricsBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'ru',
  content: '',
  syncedLines: null,
  state: 'empty',
  syncedAt: null,
};

function renderHydratedPlayer() {
  const store = configureStore({
    reducer: {
      player: playerReducer,
      trackLyrics: trackLyricsReducer,
      uiDictionary: uiDictionaryReducer,
    },
    preloadedState: {
      player: {
        ...initialPlayerState,
        playlist: [
          {
            id: 'track-1',
            title: 'Track One',
            duration: 180,
            src: 'https://example.com/a.mp3',
            albumId: 'album-1',
          },
        ],
        currentTrackIndex: 0,
        albumMeta,
        albumId: 'album-1',
        time: { current: 0, duration: 180 },
        volume: 50,
      },
      trackLyrics: { entities: {} },
      uiDictionary: emptyUiDictionary,
    },
  });

  return render(
    <MemoryRouter>
      <Provider store={store}>
        <AudioPlayer albumMeta={albumMeta} setBgColor={jest.fn()} />
      </Provider>
    </MemoryRouter>
  );
}

function lyricsToggleButton() {
  return screen.getByRole('button', { name: /показать текст|show lyrics/i });
}

describe('AudioPlayer synced lyrics after hydration (F5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchTrackLyricsBundle.mockReset();
  });

  test('lyrics toggle becomes enabled when API returns synced bundle for restored track', async () => {
    mockFetchTrackLyricsBundle.mockResolvedValue(syncedBundle);

    renderHydratedPlayer();

    await waitFor(() => {
      expect(mockFetchTrackLyricsBundle).toHaveBeenCalledWith(
        'album-1',
        'track-1',
        'ru',
        expect.objectContaining({
          artistSlug: 'test-artist',
          tolerateMissing: true,
        })
      );
    });

    await waitFor(() => {
      expect(lyricsToggleButton()).not.toBeDisabled();
    });
  });

  test('lyrics toggle stays disabled when API withholds the payload', async () => {
    mockFetchTrackLyricsBundle.mockRejectedValue(new Error('Track lyrics are not available'));

    renderHydratedPlayer();

    await waitFor(() => {
      expect(mockFetchTrackLyricsBundle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(lyricsToggleButton()).toBeDisabled();
    });
  });

  test('lyrics toggle stays disabled when API confirms track has no lyrics', async () => {
    mockFetchTrackLyricsBundle.mockResolvedValue(emptyLyricsBundle);

    renderHydratedPlayer();

    await waitFor(() => {
      expect(mockFetchTrackLyricsBundle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(lyricsToggleButton()).toBeDisabled();
    });
  });
});
