/**
 * PR-10.1 — cleanupPendingRenewalPayment POST_PROVIDER safety (C-1).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

import { query } from '../db';
import { cleanupPendingRenewalPayment } from '../subscription-billing';

const mockedQuery = query as jest.MockedFunction<typeof query>;

const PAYMENT_ROW_ID = 'pay-row-1';
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockResolvedValue(fakeQueryResult());
});

describe('cleanupPendingRenewalPayment (PR-10.1)', () => {
  test('DELETE only when provider_payment_id IS NULL', async () => {
    await cleanupPendingRenewalPayment(PAYMENT_ROW_ID, USER_ID);

    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('provider_payment_id IS NULL');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('DELETE FROM subscription_payments');
  });

  test('UPDATE cancel only when provider_payment_id IS NULL', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult()).mockResolvedValueOnce(fakeQueryResult());

    await cleanupPendingRenewalPayment(PAYMENT_ROW_ID, USER_ID);

    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const updateSql = String(mockedQuery.mock.calls[1]?.[0]);
    expect(updateSql).toContain("status = 'canceled'");
    expect(updateSql).toContain('provider_payment_id IS NULL');
  });

  test('skips cancel UPDATE when DELETE succeeds', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ id: PAYMENT_ROW_ID }]));

    await cleanupPendingRenewalPayment(PAYMENT_ROW_ID, USER_ID);

    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});
