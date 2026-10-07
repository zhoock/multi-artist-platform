import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import {
  fetchUniverseArtistPlayQueueBootstrap,
  fetchUniverseArtistPlayQueueTail,
} from '../fetchUniverseArtistPlayQueue';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: jest.fn(() => null),
}));

jest.mock('@entities/album/api/fetchAlbumDetails', () => ({
  fetchAlbumDetails: jest.fn(),
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { fetchAlbumDetails } from '@entities/album/api/fetchAlbumDetails';

const mockAlbumDetails = fetchAlbumDetails as jest.MockedFunction<typeof fetchAlbumDetails>;

const mockFetch = fetchWithAuthSession as jest.MockedFunction<typeof fetchWithAuthSession>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const catalogRow = (albumId: string, trackCount = 1) => ({
  albumId,
  slug: albumId,
  title: albumId,
  cover: `cover-${albumId}.jpg`,
  releaseDate: '2024-01-01',
  trackCount,
  duration: 360,
  userId: 'u1',
  isPublished: true,
  isPublic: true,
  hasLockedTracks: false,
  hasStems: false,
});

const detailsPayload = (albumId: string, trackIds: string[]) => ({
  albumId,
  slug: albumId,
  title: albumId,
  cover: `cover-${albumId}.jpg`,
  userId: 'u1',
  dbAlbumId: `uuid-${albumId}`,
  description: 'd',
  details: [],
  release: { date: '2024-01-01' },
  artwork: {
    photographer: '',
    photographerURL: '',
    designer: '',
    designerURL: '',
  },
  purchase: {
    allowDownloadSale: '',
    regularPrice: '0.99',
    currency: 'RUB',
  },
  serviceButtons: {},
  visibility: { isPublished: true, isPublic: true },
  tracks: trackIds.map((id, orderIndex) => ({
    id,
    title: `Track ${id}`,
    orderIndex,
    duration: 180,
    src: `${id}.mp3`,
    playbackLocked: false,
    visibility: 'public',
    stemsAvailability: 'public',
    audioContainer: null,
    audioCodec: null,
    audioBitrate: null,
    audioSampleRate: null,
    audioBitDepth: null,
    audioChannels: null,
    audioDuration: null,
    audioFileSize: null,
  })),
});

describe('fetchUniverseArtistPlayQueueBootstrap', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockAlbumDetails.mockReset();
  });

  test('when first catalog album is playable, fetches only that album before bootstrap returns', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [catalogRow('album-1'), catalogRow('album-2'), catalogRow('album-3')],
      })
    );

    mockAlbumDetails.mockImplementation(async (_slug, albumId) => {
      return detailsPayload(albumId, [`track-${albumId}`]) as never;
    });

    const bootstrap = await fetchUniverseArtistPlayQueueBootstrap('demo-artist', 'en');
    expect(bootstrap?.playlist.map((t) => t.id)).toEqual(['track-album-1']);
    expect(mockAlbumDetails).toHaveBeenCalledTimes(1);
    expect(mockAlbumDetails).toHaveBeenCalledWith(
      'demo-artist',
      'album-1',
      expect.objectContaining({ playbackBootstrap: true })
    );

    await bootstrap?.detailsInflight;
    expect(mockAlbumDetails.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  test('terminates for multi-album artist when some detail fetches reject (no busy-wait)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [catalogRow('album-1'), catalogRow('album-2'), catalogRow('album-3')],
      })
    );

    mockAlbumDetails.mockImplementation(async (_slug, albumId) => {
      if (albumId === 'album-2') {
        throw new Error('simulated network failure');
      }
      return detailsPayload(albumId, [`track-${albumId}`]) as never;
    });

    const bootstrap = await Promise.race([
      fetchUniverseArtistPlayQueueBootstrap('demo-artist', 'en'),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('bootstrap hung')), 800)),
    ]);

    expect(bootstrap?.playlist.map((t) => t.id)).toEqual(['track-album-1']);
    expect(mockAlbumDetails).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    await bootstrap?.detailsInflight;
    expect(mockAlbumDetails.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  test('returns after first album details — does not wait for blocked later albums', async () => {
    let releaseSecond!: () => void;
    const blockSecond = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [catalogRow('album-1'), catalogRow('album-2'), catalogRow('album-3')],
      })
    );

    mockAlbumDetails.mockImplementation(async (_slug, albumId) => {
      if (albumId === 'album-2') {
        await blockSecond;
      }
      const trackId = albumId === 'album-1' ? 't1' : albumId === 'album-2' ? 't2' : 't3';
      return detailsPayload(albumId, [trackId]) as never;
    });

    const bootstrap = await fetchUniverseArtistPlayQueueBootstrap('demo-artist', 'en');

    expect(bootstrap?.playlist.map((t) => t.id)).toEqual(['t1']);
    expect(bootstrap?.tailStartIndex).toBe(1);
    expect(mockAlbumDetails).toHaveBeenCalledTimes(1);

    releaseSecond();
    await bootstrap?.detailsInflight;
    expect(mockAlbumDetails.mock.calls.length).toBeGreaterThanOrEqual(3);
    await bootstrap?.detailsInflight;
  });

  test('skips catalog albums until the first with playable tracks', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [catalogRow('album-1'), catalogRow('album-2'), catalogRow('album-3')],
      })
    );

    mockAlbumDetails.mockImplementation(async (_slug, albumId) => {
      if (albumId === 'album-3') {
        return detailsPayload(albumId, ['playable']) as never;
      }
      const lockedId = albumId === 'album-1' ? 'locked' : 'also-locked';
      return {
        ...detailsPayload(albumId, [lockedId]),
        tracks: detailsPayload(albumId, [lockedId]).tracks.map((t) => ({
          ...t,
          playbackLocked: true,
        })),
      } as never;
    });

    const bootstrap = await fetchUniverseArtistPlayQueueBootstrap('demo-artist', 'en');

    expect(bootstrap?.playlist.map((t) => t.id)).toEqual(['playable']);
    expect(bootstrap?.tailStartIndex).toBe(3);
    await bootstrap?.detailsInflight;
  });

  test('tail appends remaining albums from prefetch cache without extra network', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: [catalogRow('album-1'), catalogRow('album-2')] })
    );

    mockAlbumDetails.mockImplementation(async (_slug, albumId) => {
      if (albumId === 'album-1') {
        return detailsPayload('album-1', ['shared', 'a2']) as never;
      }
      return detailsPayload('album-2', ['shared', 'b1']) as never;
    });

    const bootstrap = await fetchUniverseArtistPlayQueueBootstrap('demo-artist', 'en');
    expect(bootstrap).not.toBeNull();
    expect(mockAlbumDetails.mock.calls.length).toBe(1);

    await new Promise((r) => setTimeout(r, 0));
    await bootstrap!.detailsInflight;
    const callsAfterPrefetch = mockAlbumDetails.mock.calls.length;

    const full = await fetchUniverseArtistPlayQueueTail(
      'demo-artist',
      'en',
      bootstrap!,
      bootstrap!.playlist
    );

    expect(full.map((t) => t.id)).toEqual(['shared', 'a2', 'b1']);
    expect(full[2]?.queueAlbumMeta?.cover).toBe('cover-album-2.jpg');
    expect(mockAlbumDetails.mock.calls.length).toBe(callsAfterPrefetch);
  });
});
