import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../fetchUniverseArtistPlayQueue', () => ({
  fetchUniverseArtistPlayQueueBootstrap: jest.fn(),
  fetchUniverseArtistPlayQueueTail: jest.fn(),
}));

jest.mock('@shared/lib/profileDisplayName', () => ({
  fetchPublicProfileForDisplay: jest.fn(() => Promise.resolve({ displayName: '' })),
  formatAlbumDisplayFullName: jest.fn(() => 'Artist — Album'),
  readStoredProfileDisplayName: jest.fn(() => ''),
  siteArtistUiLabel: jest.fn((_n: string, fb: string) => fb),
}));

jest.mock('@entities/lyrics', () => {
  const actual = jest.requireActual('@entities/lyrics') as object;
  return {
    ...actual,
    scheduleProgressiveLyricsAfterArtistPlayStart: jest.fn(),
  };
});

import { fetchUniverseArtistPlayQueueBootstrap } from '../fetchUniverseArtistPlayQueue';
import { startUniverseArtistPlayback } from '../startUniverseArtistPlayback';
import { scheduleProgressiveLyricsAfterArtistPlayStart } from '@entities/lyrics';
import { configureStore } from '@reduxjs/toolkit';
import { playerReducer } from '@features/player/model/slice/playerSlice';

const mockBootstrap = fetchUniverseArtistPlayQueueBootstrap as jest.MockedFunction<
  typeof fetchUniverseArtistPlayQueueBootstrap
>;
const mockSchedule = scheduleProgressiveLyricsAfterArtistPlayStart as jest.MockedFunction<
  typeof scheduleProgressiveLyricsAfterArtistPlayStart
>;

describe('startUniverseArtistPlayback lyrics prefetch', () => {
  beforeEach(() => {
    mockBootstrap.mockReset();
    mockSchedule.mockReset();
  });

  test('schedules background lyrics after requestPlay without awaiting', async () => {
    const store = configureStore({ reducer: { player: playerReducer } });
    const firstAlbum = {
      albumId: '23',
      slug: '23',
      title: 'First',
      cover: 'c.jpg',
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
        {
          id: 't1',
          title: 'T1',
          orderIndex: 0,
          duration: 180,
          src: 't1.opus',
          playbackLocked: false,
        },
      ],
    } as never;

    mockBootstrap.mockResolvedValue({
      playlist: [
        {
          id: 't1',
          albumId: '23',
          title: 'T1',
          duration: 180,
          src: 't1.opus',
        },
      ],
      firstAlbum,
      tailStartIndex: 1,
      visibleAlbums: [],
      resolvedAlbums: [],
      detailsInflight: Promise.resolve(),
    });

    const result = await startUniverseArtistPlayback({
      artistSlug: 'demo-artist',
      lang: 'ru',
      dispatch: store.dispatch,
      sourceLocation: { pathname: '/ru' },
    });

    expect(result).toEqual({ ok: true });
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        artistSlug: 'demo-artist',
        currentTrackId: 't1',
        firstAlbum,
      })
    );
  });
});
