/**
 * Unit tests for subscription-renewal-engine rollback (PR-7.1, PR-10.1 PRE_PROVIDER).
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

const clientQuery = jest.fn();

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
  withTransaction: jest.fn((fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
    fn({ query: clientQuery })
  ),
}));

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

jest.mock('../subscription-billing', () => ({
  cleanupPendingRenewalPayment: jest.fn(),
  cleanupPendingRenewalPaymentWithClient: jest.fn(),
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
  cleanupPendingRenewalPaymentWithClient,
} from '../subscription-billing';
import {
  reconcileOrphanPendingRenewalsBeforeChargeSelection,
  previewRenewalCycle,
  rollbackRenewalChargeAttempt,
  runRenewalCycle,
  listChargeReadySubscriptionIds,
} from '../subscription-renewal-engine';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCleanupWithClient = cleanupPendingRenewalPaymentWithClient as jest.MockedFunction<
  typeof cleanupPendingRenewalPaymentWithClient
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
  mockedCleanupWithClient.mockResolvedValue(undefined);
  clientQuery.mockResolvedValue(fakeQueryResult());
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

    expect(mockedCleanupWithClient).toHaveBeenCalledWith(
      expect.objectContaining({ query: clientQuery }),
      PAYMENT_ROW_ID,
      USER_ID
    );
    const restoreCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('next_charge_at = $2')
    );
    expect(restoreCall?.[1]).toEqual([SUB_ID, RESTORE_AT, USER_ID]);
  });

  test('restores next_charge_at without cleanup when no payment row id', async () => {
    await rollbackRenewalChargeAttempt({
      subscriptionId: SUB_ID,
      userId: USER_ID,
      restoreNextChargeAt: RESTORE_AT,
    });

    expect(mockedCleanupWithClient).not.toHaveBeenCalled();
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
    expect(dueListSql).not.toContain('subscription_payments');
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
    expect(dueListSql).not.toContain('subscription_payments');
    expect(readyListSql).toContain('subscription_payments');
    expect(mockedCancelOrphans).toHaveBeenCalledWith(userId);
  });
});

describe('previewRenewalCycle', () => {
  test('counts due subscriptions using SELECT only — no claims, reconciles or charges', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    mockedQuery.mockImplementation(async (sql: unknown) =>
      String(sql).includes('cancel_at_period_end')
        ? fakeQueryResult([{ id: 'ended-1', user_id: USER_ID }])
        : fakeQueryResult([{ id: 'due-1' }, { id: 'due-2' }])
    );

    await expect(previewRenewalCycle(now)).resolves.toEqual({
      autoRenewEnabled: true,
      periodsEndedDue: 1,
      chargesDue: 2,
    });

    expect(mockedQuery).toHaveBeenCalledTimes(2);
    for (const [sql] of mockedQuery.mock.calls) {
      expect(String(sql).trim()).toMatch(/^SELECT/i);
    }
    expect(mockedCancelOrphans).not.toHaveBeenCalled();
    expect(mockedCleanupWithClient).not.toHaveBeenCalled();
  });
});

describe('listChargeReadySubscriptionIds billing_origin filter', () => {
  test('includes runtime billing_origin SQL fragment', async () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'test';

    await listChargeReadySubscriptionIds(new Date());

    const readyListSql = String(
      mockedQuery.mock.calls.find((c) => String(c[0]).includes('NOT EXISTS'))?.[0]
    );
    expect(readyListSql).toContain("billing_origin = 'dev'");
    expect(readyListSql).not.toContain('@pr10-e2e.test');
  });

  test('excludes PR-10 e2e users on production runtime', async () => {
    delete process.env.DEV_PAYMENT_MODE;
    process.env.NODE_ENV = 'production';
    process.env.CONTEXT = 'production';

    await listChargeReadySubscriptionIds(new Date());

    const readyListSql = String(
      mockedQuery.mock.calls.find((c) => String(c[0]).includes('subscription_payments'))?.[0]
    );
    expect(readyListSql).toContain('@pr10-e2e.test');
    expect(readyListSql).toContain("billing_origin = 'production'");
  });
});
