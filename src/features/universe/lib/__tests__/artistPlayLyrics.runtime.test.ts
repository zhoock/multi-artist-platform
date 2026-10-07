import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { langReducer } from '@shared/model/lang/langSlice';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import {
  ensureTrackLyricsBundle,
  resetTrackLyricsInflightForTests,
} from '@entities/lyrics/lib/ensureTrackLyricsBundle';
import { scheduleProgressiveLyricsAfterArtistPlayStart } from '@entities/lyrics/lib/progressiveArtistPlayLyricsPrefetch';
import { hasNonEmptyTrackLyricsEntity } from '@entities/lyrics/lib/selectors';

jest.mock('@entities/lyrics/api/trackLyricsApi', () => ({
  fetchTrackLyricsBundle: jest.fn(),
  TrackLyricsUnavailableError: class TrackLyricsUnavailableError extends Error {
    name = 'TrackLyricsUnavailableError';
  },
}));

import { fetchTrackLyricsBundle } from '@entities/lyrics/api/trackLyricsApi';

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

describe('artist Play → progressive lyrics runtime', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetTrackLyricsInflightForTests();
  });

  test('after prefetch, Redux has lyrics entity keyed by albumId:logicalTrackId:lang', async () => {
    const store = createStore();
    mockFetch.mockResolvedValue({
      albumId: '23',
      trackId: '5da08d07-7053-43db-97cb-d6bca5e3161e',
      lang: 'ru',
      content: 'Текст песни',
      state: 'text-only',
      syncedLines: null,
      syncedAt: null,
    });

    scheduleProgressiveLyricsAfterArtistPlayStart({
      dispatch: store.dispatch,
      getState: store.getState as never,
      lang: 'ru',
      artistSlug: 'smolyanoe-chuchelko',
      currentTrackId: '5da08d07-7053-43db-97cb-d6bca5e3161e',
      firstAlbum: {
        albumId: '23',
        tracks: [{ id: '5da08d07-7053-43db-97cb-d6bca5e3161e' }],
      } as never,
    });

    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        queueMicrotask(() => resolve());
      });
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(mockFetch).toHaveBeenCalledWith(
      '23',
      '5da08d07-7053-43db-97cb-d6bca5e3161e',
      'ru',
      expect.objectContaining({ artistSlug: 'smolyanoe-chuchelko', tolerateMissing: true })
    );

    expect(
      hasNonEmptyTrackLyricsEntity(
        store.getState() as never,
        '23',
        '5da08d07-7053-43db-97cb-d6bca5e3161e'
      )
    ).toBe(true);
  });

  test('TrackLyricsUnavailableError does not store entity (API withheld payload)', async () => {
    const { TrackLyricsUnavailableError } = await import('@entities/lyrics/api/trackLyricsApi');
    const store = createStore();
    mockFetch.mockRejectedValue(new TrackLyricsUnavailableError());

    await ensureTrackLyricsBundle(store.dispatch, store.getState as never, {
      albumId: '23',
      trackId: '5da08d07-7053-43db-97cb-d6bca5e3161e',
      lang: 'ru',
      artistSlug: 'smolyanoe-chuchelko',
    });

    expect(
      hasNonEmptyTrackLyricsEntity(
        store.getState() as never,
        '23',
        '5da08d07-7053-43db-97cb-d6bca5e3161e'
      )
    ).toBe(false);
  });
});
