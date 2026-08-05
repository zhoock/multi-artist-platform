/**
 * Unit tests for subscription-renewal-engine rollback (PR-7.1).
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

jest.mock('../subscription-billing', () => ({
  cleanupPendingRenewalPayment: jest.fn(),
}));

import { query } from '../db';
import { cleanupPendingRenewalPayment } from '../subscription-billing';
import { rollbackRenewalChargeAttempt } from '../subscription-renewal-engine';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCleanup = cleanupPendingRenewalPayment as jest.MockedFunction<
  typeof cleanupPendingRenewalPayment
>;

const SUB_ID = 'sub-11111111-2222-4333-8444-555555555555';
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = 'pay-row-1';
const RESTORE_AT = new Date('2026-08-05T00:00:00.000Z');

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockResolvedValue(fakeQueryResult());
  mockedCleanup.mockResolvedValue(undefined);
});

describe('rollbackRenewalChargeAttempt', () => {
  test('cleans up pending renewal row and restores next_charge_at', async () => {
    await rollbackRenewalChargeAttempt({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      restoreNextChargeAt: RESTORE_AT,
      subscriptionPaymentId: PAYMENT_ROW_ID,
    });

    expect(mockedCleanup).toHaveBeenCalledWith(PAYMENT_ROW_ID, USER_ID);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('next_charge_at = $2');
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual([SUB_ID, RESTORE_AT, USER_ID]);
  });

  test('restores next_charge_at without cleanup when no payment row id', async () => {
    await rollbackRenewalChargeAttempt({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      restoreNextChargeAt: RESTORE_AT,
    });

    expect(mockedCleanup).not.toHaveBeenCalled();
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});
