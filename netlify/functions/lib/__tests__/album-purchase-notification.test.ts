import { insertAlbumPurchaseUserNotification } from '../user-notifications-db';
import { notifyArtistAlbumPurchaseOnFulfillment } from '../album-purchase-notification';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../resolve-album-key', () => ({
  resolveAlbumByKey: jest.fn(),
}));

jest.mock('../purchases', () => ({
  resolveUserIdForCustomerEmail: jest.fn(),
}));

jest.mock('../user-notifications-db', () => ({
  insertAlbumPurchaseUserNotification: jest.fn(async () => {}),
}));

import { query } from '../db';
import { resolveAlbumByKey } from '../resolve-album-key';
import { resolveUserIdForCustomerEmail } from '../purchases';

const mockQuery = query as jest.Mock;
const mockResolveAlbum = resolveAlbumByKey as jest.Mock;
const mockResolveBuyer = resolveUserIdForCustomerEmail as jest.Mock;
const mockInsert = insertAlbumPurchaseUserNotification as jest.Mock;

describe('notifyArtistAlbumPurchaseOnFulfillment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates notification for paid order with album owner as recipient', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'order-1',
          album_id: 'rubber-soul',
          customer_email: 'buyer@example.com',
          status: 'paid',
        },
      ],
    });
    mockResolveAlbum.mockResolvedValueOnce({
      userId: 'artist-1',
      albumSlug: 'rubber-soul',
      artistPublicSlug: 'beatles',
      album: 'Rubber Soul',
      cover: 'cover-key',
    });
    mockResolveBuyer.mockResolvedValueOnce('buyer-1');

    await notifyArtistAlbumPurchaseOnFulfillment('order-1');

    expect(mockInsert).toHaveBeenCalledWith({
      orderId: 'order-1',
      artistUserId: 'artist-1',
      albumSlug: 'rubber-soul',
      artistSlug: 'beatles',
      albumTitle: 'Rubber Soul',
      albumCoverPath: 'cover-key',
    });
  });

  test('skips when order is not paid', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'order-1',
          album_id: 'rubber-soul',
          customer_email: 'buyer@example.com',
          status: 'pending_payment',
        },
      ],
    });

    await notifyArtistAlbumPurchaseOnFulfillment('order-1');

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockResolveAlbum).not.toHaveBeenCalled();
  });

  test('skips artist buying own album', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'order-1',
          album_id: 'rubber-soul',
          customer_email: 'artist@example.com',
          status: 'paid',
        },
      ],
    });
    mockResolveAlbum.mockResolvedValueOnce({
      userId: 'artist-1',
      albumSlug: 'rubber-soul',
      artistPublicSlug: 'beatles',
      album: 'Rubber Soul',
      cover: null,
    });
    mockResolveBuyer.mockResolvedValueOnce('artist-1');

    await notifyArtistAlbumPurchaseOnFulfillment('order-1');

    expect(mockInsert).not.toHaveBeenCalled();
  });
});
