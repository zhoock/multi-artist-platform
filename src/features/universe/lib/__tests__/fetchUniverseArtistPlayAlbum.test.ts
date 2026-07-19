import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { fetchUniverseArtistPlayAlbum } from '../fetchUniverseArtistPlayAlbum';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: jest.fn(() => null),
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';

const mockFetch = fetchWithAuthSession as jest.MockedFunction<typeof fetchWithAuthSession>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const catalogRow = {
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
};

const detailsPayload = {
  albumId: 'first-album',
  slug: 'first-album',
  title: 'First',
  cover: 'c',
  userId: 'u1',
  dbAlbumId: 'uuid-1',
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
  tracks: [
    {
      id: '1',
      title: 'Track 1',
      orderIndex: 0,
      duration: 180,
      src: 'a.mp3',
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
    },
  ],
};

describe('fetchUniverseArtistPlayAlbum', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('uses thin catalog + AlbumDetails, never fat /api/albums', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [catalogRow] }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: detailsPayload }));

    const album = await fetchUniverseArtistPlayAlbum('demo-artist', 'en');

    expect(album?.albumId).toBe('first-album');
    expect(album?.tracks).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/artists/demo-artist/albums');
    expect(mockFetch.mock.calls[1][0]).toBe('/api/artists/demo-artist/albums/first-album');
    expect(mockFetch.mock.calls.every(([url]) => !String(url).includes('/api/albums'))).toBe(true);
  });

  test('returns null when catalog has no playable albums', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [{ ...catalogRow, trackCount: 0 }],
      })
    );

    await expect(fetchUniverseArtistPlayAlbum('demo-artist', 'en')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
