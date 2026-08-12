/**
 * PR-10.1 — POST_PROVIDER / PRE_PROVIDER phase safety (C-1).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: jest.fn(() => true),
}));

jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(() => ({ shopId: 'shop-test', secretKey: 'secret-test' })),
}));

jest.mock('../complete-dev-payment', () => ({
  attachDevSucceededSubscriptionCheckout: jest.fn(),
}));

jest.mock('../subscription-billing', () => ({
  attachProviderPaymentId: jest.fn(),
  cancelOrphanPendingRenewalPayments: jest.fn(),
  cleanupPendingRenewalPayment: jest.fn(),
  createPendingSubscriptionPayment: jest.fn(),
  getPlanAmountRub: jest.fn(() => 1),
  getPlanDefinition: jest.fn(() => ({ description: 'test' })),
  getPlanPriceCurrencyCode: jest.fn(() => 'RUB'),
  resolveRenewalChargePlanSlug: jest.fn(() => 'explorer'),
}));

jest.mock('../subscription-payment-router', () => ({
  processSubscriptionProviderPayment: jest.fn(),
}));

jest.mock('../subscription-provider-payment', () => ({
  mapDevSubscriptionPaymentToProviderPayment: jest.fn(),
}));

import { attachDevSucceededSubscriptionCheckout } from '../complete-dev-payment';
import { isDevPaymentModeEnabled } from '../dev-payment-mode';
import { query } from '../db';
import {
  attachProviderPaymentId,
  cancelOrphanPendingRenewalPayments,
  cleanupPendingRenewalPayment,
  createPendingSubscriptionPayment,
} from '../subscription-billing';
import { processSubscriptionProviderPayment } from '../subscription-payment-router';
import { mapDevSubscriptionPaymentToProviderPayment } from '../subscription-provider-payment';
import { attemptRenewalChargeForSubscription } from '../subscription-renewal-engine';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCreatePending = createPendingSubscriptionPayment as jest.MockedFunction<
  typeof createPendingSubscriptionPayment
>;
const mockedAttachDev = attachDevSucceededSubscriptionCheckout as jest.MockedFunction<
  typeof attachDevSucceededSubscriptionCheckout
>;
const mockedAttachProvider = attachProviderPaymentId as jest.MockedFunction<
  typeof attachProviderPaymentId
>;
const mockedCleanup = cleanupPendingRenewalPayment as jest.MockedFunction<
  typeof cleanupPendingRenewalPayment
>;
const mockedCancelOrphan = cancelOrphanPendingRenewalPayments as jest.MockedFunction<
  typeof cancelOrphanPendingRenewalPayments
>;
const mockedProcess = processSubscriptionProviderPayment as jest.MockedFunction<
  typeof processSubscriptionProviderPayment
>;
const mockedMapDev = mapDevSubscriptionPaymentToProviderPayment as jest.MockedFunction<
  typeof mapDevSubscriptionPaymentToProviderPayment
>;
const mockedDevMode = isDevPaymentModeEnabled as jest.MockedFunction<
  typeof isDevPaymentModeEnabled
>;

const SUB_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const PROVIDER_PAYMENT_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_NEXT_CHARGE = new Date('2026-08-01T00:00:00.000Z');

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

function claimRow() {
  return {
    id: SUB_ID,
    user_id: USER_ID,
    status: 'active',
    plan: 'explorer',
    slots_limit: 20,
    provider: 'yookassa',
    provider_subscription_id: null,
    started_at: new Date('2026-08-01T00:00:00.000Z'),
    expires_at: new Date('2026-09-01T00:00:00.000Z'),
    payment_method_id: 'pm-test',
    payment_method_title: null,
    next_charge_at: new Date('2026-08-05T00:00:00.000Z'),
    renewal_attempt_count: 0,
    scheduled_plan: null,
    first_failed_at: null,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
    previous_next_charge_at: PREVIOUS_NEXT_CHARGE,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedDevMode.mockReturnValue(true);

  mockedQuery.mockImplementation(async (text) => {
    const sql = String(text);
    if (sql.includes('WITH candidate AS')) {
      return fakeQueryResult([claimRow()]);
    }
    if (sql.includes('FROM subscription_payments WHERE id = $1')) {
      return fakeQueryResult([
        {
          id: PAYMENT_ROW_ID,
          user_id: USER_ID,
          provider: 'yookassa',
          provider_payment_id: PROVIDER_PAYMENT_ID,
          status: 'pending',
          amount: '1.00',
          currency: 'RUB',
          plan: 'explorer',
          kind: 'renewal',
        },
      ]);
    }
    return fakeQueryResult();
  });

  mockedCreatePending.mockResolvedValue(PAYMENT_ROW_ID);
  mockedAttachDev.mockResolvedValue({ paymentId: PROVIDER_PAYMENT_ID });
  mockedAttachProvider.mockResolvedValue(undefined);
  mockedCleanup.mockResolvedValue(undefined);
  mockedCancelOrphan.mockResolvedValue(undefined);
  mockedMapDev.mockReturnValue({
    id: PROVIDER_PAYMENT_ID,
    status: 'succeeded',
    amount: { value: '1.00', currency: 'RUB' },
    metadata: {
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'explorer',
      kind: 'renewal',
    },
    paymentMethod: null,
  });
});

describe('attemptRenewalChargeForSubscription POST_PROVIDER (PR-10.1)', () => {
  test('reconciles orphan pending renewal and retries claim once', async () => {
    let claimAttempts = 0;
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WITH candidate AS')) {
        claimAttempts += 1;
        return fakeQueryResult(claimAttempts === 1 ? [] : [claimRow()]);
      }
      if (sql.includes('SELECT user_id FROM subscriptions WHERE id = $1')) {
        return fakeQueryResult([{ user_id: USER_ID }]);
      }
      if (sql.includes('FROM subscription_payments WHERE id = $1')) {
        return fakeQueryResult([
          {
            id: PAYMENT_ROW_ID,
            user_id: USER_ID,
            provider: 'yookassa',
            provider_payment_id: PROVIDER_PAYMENT_ID,
            status: 'pending',
            amount: '1.00',
            currency: 'RUB',
            plan: 'explorer',
            kind: 'renewal',
          },
        ]);
      }
      return fakeQueryResult();
    });
    mockedProcess.mockResolvedValue({
      subscriptionRenewed: true,
      alreadyFulfilled: false,
      planSlug: 'explorer',
    });

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('attempted');
    expect(mockedCancelOrphan).toHaveBeenCalledWith(USER_ID);
    expect(claimAttempts).toBe(2);
  });

  test('does not rollback when inline fulfillment fails after provider attach', async () => {
    mockedProcess.mockRejectedValue(new Error('fulfillment failed'));

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('error');
    expect(mockedAttachProvider).toHaveBeenCalledWith(PAYMENT_ROW_ID, PROVIDER_PAYMENT_ID);
    expect(mockedCleanup).not.toHaveBeenCalled();

    const restoreCalls = mockedQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('next_charge_at = $2')
    );
    expect(restoreCalls).toHaveLength(0);
  });
});

describe('attemptRenewalChargeForSubscription production POST inline sync', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockedDevMode.mockReturnValue(false);
    mockedProcess.mockResolvedValue({
      subscriptionRenewed: false,
      alreadyFulfilled: false,
      planSlug: 'explorer',
    });
    mockedQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('WITH candidate AS')) {
        return fakeQueryResult([claimRow()]);
      }
      if (sql.includes('SELECT email FROM users')) {
        return fakeQueryResult([{ email: 'renewal@test.example' }]);
      }
      return fakeQueryResult();
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test.each(['succeeded', 'pending', 'canceled'] as const)(
    'routes sync %s POST response through shared processor without devMode',
    async (providerStatus) => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({ id: PROVIDER_PAYMENT_ID, status: providerStatus }),
      } as Response);

      const outcome = await attemptRenewalChargeForSubscription(
        SUB_ID,
        new Date('2026-08-05T12:00:00.000Z')
      );

      expect(outcome).toBe('attempted');
      expect(mockedAttachProvider).toHaveBeenCalledWith(PAYMENT_ROW_ID, PROVIDER_PAYMENT_ID);
      expect(mockedProcess).toHaveBeenCalledTimes(1);

      const [providerPayment, userId, options] = mockedProcess.mock.calls[0]!;
      expect(userId).toBe(USER_ID);
      expect(providerPayment.status).toBe(providerStatus);
      expect(providerPayment.id).toBe(PROVIDER_PAYMENT_ID);
      expect(providerPayment.metadata).toMatchObject({
        productType: 'premium_subscription',
        userId: USER_ID,
        plan: 'explorer',
        kind: 'renewal',
      });
      expect(options).toEqual({
        observabilitySource: 'scheduler',
        subscriptionPaymentId: PAYMENT_ROW_ID,
        now: new Date('2026-08-05T12:00:00.000Z'),
      });
      expect(options).not.toHaveProperty('devMode');
    }
  );

  test('does not inline-process waiting_for_capture POST response', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ id: PROVIDER_PAYMENT_ID, status: 'waiting_for_capture' }),
    } as Response);

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('attempted');
    expect(mockedAttachProvider).toHaveBeenCalledWith(PAYMENT_ROW_ID, PROVIDER_PAYMENT_ID);
    expect(mockedProcess).not.toHaveBeenCalled();
  });
});

describe('attemptRenewalChargeForSubscription PRE_PROVIDER (PR-10.1)', () => {
  test('rolls back when createPendingSubscriptionPayment fails', async () => {
    mockedCreatePending.mockRejectedValue(new Error('insert failed'));

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('error');
    expect(mockedCleanup).not.toHaveBeenCalled();
    expect(mockedAttachProvider).not.toHaveBeenCalled();

    const restoreCalls = mockedQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('next_charge_at = $2')
    );
    expect(restoreCalls.length).toBeGreaterThan(0);
  });
});
