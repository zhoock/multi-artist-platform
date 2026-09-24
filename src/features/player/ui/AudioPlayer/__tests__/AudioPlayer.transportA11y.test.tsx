/** @jest-environment jsdom */

import React from 'react';
import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import { uiDictionaryReducer } from '@shared/model/uiDictionary';
import type { UiDictionaryState } from '@shared/model/uiDictionary';
import type { PlayerAlbumMeta } from '@features/player/model/types/playerSchema';

const emptyUiDictionary: UiDictionaryState = {
  ru: { status: 'idle', data: [], error: null, lastUpdated: null },
  en: { status: 'idle', data: [], error: null, lastUpdated: null },
};

jest.mock('@shared/lib/hooks/useEffectiveLocation', () => ({
  useEffectiveLocation: () => ({ pathname: '/ru/albums/demo', search: '', hash: '#player' }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: jest.fn(),
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
    },
  };
});

jest.mock('../hooks/useLyricsScrollRestore', () => ({ useLyricsScrollRestore: () => undefined }));
jest.mock('../hooks/useLyricsManualScroll', () => ({ useLyricsManualScroll: () => undefined }));
jest.mock('../hooks/useLyricsAutoScroll', () => ({ useLyricsAutoScroll: () => undefined }));
jest.mock('../hooks/useLyricsContent', () => ({
  useLyricsContent: () => null,
}));
jest.mock('../hooks/useSeek', () => ({
  useSeek: () => ({
    handleProgressChange: jest.fn(),
    handleSeekEnd: jest.fn(),
  }),
}));
jest.mock('../hooks/useTimeDisplay', () => ({
  useTimeDisplay: () => ({ renderTimeDisplay: jest.fn() }),
}));

const mockTogglePlayPause = jest.fn();
const mockPrevTrack = jest.fn();
const mockNextTrack = jest.fn();
const mockHandleRewindStart = jest.fn();
const mockHandleRewindEnd = jest.fn();
const mockHandleRewindClick = jest.fn();
const mockIsRewindingActive = jest.fn(() => false);
const mockResetInactivityTimer = jest.fn();
const mockShowControls = jest.fn();
const mockToggleShuffle = jest.fn();

const trackNavigationReturn = {
  togglePlayPause: mockTogglePlayPause,
  prevTrack: mockPrevTrack,
  nextTrack: mockNextTrack,
};

const rewindReturn = {
  handleRewindStart: mockHandleRewindStart,
  handleRewindEnd: mockHandleRewindEnd,
  handleRewindClick: mockHandleRewindClick,
  isRewindingActive: mockIsRewindingActive,
};

const playerControlsReturn = {
  resetInactivityTimer: mockResetInactivityTimer,
  showControls: mockShowControls,
};

const playerTogglesReturn = {
  toggleShuffle: mockToggleShuffle,
  toggleRepeat: jest.fn(),
  toggleLyrics: jest.fn(),
};

const currentLineIndexReturn = { currentLineIndexComputed: null as number | null };

jest.mock('../hooks/useCurrentLineIndex', () => ({
  useCurrentLineIndex: () => currentLineIndexReturn,
}));

jest.mock('../hooks/useTrackNavigation', () => ({
  useTrackNavigation: () => trackNavigationReturn,
}));

jest.mock('../hooks/useRewind', () => ({
  useRewind: () => rewindReturn,
}));

jest.mock('../hooks/usePlayerControls', () => ({
  usePlayerControls: () => playerControlsReturn,
}));

jest.mock('../hooks/usePlayerToggles', () => ({
  usePlayerToggles: () => playerTogglesReturn,
}));

import { useLang } from '@app/providers/lang';
import AudioPlayer from '../AudioPlayer';

const mockUseLang = useLang as jest.MockedFunction<typeof useLang>;

const albumMeta: PlayerAlbumMeta = {
  albumId: 'demo-album',
  album: 'Demo Album',
  artist: 'Demo Artist',
  fullName: 'Demo Artist — Demo Album',
  cover: null,
  userId: null,
  publicSlug: 'demo-artist',
};

function renderPlayer(isPlaying: boolean, shuffle = false) {
  const store = configureStore({
    reducer: {
      player: playerReducer,
      uiDictionary: uiDictionaryReducer,
    },
    preloadedState: {
      player: {
        ...initialPlayerState,
        isPlaying,
        shuffle,
        playlist: [
          {
            id: '1',
            title: 'Track One',
            duration: 180,
            src: 'https://example.com/a.mp3',
          },
        ],
        currentTrackIndex: 0,
        albumMeta,
        time: { current: 0, duration: 180 },
        progress: 0,
        volume: 50,
      },
      uiDictionary: emptyUiDictionary,
    },
  });

  return render(
    <Provider store={store}>
      <AudioPlayer albumMeta={albumMeta} setBgColor={jest.fn()} />
    </Provider>
  );
}

describe('AudioPlayer transport accessibility', () => {
  beforeEach(() => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: unknown) => ({
        matches: false,
        media: String(query),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  test('exposes accessible names on transport controls in English', () => {
    renderPlayer(false);

    expect(screen.getByRole('button', { name: 'Previous track' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next track' })).toBeTruthy();
  });

  test('switches play/pause accessible name with playback state', () => {
    const { rerender } = renderPlayer(false);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();

    mockUseLang.mockReturnValue({ lang: 'ru', setLang: jest.fn() });
    rerender(
      <Provider
        store={configureStore({
          reducer: { player: playerReducer, uiDictionary: uiDictionaryReducer },
          preloadedState: {
            player: {
              ...initialPlayerState,
              isPlaying: true,
              playlist: [
                {
                  id: '1',
                  title: 'Track One',
                  duration: 180,
                  src: 'https://example.com/a.mp3',
                  hasStems: false,
                },
              ],
              currentTrackIndex: 0,
              albumMeta,
              time: { current: 0, duration: 180 },
            },
            uiDictionary: emptyUiDictionary,
          },
        })}
      >
        <AudioPlayer albumMeta={albumMeta} setBgColor={jest.fn()} />
      </Provider>
    );

    expect(screen.getByRole('button', { name: 'Пауза' })).toBeTruthy();
  });

  test('shuffle toggle exposes aria-pressed', () => {
    renderPlayer(false, true);
    expect(screen.getByRole('button', { name: 'Выключить перемешивание' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
