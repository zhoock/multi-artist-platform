import { applyAlbumPaymentSucceededFulfillment } from '../fulfill-album-purchase';

jest.mock('../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../email', () => ({
  sendPurchaseEmail: jest.fn(async () => ({ success: true })),
}));

jest.mock('../album-purchase-notification', () => ({
  notifyArtistAlbumPurchaseOnFulfillment: jest.fn(async () => {}),
}));

jest.mock('../resolve-album-key', () => ({
  resolveAlbumSlug: jest.fn(async () => 'album-slug'),
  resolveAlbumByKey: jest.fn(async () => ({
    album: 'Album',
    lang: 'en',
    cover: null,
    userId: 'artist-1',
    artistDisplayName: 'Artist',
    artistPublicSlug: 'artist',
    albumSlug: 'album-slug',
  })),
}));

jest.mock('../purchases', () => ({
  resolveUserIdForCustomerEmail: jest.fn(async () => 'buyer-1'),
}));

import { withTransaction, query } from '../db';
import { notifyArtistAlbumPurchaseOnFulfillment } from '../album-purchase-notification';

const mockWithTransaction = withTransaction as jest.Mock;
const mockQuery = query as jest.Mock;
const mockNotify = notifyArtistAlbumPurchaseOnFulfillment as jest.Mock;

describe('fulfill-album-purchase artist notification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithTransaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: jest.fn().mockResolvedValue({
          rows: [{ id: 'purchase-1' }],
        }),
      };
      client.query
        .mockResolvedValueOnce({ rows: [{ id: 'order-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-1',
              album_id: 'album-slug',
              customer_email: 'buyer@test.com',
              buyer_display_name: null,
              status: 'pending_payment',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ provider_payment_id: 'pay-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'purchase-1' }] });
      return fn(client);
    });
    mockQuery.mockResolvedValue({
      rows: [
        {
          album_id: 'album-slug',
          customer_email: 'buyer@test.com',
          buyer_display_name: null,
        },
      ],
    });
  });

  test('notifies artist after successful fulfillment', async () => {
    await applyAlbumPaymentSucceededFulfillment({
      orderId: 'order-1',
      providerPaymentId: 'pay-1',
      paymentStatus: 'succeeded',
      amountValue: '100.00',
      currency: 'RUB',
      albumKey: 'album-slug',
      customerEmail: 'buyer@test.com',
    });

    expect(mockNotify).toHaveBeenCalledWith('order-1');
  });

  test('does not notify when fulfillment transaction fails', async () => {
    mockWithTransaction.mockRejectedValueOnce(new Error('fulfillment failed'));

    await expect(
      applyAlbumPaymentSucceededFulfillment({
        orderId: 'order-1',
        providerPaymentId: 'pay-1',
        paymentStatus: 'succeeded',
        amountValue: '100.00',
        currency: 'RUB',
      })
    ).rejects.toThrow('fulfillment failed');

    expect(mockNotify).not.toHaveBeenCalled();
  });
});
