/**
 * System refund revoke helper tests.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import { revokeAlbumPurchaseForRefund } from '../revoke-album-purchase-refund';

const mockedQuery = query as jest.MockedFunction<typeof query>;

const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const PURCHASE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';

describe('revokeAlbumPurchaseForRefund', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('revokes active purchase linked to order', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ id: PURCHASE_ID, revoked_at: null }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ id: PURCHASE_ID }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

    const result = await revokeAlbumPurchaseForRefund(ORDER_ID);

    expect(result).toEqual({ outcome: 'revoked', purchaseId: PURCHASE_ID });
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const updateSql = mockedQuery.mock.calls[1]?.[0] as string;
    expect(updateSql).toContain('revoked_at = CURRENT_TIMESTAMP');
    expect(updateSql).toContain('revoked_by_user = NULL');
  });

  test('returns already_revoked for purchase with revoked_at set', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: PURCHASE_ID, revoked_at: new Date('2026-01-01T00:00:00Z') }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await revokeAlbumPurchaseForRefund(ORDER_ID);

    expect(result).toEqual({ outcome: 'already_revoked', purchaseId: PURCHASE_ID });
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  test('returns no_purchase when order has no purchase row', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await revokeAlbumPurchaseForRefund(ORDER_ID);

    expect(result).toEqual({ outcome: 'no_purchase' });
  });
});
