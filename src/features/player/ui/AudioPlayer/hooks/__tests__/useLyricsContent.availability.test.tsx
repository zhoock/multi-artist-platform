import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react';
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

jest.mock('@shared/lib/hooks/useEffectiveLocation', () => ({
  useEffectiveLocation: () => ({ pathname: '/ru', search: '?artist=demo', hash: '#player' }),
}));

jest.mock('@entities/lyrics/lib/ensureTrackLyricsBundle', () => {
  const actual = jest.requireActual('@entities/lyrics/lib/ensureTrackLyricsBundle') as object;
  return {
    ...actual,
    ensureTrackLyricsBundle: jest.fn(),
  };
});

import {
  ensureTrackLyricsBundle,
  resetTrackLyricsInflightForTests,
} from '@entities/lyrics/lib/ensureTrackLyricsBundle';

const mockEnsure = ensureTrackLyricsBundle as jest.MockedFunction<typeof ensureTrackLyricsBundle>;

const thinTrack: PlayerTrack = {
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

function useLyricsContentHarness(track: PlayerTrack | null) {
  const [synced, setSynced] = useState<SyncedLyricsLine[] | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const result = useLyricsContent({
    currentTrack: track,
    albumId: '23',
    lang: 'ru',
    duration: 180,
    setSyncedLyrics: setSynced,
    setPlainLyricsContent: setPlain,
    setAuthorshipText: () => undefined,
    setCurrentLineIndex: () => undefined,
    setIsLoadingSyncedLyrics: setLoading,
    setHasSyncedLyricsAvailable: () => undefined,
  });

  return { ...result, plain, loading };
}

describe('useLyricsContent availability', () => {
  beforeEach(() => {
    mockEnsure.mockReset();
    resetTrackLyricsInflightForTests();
  });

  test('hydrating stays true until ensure completes (button should stay enabled)', async () => {
    let resolveEnsure!: () => void;
    mockEnsure.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEnsure = resolve;
        })
    );

    const store = createStore();
    const { result } = renderHook(() => useLyricsContentHarness(thinTrack), {
      wrapper: ({ children }) => <Wrapper store={store}>{children}</Wrapper>,
    });

    await waitFor(() => {
      expect(result.current.isLyricsHydrating).toBe(true);
      expect(result.current.isLyricsConfirmedUnavailable).toBe(false);
    });

    await act(async () => {
      store.dispatch(
        applyTrackLyricsBundle({
          albumId: '23',
          trackId: 'logical-track-1',
          lang: 'ru',
          content: 'Loaded text',
          state: 'text-only',
          syncedLines: null,
          syncedAt: null,
        })
      );
      resolveEnsure();
    });

    await waitFor(() => {
      expect(result.current.isLyricsHydrating).toBe(false);
      expect(result.current.plain).toBe('Loaded text');
    });
  });

  test('confirmed unavailable after ensure completes with no bundle', async () => {
    mockEnsure.mockResolvedValue(undefined);

    const store = createStore();
    const { result } = renderHook(() => useLyricsContentHarness(thinTrack), {
      wrapper: ({ children }) => <Wrapper store={store}>{children}</Wrapper>,
    });

    await waitFor(() => {
      expect(result.current.isLyricsConfirmedUnavailable).toBe(true);
      expect(result.current.isLyricsHydrating).toBe(false);
    });
  });

  test('empty stored entity does not block refetch and resolves after fetch', async () => {
    const store = createStore();
    store.dispatch(
      applyTrackLyricsBundle({
        albumId: '23',
        trackId: 'logical-track-1',
        lang: 'en',
        content: '',
        state: 'empty',
        syncedLines: null,
        syncedAt: null,
      })
    );

    mockEnsure.mockImplementation(async (dispatch) => {
      dispatch(
        applyTrackLyricsBundle({
          albumId: '23',
          trackId: 'logical-track-1',
          lang: 'ru',
          content: 'After refetch',
          state: 'text-only',
          syncedLines: null,
          syncedAt: null,
        })
      );
    });

    const { result } = renderHook(() => useLyricsContentHarness(thinTrack), {
      wrapper: ({ children }) => <Wrapper store={store}>{children}</Wrapper>,
    });

    await waitFor(() => {
      expect(mockEnsure).toHaveBeenCalled();
      expect(result.current.plain).toBe('After refetch');
      expect(result.current.isLyricsConfirmedUnavailable).toBe(false);
    });
  });

  test('playlist fallback skips remote hydration', async () => {
    const store = createStore();
    const trackWithContent: PlayerTrack = {
      ...thinTrack,
      content: 'Embedded plain lyrics',
    };

    renderHook(() => useLyricsContentHarness(trackWithContent), {
      wrapper: ({ children }) => <Wrapper store={store}>{children}</Wrapper>,
    });

    await waitFor(() => {
      expect(mockEnsure).not.toHaveBeenCalled();
    });
  });
});
