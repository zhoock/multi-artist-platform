import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { fetchUniverseArtistPlayQueue } from '../fetchUniverseArtistPlayQueue';

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

const catalogRow = (overrides: Record<string, unknown> = {}) => ({
  albumId: 'first-album',
  slug: 'first-album',
  title: 'First',
  cover: 'c',
  releaseDate: '2024-01-01',
  trackCount: 2,
  duration: 360,
  userId: 'u1',
  isPublished: true,
  isPublic: true,
  hasLockedTracks: false,
  hasStems: false,
  ...overrides,
});

const detailsPayload = (albumId: string, title: string, trackIds: string[]) => ({
  albumId,
  slug: albumId,
  title,
  cover: 'c',
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

describe('fetchUniverseArtistPlayQueue', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockAlbumDetails.mockReset();
  });

  test('uses thin catalog + AlbumDetails for every visible album, never fat /api/albums', async () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [
          catalogRow({ albumId: 'album-1', trackCount: 1 }),
          catalogRow({ albumId: 'album-2', title: 'Second', trackCount: 1 }),
        ],
      })
    );

    mockAlbumDetails.mockImplementation(async (_slug, albumId) => {
      const title = albumId === 'album-1' ? 'First' : 'Second';
      const trackId = albumId === 'album-1' ? 't1' : 't2';
      return detailsPayload(albumId, title, [trackId]) as never;
    });

    const resultPromise = fetchUniverseArtistPlayQueue('demo-artist', 'en');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result?.playlist.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(result?.firstAlbum.albumId).toBe('album-1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockAlbumDetails).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/artists/demo-artist/albums');
    expect(mockFetch.mock.calls.every(([url]) => !String(url).includes('/api/albums'))).toBe(true);
    jest.useRealTimers();
  });

  test('unpublished catalog album is excluded from queue fetches', async () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [
          catalogRow({
            albumId: 'hidden-album',
            isPublished: false,
            trackCount: 3,
          }),
          catalogRow({ albumId: 'public-album', trackCount: 1 }),
        ],
      })
    );

    mockAlbumDetails.mockResolvedValueOnce(
      detailsPayload('public-album', 'Public', ['only']) as never
    );

    const resultPromise = fetchUniverseArtistPlayQueue('demo-artist', 'en');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result?.playlist.map((t) => t.id)).toEqual(['only']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockAlbumDetails).toHaveBeenCalledWith('demo-artist', 'public-album', expect.anything());
    jest.useRealTimers();
  });

  test('returns null when catalog has no playable albums', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [{ ...catalogRow(), trackCount: 0 }],
      })
    );

    await expect(fetchUniverseArtistPlayQueue('demo-artist', 'en')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
