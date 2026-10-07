import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { langReducer } from '@shared/model/lang/langSlice';
import { trackLyricsReducer } from '../../model/trackLyricsSlice';
import { applyTrackLyricsBundle } from '../../model/actions';
import {
  ensureTrackLyricsBundle,
  resetTrackLyricsInflightForTests,
} from '../ensureTrackLyricsBundle';

jest.mock('../../api/trackLyricsApi', () => ({
  fetchTrackLyricsBundle: jest.fn(),
}));

import { fetchTrackLyricsBundle } from '../../api/trackLyricsApi';

const mockFetch = fetchTrackLyricsBundle as jest.MockedFunction<typeof fetchTrackLyricsBundle>;

function createStore() {
  return configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      trackLyrics: trackLyricsReducer,
    },
  });
}

describe('ensureTrackLyricsBundle', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetTrackLyricsInflightForTests();
  });

  test('stores bundle in trackLyricsSlice after fetch', async () => {
    const store = createStore();
    mockFetch.mockResolvedValue({
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      content: 'Hello lyrics',
      state: 'text-only',
      syncedLines: null,
      syncedAt: null,
    });

    await ensureTrackLyricsBundle(store.dispatch, store.getState as never, {
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      artistSlug: 'smolyanoe-chuchelko',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(store.getState().trackLyrics.entities['23:track-a:ru']?.content).toBe('Hello lyrics');
  });

  test('writes bundle under request albumId/trackId when API returns different ids', async () => {
    const store = createStore();
    mockFetch.mockResolvedValue({
      albumId: 'wrong-album-id',
      trackId: 'wrong-track-id',
      lang: 'ru',
      content: 'Canonical key lyrics',
      state: 'text-only',
      syncedLines: null,
      syncedAt: null,
    });

    await ensureTrackLyricsBundle(store.dispatch, store.getState as never, {
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      artistSlug: 'artist',
    });

    expect(store.getState().trackLyrics.entities['23:track-a:ru']?.content).toBe(
      'Canonical key lyrics'
    );
    expect(
      store.getState().trackLyrics.entities['wrong-album-id:wrong-track-id:ru']
    ).toBeUndefined();
  });

  test('does not duplicate in-flight or completed fetches (same logical track)', async () => {
    const store = createStore();
    let resolveFetch!: (value: Awaited<ReturnType<typeof fetchTrackLyricsBundle>>) => void;
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = ensureTrackLyricsBundle(store.dispatch, store.getState as never, {
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      artistSlug: 'artist',
    });
    const p2 = ensureTrackLyricsBundle(store.dispatch, store.getState as never, {
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      artistSlug: 'artist',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFetch({
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      content: 'Lyrics',
      state: 'text-only',
      syncedLines: null,
      syncedAt: null,
    });

    await Promise.all([p1, p2]);

    await ensureTrackLyricsBundle(store.dispatch, store.getState as never, {
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      artistSlug: 'artist',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('still fetches when only empty entity is stored', async () => {
    const store = createStore();
    store.dispatch(
      applyTrackLyricsBundle({
        albumId: '23',
        trackId: 'track-a',
        lang: 'en',
        content: '',
        state: 'empty',
        syncedLines: null,
        syncedAt: null,
      })
    );

    mockFetch.mockResolvedValue({
      albumId: '23',
      trackId: 'track-a',
      lang: 'ru',
      content: 'Lyrics',
      state: 'text-only',
      syncedLines: null,
      syncedAt: null,
    });

    await ensureTrackLyricsBundle(store.dispatch, store.getState as never, {
      albumId: '23',
      trackId: 'track-a',
      lang: 'en',
      artistSlug: 'artist',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
