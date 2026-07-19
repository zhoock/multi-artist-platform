import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { fetchAlbumDetails } from '../fetchAlbumDetails';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: jest.fn(() => null),
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';

const mockFetchWithAuthSession = fetchWithAuthSession as jest.MockedFunction<
  typeof fetchWithAuthSession
>;

describe('fetchAlbumDetails', () => {
  beforeEach(() => {
    mockFetchWithAuthSession.mockReset();
  });

  test('requests nested artist album details path and normalizes payload', async () => {
    mockFetchWithAuthSession.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          albumId: '23-remastered',
          slug: '23-remastered',
          title: '23',
          cover: 'c',
          userId: 'u1',
          dbAlbumId: 'uuid',
          description: 'd',
          details: [],
          release: { date: '2020-01-01' },
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
          tracks: [],
        },
      }),
    } as Response);

    const album = await fetchAlbumDetails('smolyanoe-chuchelko', '23-remastered');

    expect(mockFetchWithAuthSession).toHaveBeenCalledWith(
      '/api/artists/smolyanoe-chuchelko/albums/23-remastered',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(album.albumId).toBe('23-remastered');
    expect(album.title).toBe('23');
  });

  test('throws AlbumDetailsFetchError on 404', async () => {
    mockFetchWithAuthSession.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ code: 'ALBUM_NOT_FOUND' }),
    } as Response);

    await expect(fetchAlbumDetails('artist', 'missing')).rejects.toMatchObject({
      name: 'AlbumDetailsFetchError',
      status: 404,
      code: 'ALBUM_NOT_FOUND',
    });
  });
});
