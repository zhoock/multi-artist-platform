/**
 * PR-10.2 — claimSubscriptionPaymentSuccess hardening tests.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

import { query } from '../db';
import {
  claimSubscriptionPaymentSuccess,
  CLAIMABLE_SUBSCRIPTION_PAYMENT_SUCCESS_STATUSES,
} from '../subscription-billing';

const mockedQuery = query as jest.MockedFunction<typeof query>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ID = 'yookassa-pay-001';

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

describe('claimSubscriptionPaymentSuccess (PR-10.2)', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  test('claims from pending status', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ id: 'sp-1' }]));

    const result = await claimSubscriptionPaymentSuccess(PAYMENT_ID, USER_ID);

    expect(result).toBe('claimed');
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual([
      PAYMENT_ID,
      USER_ID,
      CLAIMABLE_SUBSCRIPTION_PAYMENT_SUCCESS_STATUSES,
    ]);
  });

  test('returns already_succeeded when row is terminal succeeded', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([])).mockResolvedValueOnce(
      fakeQueryResult([
        {
          id: 'sp-1',
          user_id: USER_ID,
          provider: 'yookassa',
          provider_payment_id: PAYMENT_ID,
          status: 'succeeded',
          amount: '1.00',
          currency: 'RUB',
          plan: 'explorer',
        },
      ])
    );

    const result = await claimSubscriptionPaymentSuccess(PAYMENT_ID, USER_ID);
    expect(result).toBe('already_succeeded');
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });

  test('rejects canceled → succeeded transition', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([])).mockResolvedValueOnce(
      fakeQueryResult([
        {
          id: 'sp-1',
          user_id: USER_ID,
          provider: 'yookassa',
          provider_payment_id: PAYMENT_ID,
          status: 'canceled',
          amount: '1.00',
          currency: 'RUB',
          plan: 'explorer',
        },
      ])
    );

    const result = await claimSubscriptionPaymentSuccess(PAYMENT_ID, USER_ID);
    expect(result).toBe('rejected_terminal');
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });

  test('rejects failed → succeeded transition', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([])).mockResolvedValueOnce(
      fakeQueryResult([
        {
          id: 'sp-1',
          user_id: USER_ID,
          provider: 'yookassa',
          provider_payment_id: PAYMENT_ID,
          status: 'failed',
          amount: '1.00',
          currency: 'RUB',
          plan: 'explorer',
        },
      ])
    );

    const result = await claimSubscriptionPaymentSuccess(PAYMENT_ID, USER_ID);
    expect(result).toBe('rejected_terminal');
  });

  test('returns not_found when payment row missing', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    const result = await claimSubscriptionPaymentSuccess(PAYMENT_ID, USER_ID);
    expect(result).toBe('not_found');
  });
});
