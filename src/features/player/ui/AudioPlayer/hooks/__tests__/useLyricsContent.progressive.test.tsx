import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import React, { useState } from 'react';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import { langReducer } from '@shared/model/lang/langSlice';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { applyTrackLyricsBundle } from '@entities/lyrics/model/actions';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import type { SyncedLyricsLine } from '@models';
import { useLyricsContent } from '../useLyricsContent';

jest.mock('../../utils/debug', () => ({ debugLog: jest.fn() }));

jest.mock('@entities/lyrics/lib/ensureTrackLyricsBundle', () => ({
  ensureTrackLyricsBundle: jest.fn(() => Promise.resolve()),
}));

jest.mock('@shared/lib/hooks/useEffectiveLocation', () => ({
  useEffectiveLocation: () => ({ pathname: '/ru', search: '?artist=demo', hash: '#player' }),
}));

import { ensureTrackLyricsBundle } from '@entities/lyrics/lib/ensureTrackLyricsBundle';

const mockEnsure = ensureTrackLyricsBundle as jest.MockedFunction<typeof ensureTrackLyricsBundle>;

const track: PlayerTrack = {
  id: 'logical-track-1',
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
        albumMeta: {
          albumId: '23',
          publicSlug: 'demo-artist',
          album: 'Album',
          artist: 'Artist',
          fullName: 'Artist — Album',
          cover: null,
        },
      },
    },
  });
}

function Wrapper({
  store,
  children,
}: {
  store: ReturnType<typeof createStore>;
  children: React.ReactNode;
}) {
  return <Provider store={store}>{children}</Provider>;
}

describe('useLyricsContent progressive hydration', () => {
  beforeEach(() => {
    mockEnsure.mockClear();
  });

  test('Full Player opened before fetch completes updates when bundle is applied', async () => {
    const store = createStore();
    mockEnsure.mockImplementation(async (dispatch) => {
      dispatch(
        applyTrackLyricsBundle({
          albumId: '23',
          trackId: 'logical-track-1',
          lang: 'ru',
          content: 'Line one',
          state: 'text-only',
          syncedLines: null,
          syncedAt: null,
        })
      );
    });

    const { result } = renderHook(
      () => {
        const [synced, setSynced] = useState<SyncedLyricsLine[] | null>(null);
        const [plain, setPlain] = useState<string | null>(null);
        const [authorship, setAuthorship] = useState<string | null>(null);
        const [lineIndex, setLineIndex] = useState<number | null>(null);
        const [loading, setLoading] = useState(false);
        const [hasSynced, setHasSynced] = useState(false);

        const lyrics = useLyricsContent({
          currentTrack: track,
          albumId: '23',
          lang: 'ru',
          duration: 180,
          setSyncedLyrics: setSynced,
          setPlainLyricsContent: setPlain,
          setAuthorshipText: setAuthorship,
          setCurrentLineIndex: setLineIndex,
          setIsLoadingSyncedLyrics: setLoading,
          setHasSyncedLyricsAvailable: setHasSynced,
        });

        return { lyrics, plain, loading };
      },
      {
        wrapper: ({ children }) => <Wrapper store={store}>{children}</Wrapper>,
      }
    );

    expect(mockEnsure).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(result.current.plain).toBe('Line one');
    });
  });

  test('does not call ensure again when lyrics entity already stored', async () => {
    const store = createStore();
    store.dispatch(
      applyTrackLyricsBundle({
        albumId: '23',
        trackId: 'logical-track-1',
        lang: 'ru',
        content: 'Cached',
        state: 'text-only',
        syncedLines: null,
        syncedAt: null,
      })
    );

    renderHook(
      () => {
        const noop = () => undefined;
        useLyricsContent({
          currentTrack: track,
          albumId: '23',
          lang: 'ru',
          duration: 180,
          setSyncedLyrics: noop,
          setPlainLyricsContent: noop,
          setAuthorshipText: noop,
          setCurrentLineIndex: noop,
          setIsLoadingSyncedLyrics: noop,
          setHasSyncedLyricsAvailable: noop,
        });
        return null;
      },
      {
        wrapper: ({ children }) => <Wrapper store={store}>{children}</Wrapper>,
      }
    );

    await waitFor(() => {
      expect(mockEnsure).not.toHaveBeenCalled();
    });
  });
});
