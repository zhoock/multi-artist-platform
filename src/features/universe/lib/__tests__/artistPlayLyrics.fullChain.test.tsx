import { describe, expect, test } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import React, { useState } from 'react';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { langReducer } from '@shared/model/lang/langSlice';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { initialPlayerState, type PlayerTrack } from '@features/player/model/types/playerSchema';
import { useLyricsContent } from '@features/player/ui/AudioPlayer/hooks/useLyricsContent';
import { dispatchTrackLyricsBundle } from '@entities/lyrics/lib/dispatchTrackLyricsBundle';

jest.mock('@features/player/ui/AudioPlayer/utils/debug', () => ({ debugLog: jest.fn() }));

jest.mock('@shared/lib/hooks/useEffectiveLocation', () => ({
  useEffectiveLocation: () => ({ pathname: '/ru', search: '', hash: '#player' }),
}));

const track: PlayerTrack = {
  id: '5da08d07-7053-43db-97cb-d6bca5e3161e',
  albumId: '23',
  title: 'Track',
  duration: 180,
  src: 'x.opus',
};

function createStore() {
  return configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      trackLyrics: trackLyricsReducer,
    },
    preloadedState: {
      player: {
        ...initialPlayerState,
        playlist: [track],
        currentTrackIndex: 0,
        albumMeta: {
          albumId: '23',
          publicSlug: 'smolyanoe-chuchelko',
          album: '23',
          artist: 'Artist',
          fullName: 'Artist — 23',
          cover: null,
        },
      },
      lang: { current: 'en' as const },
    },
  });
}

describe('artist Play lyrics full chain (API → Redux → Full Player hook)', () => {
  test('after API bundle is stored, useLyricsContent exposes plain lyrics for UI lang en', async () => {
    const store = createStore();

    dispatchTrackLyricsBundle(
      store.dispatch,
      {
        albumId: '23',
        trackId: track.id,
        lang: 'ru',
        content: 'Line from API',
        state: 'text-only',
        syncedLines: null,
        syncedAt: null,
      },
      'en'
    );

    const { result } = renderHook(
      () => {
        const [plain, setPlain] = useState<string | null>(null);
        useLyricsContent({
          currentTrack: track,
          albumId: '23',
          lang: 'en',
          duration: 180,
          setSyncedLyrics: () => undefined,
          setPlainLyricsContent: setPlain,
          setAuthorshipText: () => undefined,
          setCurrentLineIndex: () => undefined,
          setIsLoadingSyncedLyrics: () => undefined,
          setHasSyncedLyricsAvailable: () => undefined,
        });
        return { plain };
      },
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    );

    await waitFor(() => {
      expect(result.current.plain).toBe('Line from API');
    });
  });
});
