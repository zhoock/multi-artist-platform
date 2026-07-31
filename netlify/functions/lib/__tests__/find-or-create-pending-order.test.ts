/**
 * Unit tests for pending-order idempotency (create-payment).
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { query, withTransaction } from '../db';
import {
  findOrCreatePendingAlbumOrder,
  normalizeCheckoutCustomerEmail,
  pendingOrderAdvisoryLockKey,
} from '../find-or-create-pending-order';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

const SELLER_ID = '11111111-1111-4111-8111-111111111111';
const ALBUM_SLUG = 'sample-album';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

const baseInput = {
  sellerUserId: SELLER_ID,
  albumId: ALBUM_SLUG,
  customerEmail: 'Buyer@Example.com',
  amount: 499,
  buyerDisplayName: 'Buyer Name',
  customerPhone: '+7 921 123-45-67',
};

function mockClient(queries: Array<{ rows: unknown[] }>): PoolClient {
  let call = 0;
  return {
    query: jest.fn(async () => {
      const row = queries[call];
      call += 1;
      if (!row) {
        throw new Error(`Unexpected query #${call}`);
      }
      return row;
    }),
  } as unknown as PoolClient;
}

describe('normalizeCheckoutCustomerEmail', () => {
  test('lowercases and trims', () => {
    expect(normalizeCheckoutCustomerEmail('  Buyer@Example.com  ')).toBe('buyer@example.com');
  });
});

describe('pendingOrderAdvisoryLockKey', () => {
  test('is stable for email casing', () => {
    expect(pendingOrderAdvisoryLockKey(ALBUM_SLUG, 'A@b.com')).toBe(
      pendingOrderAdvisoryLockKey(ALBUM_SLUG, 'a@b.com')
    );
  });
});

describe('findOrCreatePendingAlbumOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reuses existing pending order inside transaction', async () => {
    mockedWithTransaction.mockImplementation(async (fn) => {
      const client = mockClient([
        { rows: [] }, // advisory lock
        {
          rows: [{ id: ORDER_ID, amount: '499.00', status: 'pending_payment' }],
        },
      ]);
      return fn(client);
    });

    const result = await findOrCreatePendingAlbumOrder(baseInput);

    expect(result).toEqual({
      orderId: ORDER_ID,
      orderAmount: 499,
      orderStatus: 'pending_payment',
      reusedExisting: true,
    });
  });

  test('creates order when none pending', async () => {
    mockedWithTransaction.mockImplementation(async (fn) => {
      const client = mockClient([
        { rows: [] }, // advisory lock
        { rows: [] }, // no existing
        {
          rows: [{ id: ORDER_ID, amount: '499.00', status: 'pending_payment' }],
        },
      ]);
      return fn(client);
    });

    const result = await findOrCreatePendingAlbumOrder(baseInput);

    expect(result.reusedExisting).toBe(false);
    expect(result.orderId).toBe(ORDER_ID);
  });

  test('falls back to SELECT after unique violation on insert', async () => {
    mockedWithTransaction.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: '23505' })
    );
    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: ORDER_ID, amount: '499.00', status: 'pending_payment' }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await findOrCreatePendingAlbumOrder(baseInput);

    expect(result.reusedExisting).toBe(true);
    expect(result.orderId).toBe(ORDER_ID);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});
