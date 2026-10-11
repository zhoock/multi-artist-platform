/**
 * PR-10.1 — POST_PROVIDER / PRE_PROVIDER phase safety (C-1).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { QueryResult } from 'pg';

const clientQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

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

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: jest.fn(() => true),
}));

jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(() => ({ shopId: 'shop-test', secretKey: 'secret-test' })),
}));

const mockedGuardedPost = jest.fn();

jest.mock('../subscription-renewal-dispatch-lease', () => ({
  createRenewalDispatchRunId: jest.fn(() => 'run-test'),
  acquireRenewalAttemptDispatchLease: jest.fn(async () => ({
    ok: true,
    lease: {
      subscriptionPaymentId: '22222222-2222-4222-8222-222222222222',
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      token: 'run-test',
      generation: 1,
      leaseUntil: new Date('2099-01-01T00:00:00.000Z'),
    },
  })),
  releaseRenewalAttemptDispatchLease: jest.fn(async () => undefined),
  attachRenewalProviderPaymentIdWithFence: jest.fn(async () => 'attached'),
}));

jest.mock('../subscription-renewal-reconcile', () => ({
  guardedRenewalYooKassaPost: (...args: unknown[]) => mockedGuardedPost(...args),
  reconcileUnresolvedRenewalAttempts: jest.fn(async () => ({
    examined: 0,
    resolved: 0,
    pending: 0,
    needsReview: 0,
    retryLater: 0,
    errors: 0,
  })),
}));

jest.mock('../complete-dev-payment', () => ({
  attachDevSucceededSubscriptionCheckout: jest.fn(),
}));

jest.mock('../subscription-billing', () => ({
  attachProviderPaymentId: jest.fn(),
  cancelOrphanPendingRenewalPayments: jest.fn(),
  claimRenewalFirstPostAt: jest.fn(async () => 'claimed' as const),
  cleanupPendingRenewalPayment: jest.fn(),
  cleanupPendingRenewalPaymentWithClient: jest.fn(),
  createRenewalAttemptRow: jest.fn(),
  findUnresolvedRenewalAttemptForSubscription: jest.fn(async () => null),
  getPlanAmountRub: jest.fn(() => 1),
  getPlanDefinition: jest.fn(() => ({ description: 'test' })),
  getPlanPriceCurrencyCode: jest.fn(() => 'RUB'),
  getRenewalAttemptPostIdentity: jest.fn(),
  hasUnresolvedRenewalPostStartedWithClient: jest.fn(async () => false),
  resolveRenewalAttemptNo: jest.fn(() => 1),
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
import { attachRenewalProviderPaymentIdWithFence } from '../subscription-renewal-dispatch-lease';
import {
  attachProviderPaymentId,
  cancelOrphanPendingRenewalPayments,
  claimRenewalFirstPostAt,
  cleanupPendingRenewalPayment,
  cleanupPendingRenewalPaymentWithClient,
  createRenewalAttemptRow,
  findUnresolvedRenewalAttemptForSubscription,
  getRenewalAttemptPostIdentity,
  hasUnresolvedRenewalPostStartedWithClient,
} from '../subscription-billing';
import { buildRenewalYookassaCreatePayload } from '../subscription-renewal-post-payload';
import { processSubscriptionProviderPayment } from '../subscription-payment-router';
import { mapDevSubscriptionPaymentToProviderPayment } from '../subscription-provider-payment';
import { attemptRenewalChargeForSubscription } from '../subscription-renewal-engine';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCreateAttempt = createRenewalAttemptRow as jest.MockedFunction<
  typeof createRenewalAttemptRow
>;
const mockedFindUnresolved = findUnresolvedRenewalAttemptForSubscription as jest.MockedFunction<
  typeof findUnresolvedRenewalAttemptForSubscription
>;
const mockedPostIdentity = getRenewalAttemptPostIdentity as jest.MockedFunction<
  typeof getRenewalAttemptPostIdentity
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
const mockedCleanupWithClient = cleanupPendingRenewalPaymentWithClient as jest.MockedFunction<
  typeof cleanupPendingRenewalPaymentWithClient
>;
const mockedCancelOrphan = cancelOrphanPendingRenewalPayments as jest.MockedFunction<
  typeof cancelOrphanPendingRenewalPayments
>;
const mockedClaimFirstPost = claimRenewalFirstPostAt as jest.MockedFunction<
  typeof claimRenewalFirstPostAt
>;
const mockedUnresolvedPost = hasUnresolvedRenewalPostStartedWithClient as jest.MockedFunction<
  typeof hasUnresolvedRenewalPostStartedWithClient
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
const mockedAttachWithFence = attachRenewalProviderPaymentIdWithFence as jest.MockedFunction<
  typeof attachRenewalProviderPaymentIdWithFence
>;

const SUB_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAYMENT_ROW_ID = '22222222-2222-4222-8222-222222222222';
const PROVIDER_PAYMENT_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_NEXT_CHARGE = new Date('2026-08-01T00:00:00.000Z');

const MOCK_FROZEN_PAYLOAD = buildRenewalYookassaCreatePayload({
  amountValue: '1.00',
  description: 'test',
  userId: USER_ID,
  planSlug: 'explorer',
  customerEmail: 'renewal@test.example',
  paymentMethodId: 'pm-test',
});

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

  mockedFindUnresolved.mockResolvedValue(null);
  mockedCreateAttempt.mockResolvedValue(PAYMENT_ROW_ID);
  mockedPostIdentity.mockResolvedValue({
    ok: true,
    idempotenceKey: `renewal-${PAYMENT_ROW_ID}`,
    payload: MOCK_FROZEN_PAYLOAD,
  });
  mockedGuardedPost.mockResolvedValue({
    ok: true,
    paymentId: PROVIDER_PAYMENT_ID,
    status: 'pending',
    route: 'initial_post',
  });
  mockedAttachDev.mockResolvedValue({ paymentId: PROVIDER_PAYMENT_ID });
  mockedAttachProvider.mockResolvedValue(undefined);
  mockedCleanup.mockResolvedValue(undefined);
  mockedCleanupWithClient.mockResolvedValue(undefined);
  clientQuery.mockResolvedValue(fakeQueryResult());
  mockedCancelOrphan.mockResolvedValue(undefined);
  mockedClaimFirstPost.mockResolvedValue('claimed');
  mockedUnresolvedPost.mockResolvedValue(false);
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

  test.each(['succeeded', 'pending', 'canceled'] as const)(
    'routes sync %s POST response through shared processor without devMode',
    async (providerStatus) => {
      mockedGuardedPost.mockResolvedValueOnce({
        ok: true,
        paymentId: PROVIDER_PAYMENT_ID,
        status: providerStatus,
        route: 'initial_post',
      });

      const outcome = await attemptRenewalChargeForSubscription(
        SUB_ID,
        new Date('2026-08-05T12:00:00.000Z')
      );

      expect(outcome).toBe('attempted');
      expect(mockedGuardedPost).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionPaymentId: PAYMENT_ROW_ID,
          claimFirstPostWhenInitial: true,
        })
      );
      expect(mockedAttachWithFence).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionPaymentId: PAYMENT_ROW_ID }),
        PROVIDER_PAYMENT_ID
      );
      expect(mockedAttachProvider).not.toHaveBeenCalled();
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
    mockedGuardedPost.mockResolvedValueOnce({
      ok: true,
      paymentId: PROVIDER_PAYMENT_ID,
      status: 'waiting_for_capture',
      route: 'initial_post',
    });

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('attempted');
    expect(mockedAttachWithFence).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionPaymentId: PAYMENT_ROW_ID }),
      PROVIDER_PAYMENT_ID
    );
    expect(mockedProcess).not.toHaveBeenCalled();
  });
});

describe('attemptRenewalChargeForSubscription PRE_PROVIDER (PR-10.1)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('quarantines stub PM and skips when YooKassa reports payment_method not saved', async () => {
    mockedDevMode.mockReturnValue(false);
    mockedCreateAttempt.mockResolvedValue(PAYMENT_ROW_ID);
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
    clientQuery.mockImplementation(async (text) => {
      const sql = String(text);
      if (sql.includes('payment_method_id = $3') && sql.includes('RETURNING id')) {
        return fakeQueryResult([{ id: SUB_ID }]);
      }
      return fakeQueryResult();
    });

    mockedGuardedPost.mockRejectedValueOnce(
      new Error(
        'YooKassa renewal create failed: 400 {\n  "description" : "This payment_method is not saved. Specify it with the saved=true value",\n  "parameter" : "payment_method_id"\n}'
      )
    );

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('skipped');
    expect(mockedCleanupWithClient).toHaveBeenCalledWith(
      expect.objectContaining({ query: clientQuery }),
      PAYMENT_ROW_ID,
      USER_ID
    );
    expect(mockedCleanup).not.toHaveBeenCalled();
    const quarantineSql = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('payment_method_id = NULL')
    );
    expect(quarantineSql?.[1]).toEqual([SUB_ID, USER_ID, 'pm-test']);
    expect(
      clientQuery.mock.calls.filter(([sql]) => String(sql).includes('next_charge_at = $2'))
    ).toHaveLength(0);
    expect(mockedAttachProvider).not.toHaveBeenCalled();
  });

  test('does not restore next_charge_at after YooKassa 400 once first_post_at was claimed', async () => {
    mockedDevMode.mockReturnValue(false);
    mockedCreateAttempt.mockResolvedValue(PAYMENT_ROW_ID);
    mockedUnresolvedPost.mockResolvedValue(true);
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

    mockedGuardedPost.mockRejectedValueOnce(
      new Error('YooKassa renewal create failed: 400 {"description":"invalid_request"}')
    );

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('error');
    expect(mockedGuardedPost).toHaveBeenCalled();
    expect(mockedCleanupWithClient).toHaveBeenCalledWith(
      expect.objectContaining({ query: clientQuery }),
      PAYMENT_ROW_ID,
      USER_ID
    );
    expect(mockedAttachProvider).not.toHaveBeenCalled();

    const quarantineSql = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('payment_method_id = NULL')
    );
    expect(quarantineSql).toBeUndefined();

    const restoreCalls = clientQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('next_charge_at = $2')
    );
    expect(restoreCalls).toHaveLength(0);
  });

  test('rolls back when createRenewalAttemptRow fails', async () => {
    mockedCreateAttempt.mockRejectedValue(new Error('insert failed'));

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('error');
    expect(mockedCleanup).not.toHaveBeenCalled();
    expect(mockedAttachProvider).not.toHaveBeenCalled();
    expect(mockedGuardedPost).not.toHaveBeenCalled();

    const restoreCalls = mockedQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('next_charge_at = $2')
    );
    expect(restoreCalls.length).toBeGreaterThan(0);
  });

  test('guarded POST returns needs_review without attach when window expired', async () => {
    mockedDevMode.mockReturnValue(false);
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
    mockedGuardedPost.mockResolvedValueOnce({ ok: false, reason: 'needs_review' });

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('skipped');
    expect(mockedAttachProvider).not.toHaveBeenCalled();
  });

  test('skips next_charge_at restore after POST failure when renewal post is unresolved', async () => {
    mockedDevMode.mockReturnValue(false);
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
    mockedUnresolvedPost.mockResolvedValue(true);
    mockedGuardedPost.mockRejectedValueOnce(new Error('network timeout'));

    const outcome = await attemptRenewalChargeForSubscription(
      SUB_ID,
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(outcome).toBe('error');
    expect(mockedGuardedPost).toHaveBeenCalled();
    expect(mockedCleanupWithClient).toHaveBeenCalled();
    expect(
      clientQuery.mock.calls.filter(([sql]) => String(sql).includes('next_charge_at = $2'))
    ).toHaveLength(0);
  });
});
