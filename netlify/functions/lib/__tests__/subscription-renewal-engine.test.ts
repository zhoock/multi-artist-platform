/**
 * Unit tests for subscription-renewal-engine rollback (PR-7.1, PR-10.1 PRE_PROVIDER).
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
  cancelOrphanPendingRenewalPayments: jest.fn(),
  attachProviderPaymentId: jest.fn(),
  createPendingSubscriptionPayment: jest.fn(),
  getPlanAmountRub: jest.fn(() => 1),
  getPlanDefinition: jest.fn(() => ({ description: 'test', slotsLimit: 20 })),
  getPlanPriceCurrencyCode: jest.fn(() => 'RUB'),
  resolveRenewalChargePlanSlug: jest.fn((plan: string) => plan),
}));

jest.mock('../subscription-renewal-fulfillment', () => ({
  applySubscriptionPeriodEnded: jest.fn(async () => false),
}));

import { query } from '../db';
import {
  cancelOrphanPendingRenewalPayments,
  cleanupPendingRenewalPayment,
} from '../subscription-billing';
import {
  reconcileOrphanPendingRenewalsBeforeChargeSelection,
  rollbackRenewalChargeAttempt,
  runRenewalCycle,
} from '../subscription-renewal-engine';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCleanup = cleanupPendingRenewalPayment as jest.MockedFunction<
  typeof cleanupPendingRenewalPayment
>;
const mockedCancelOrphans = cancelOrphanPendingRenewalPayments as jest.MockedFunction<
  typeof cancelOrphanPendingRenewalPayments
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
  mockedCancelOrphans.mockResolvedValue(undefined);
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

describe('reconcileOrphanPendingRenewalsBeforeChargeSelection', () => {
  test('reconciles orphan pending for charge-due subscriptions without pending guard', async () => {
    const dueSubId = 'sub-due-1111-2222-4333-8444-555555555555';
    const userId = 'user-aaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const now = new Date('2026-08-11T12:00:00.000Z');

    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([{ id: dueSubId }]))
      .mockResolvedValueOnce(fakeQueryResult([{ user_id: userId }]));

    await reconcileOrphanPendingRenewalsBeforeChargeSelection(now);

    const dueListSql = String(mockedQuery.mock.calls[0]?.[0]);
    expect(dueListSql).not.toContain('NOT EXISTS');
    expect(mockedCancelOrphans).toHaveBeenCalledWith(userId);
  });
});

describe('runRenewalCycle orphan reconcile ordering', () => {
  test('reconciles charge-due subs before charge-ready selection', async () => {
    const dueSubId = 'sub-due-1111-2222-4333-8444-555555555555';
    const userId = 'user-aaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const now = new Date('2026-08-11T12:00:00.000Z');

    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([]))
      .mockResolvedValueOnce(fakeQueryResult([{ id: dueSubId }]))
      .mockResolvedValueOnce(fakeQueryResult([{ user_id: userId }]))
      .mockResolvedValueOnce(fakeQueryResult([]));

    await runRenewalCycle(now);

    const dueListSql = String(mockedQuery.mock.calls[1]?.[0]);
    const readyListSql = String(mockedQuery.mock.calls[3]?.[0]);
    expect(dueListSql).not.toContain('NOT EXISTS');
    expect(readyListSql).toContain('NOT EXISTS');
    expect(mockedCancelOrphans).toHaveBeenCalledWith(userId);
  });
});
