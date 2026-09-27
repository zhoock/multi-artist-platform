import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const queryMock = jest.fn();
const resolveAlbumByKeyMock = jest.fn();
const fetchTracksForResolvedAlbumMock = jest.fn();

jest.mock('../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

jest.mock('../resolve-album-key', () => ({
  resolveAlbumByKey: (...args: unknown[]) => resolveAlbumByKeyMock(...args),
  resolveAlbumSlug: jest.fn(),
  fetchTracksForResolvedAlbum: (...args: unknown[]) => fetchTracksForResolvedAlbumMock(...args),
}));

import { fetchPurchasesForAccountUser } from '../purchases';

describe('fetchPurchasesForAccountUser', () => {
  beforeEach(() => {
    queryMock.mockReset();
    resolveAlbumByKeyMock.mockReset();
    fetchTracksForResolvedAlbumMock.mockReset();
  });

  test('does not expose purchase token fields in API DTO', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 'purchase-uuid',
          order_id: 'order-uuid',
          album_id: 'album-slug',
          purchased_at: new Date('2026-01-01T00:00:00.000Z'),
          download_count: 2,
        },
      ],
    });

    resolveAlbumByKeyMock.mockResolvedValue({
      albumSlug: 'album-slug',
      userId: 'artist-uuid',
      artistDisplayName: 'Artist',
      album: 'Album Title',
      cover: null,
      lang: 'en',
    });

    fetchTracksForResolvedAlbumMock.mockResolvedValue([{ trackId: 't1', title: 'Track' }]);

    const purchases = await fetchPurchasesForAccountUser('buyer-uuid');

    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({
      id: 'purchase-uuid',
      albumId: 'album-slug',
      artistDisplayName: 'Artist',
      album: 'Album Title',
    });
    expect(purchases[0]).not.toHaveProperty('purchaseToken');
  });
});
