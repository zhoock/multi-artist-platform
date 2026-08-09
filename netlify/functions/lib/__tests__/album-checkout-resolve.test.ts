/**
 * Unit tests for album checkout resolve (recovery + pending).
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../fulfill-album-purchase', () => ({
  findSucceededPaymentForOrder: jest.fn(),
  fulfillPaidOrderPurchaseInTransaction: jest.fn(),
  sendAlbumPurchaseConfirmationEmail: jest.fn(),
}));

import { query, withTransaction } from '../db';
import {
  findSucceededPaymentForOrder,
  fulfillPaidOrderPurchaseInTransaction,
  sendAlbumPurchaseConfirmationEmail,
} from '../fulfill-album-purchase';
import { CheckoutAlreadyOwnedError, resolveAlbumCheckoutOrder } from '../album-checkout-resolve';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockedFindSucceededPayment = findSucceededPaymentForOrder as jest.MockedFunction<
  typeof findSucceededPaymentForOrder
>;
const mockedFulfillInTx = fulfillPaidOrderPurchaseInTransaction as jest.MockedFunction<
  typeof fulfillPaidOrderPurchaseInTransaction
>;
const mockedSendEmail = sendAlbumPurchaseConfirmationEmail as jest.MockedFunction<
  typeof sendAlbumPurchaseConfirmationEmail
>;

const SELLER_ID = '11111111-1111-4111-8111-111111111111';
const ALBUM_SLUG = 'sample-album';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = 'pay-provider-1';

const baseInput = {
  sellerUserId: SELLER_ID,
  albumId: ALBUM_SLUG,
  customerEmail: 'Buyer@Example.com',
  amount: 499,
  buyerDisplayName: 'Buyer Name',
  customerPhone: null as string | null,
};

function mockClient(steps: Array<{ rows: unknown[] }>): PoolClient {
  let call = 0;
  return {
    query: jest.fn(async () => {
      const row = steps[call];
      call += 1;
      if (!row) {
        throw new Error(`Unexpected query #${call}`);
      }
      return row;
    }),
  } as unknown as PoolClient;
}

describe('resolveAlbumCheckoutOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('recovers paid order without purchase row', async () => {
    mockedWithTransaction.mockImplementation(async (fn) => {
      const client = mockClient([
        { rows: [] }, // advisory lock
        { rows: [] }, // active purchase check
        { rows: [{ id: ORDER_ID }] }, // paid without purchase
      ]);
      mockedFindSucceededPayment.mockResolvedValueOnce({ provider_payment_id: PAYMENT_ID });
      mockedFulfillInTx.mockResolvedValueOnce({
        purchaseId: 'purchase-1',
        purchaseToken: 'token-1',
        paymentId: PAYMENT_ID,
      });
      return fn(client);
    });

    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          album_id: ALBUM_SLUG,
          customer_email: 'buyer@example.com',
          buyer_display_name: 'Buyer Name',
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await resolveAlbumCheckoutOrder(baseInput);

    expect(result).toEqual({
      kind: 'recovered',
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    });
    expect(mockedFulfillInTx).toHaveBeenCalledWith(expect.anything(), ORDER_ID);
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
  });

  test('throws when active purchase already exists', async () => {
    mockedWithTransaction.mockImplementation(async (fn) => {
      const client = mockClient([
        { rows: [] }, // advisory lock
        { rows: [{ one: 1 }] }, // active purchase exists
      ]);
      return fn(client);
    });

    await expect(resolveAlbumCheckoutOrder(baseInput)).rejects.toBeInstanceOf(
      CheckoutAlreadyOwnedError
    );
  });
});
