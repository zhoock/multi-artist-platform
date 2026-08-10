/**
 * Checkout guard — release abandoned pending rows (I-P6).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: jest.fn(() => true),
}));

jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(() => null),
}));

import { query } from '../db';
import {
  findOpenCheckoutSubscriptionPayment,
  releaseAbandonedCheckoutPayments,
} from '../subscription-billing';
import { findBlockingCheckoutPayment } from '../subscription-checkout-guard';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('releaseAbandonedCheckoutPayments', () => {
  test('cancels orphan pending checkout rows without provider_payment_id', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ id: 'pay-1' }], 1));

    const count = await releaseAbandonedCheckoutPayments(USER_ID);

    expect(count).toBe(1);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('provider_payment_id IS NULL');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('kind = ANY($2::text[])');
  });
});

describe('findOpenCheckoutSubscriptionPayment', () => {
  test('scopes open guard to checkout kinds only', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ id: 'pay-checkout' }]));

    const open = await findOpenCheckoutSubscriptionPayment(USER_ID);

    expect(open?.id).toBe('pay-checkout');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('kind = ANY($3::text[])');
  });
});

describe('findBlockingCheckoutPayment', () => {
  test('returns null after releasing orphans and finding no open checkout', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([], 0))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const open = await findBlockingCheckoutPayment(USER_ID);

    expect(open).toBeNull();
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });
});
