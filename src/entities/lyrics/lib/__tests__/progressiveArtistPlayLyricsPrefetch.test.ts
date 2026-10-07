import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { langReducer } from '@shared/model/lang/langSlice';
import { trackLyricsReducer } from '../../model/trackLyricsSlice';
import { scheduleProgressiveLyricsAfterArtistPlayStart } from '../progressiveArtistPlayLyricsPrefetch';

jest.mock('../ensureTrackLyricsBundle', () => ({
  ensureTrackLyricsBundle: jest.fn(() => Promise.resolve()),
}));

import { ensureTrackLyricsBundle } from '../ensureTrackLyricsBundle';

const mockEnsure = ensureTrackLyricsBundle as jest.MockedFunction<typeof ensureTrackLyricsBundle>;

function createStore() {
  return configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      trackLyrics: trackLyricsReducer,
    },
  });
}

describe('scheduleProgressiveLyricsAfterArtistPlayStart', () => {
  beforeEach(() => {
    mockEnsure.mockClear();
  });

  test('prefetches current track first then other album tracks in background', async () => {
    const store = createStore();
    const order: string[] = [];
    mockEnsure.mockImplementation(async (_d, _g, input) => {
      order.push(String(input.trackId));
    });

    scheduleProgressiveLyricsAfterArtistPlayStart({
      dispatch: store.dispatch,
      getState: store.getState as never,
      lang: 'ru',
      artistSlug: 'demo-artist',
      currentTrackId: 't2',
      firstAlbum: {
        albumId: '23',
        slug: '23',
        title: 'Album',
        cover: '',
        userId: 'u1',
        dbAlbumId: 'pk',
        description: '',
        details: [],
        release: { date: '2024-01-01' },
        artwork: {
          photographer: '',
          photographerURL: '',
          designer: '',
          designerURL: '',
        },
        purchase: { allowDownloadSale: '', regularPrice: '0', currency: 'RUB' },
        serviceButtons: {},
        visibility: { isPublished: true, isPublic: true },
        tracks: [
          { id: 't1', title: 'T1', orderIndex: 0, duration: 1, src: 'a', playbackLocked: false },
          { id: 't2', title: 'T2', orderIndex: 1, duration: 1, src: 'b', playbackLocked: false },
          { id: 't3', title: 'T3', orderIndex: 2, duration: 1, src: 'c', playbackLocked: false },
        ],
      } as never,
    });

    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        queueMicrotask(() => resolve());
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order[0]).toBe('t2');
    expect(order).toEqual(expect.arrayContaining(['t1', 't3']));
    expect(mockEnsure.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
