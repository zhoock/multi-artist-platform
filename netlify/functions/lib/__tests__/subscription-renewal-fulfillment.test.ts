/**
 * Unit tests for subscription renewal fulfillment (PR-7).
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../archive', () => ({
  deactivateExcessArchiveArtists: jest.fn(),
  extendActiveArchiveLockedUntil: jest.fn(),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
  mapSubscriptionRow: jest.fn((row: Record<string, unknown>) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    plan: row.plan,
    slotsLimit: row.slots_limit,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    paymentMethodId: row.payment_method_id,
    nextChargeAt: row.next_charge_at,
    renewalAttemptCount: row.renewal_attempt_count,
    scheduledPlan: row.scheduled_plan,
    firstFailedAt: row.first_failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })),
}));

jest.mock('../subscription-billing', () => ({
  claimSubscriptionPaymentSuccess: jest.fn(),
  claimSubscriptionPaymentCanceled: jest.fn(),
  computeSupportExpiresAt: jest.fn(() => new Date('2026-09-10T00:00:00.000Z')),
  getPlanSlotsLimit: jest.fn((plan: string) => (plan === 'explorer' ? 1 : 2)),
  isSubscriptionFulfilledForProviderPayment: jest.fn(),
  normalizeSubscriptionPlanSlug: jest.fn((plan: string | null | undefined) => {
    if (!plan?.trim()) return null;
    if (['explorer', 'collector', 'archivist'].includes(plan.trim())) return plan.trim();
    return null;
  }),
  updateSubscriptionPaymentStatus: jest.fn(),
  validatePremiumSubscriptionPayment: jest.fn(() => ({ valid: true, planSlug: 'explorer' })),
}));

import { query } from '../db';
import { deactivateExcessArchiveArtists, extendActiveArchiveLockedUntil } from '../archive';
import {
  claimSubscriptionPaymentCanceled,
  claimSubscriptionPaymentSuccess,
  isSubscriptionFulfilledForProviderPayment,
} from '../subscription-billing';
import { getViewerSubscription } from '../subscriptions';
import {
  applySubscriptionPeriodEnded,
  applyRenewalArchiveSideEffects,
  fulfillRenewalSubscriptionPayment,
  handleRenewalPaymentFailure,
  isRenewalSubscriptionPaymentKind,
  processRenewalSubscriptionProviderPayment,
} from '../subscription-renewal-fulfillment';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetSub = getViewerSubscription as jest.MockedFunction<typeof getViewerSubscription>;
const mockedDeactivateExcess = deactivateExcessArchiveArtists as jest.MockedFunction<
  typeof deactivateExcessArchiveArtists
>;
const mockedExtendLock = extendActiveArchiveLockedUntil as jest.MockedFunction<
  typeof extendActiveArchiveLockedUntil
>;
const mockedIsFulfilled = isSubscriptionFulfilledForProviderPayment as jest.MockedFunction<
  typeof isSubscriptionFulfilledForProviderPayment
>;
const mockedClaimSuccess = claimSubscriptionPaymentSuccess as jest.MockedFunction<
  typeof claimSubscriptionPaymentSuccess
>;
const mockedClaimCanceled = claimSubscriptionPaymentCanceled as jest.MockedFunction<
  typeof claimSubscriptionPaymentCanceled
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SUB_ID = 'sub-11111111-2222-4333-8444-555555555555';
const PAYMENT_ID = 'pay-renewal-1';

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

function activeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    userId: USER_ID,
    status: 'active' as const,
    plan: 'collector',
    slotsLimit: 2,
    provider: 'yookassa',
    providerSubscriptionId: 'pay-old',
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: new Date('2026-08-05T00:00:00.000Z'),
    paymentMethodId: 'pm-1',
    nextChargeAt: new Date('2026-08-05T00:00:00.000Z'),
    renewalAttemptCount: 0,
    scheduledPlan: null,
    firstFailedAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

function subscriptionRowFrom(sub: ReturnType<typeof activeSub>) {
  return {
    id: sub.id,
    user_id: sub.userId,
    status: sub.status,
    plan: sub.plan,
    slots_limit: sub.slotsLimit,
    provider: sub.provider,
    provider_subscription_id: sub.providerSubscriptionId,
    started_at: sub.startedAt,
    expires_at: sub.expiresAt,
    payment_method_id: sub.paymentMethodId,
    next_charge_at: sub.nextChargeAt,
    renewal_attempt_count: sub.renewalAttemptCount,
    scheduled_plan: sub.scheduledPlan,
    first_failed_at: sub.firstFailedAt,
    created_at: sub.createdAt,
    updated_at: sub.updatedAt,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedDeactivateExcess.mockResolvedValue(1);
  mockedExtendLock.mockResolvedValue(1);
});

describe('isRenewalSubscriptionPaymentKind', () => {
  test('recognizes renewal kind', () => {
    expect(isRenewalSubscriptionPaymentKind('renewal')).toBe(true);
    expect(isRenewalSubscriptionPaymentKind('initial')).toBe(false);
  });
});

describe('fulfillRenewalSubscriptionPayment', () => {
  test('applies scheduled_plan, deactivates excess, clears scheduled_plan', async () => {
    mockedIsFulfilled.mockResolvedValue(false);
    mockedGetSub.mockResolvedValue(
      activeSub({ scheduledPlan: 'explorer', plan: 'collector', slotsLimit: 2 })
    );
    mockedQuery.mockResolvedValue(
      fakeQueryResult([
        subscriptionRowFrom(
          activeSub({
            plan: 'explorer',
            slotsLimit: 1,
            scheduledPlan: null,
            providerSubscriptionId: PAYMENT_ID,
          })
        ),
      ])
    );

    const result = await fulfillRenewalSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'explorer',
      providerPaymentId: PAYMENT_ID,
    });

    expect(result.fulfilled).toBe(true);
    expect(mockedDeactivateExcess).toHaveBeenCalledWith(USER_ID, 1);
    expect(mockedExtendLock).toHaveBeenCalled();
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('scheduled_plan = NULL');
  });

  test('skips subscription update when already fulfilled but still runs archive side effects', async () => {
    mockedIsFulfilled.mockResolvedValue(true);
    mockedGetSub.mockResolvedValue(
      activeSub({
        plan: 'explorer',
        slotsLimit: 1,
        expiresAt: new Date('2026-09-10T00:00:00.000Z'),
      })
    );

    const result = await fulfillRenewalSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'explorer',
      providerPaymentId: PAYMENT_ID,
    });

    expect(result.alreadyFulfilled).toBe(true);
    expect(mockedQuery).not.toHaveBeenCalled();
    expect(mockedDeactivateExcess).toHaveBeenCalledWith(USER_ID, 1);
    expect(mockedExtendLock).toHaveBeenCalled();
  });
});

describe('handleRenewalPaymentFailure', () => {
  test('first failure: active → past_due, schedules retry', async () => {
    mockedGetSub.mockResolvedValue(activeSub());
    mockedQuery.mockResolvedValue(
      fakeQueryResult([
        subscriptionRowFrom(
          activeSub({
            status: 'past_due',
            renewalAttemptCount: 1,
            firstFailedAt: new Date('2026-08-05T00:00:00.000Z'),
          })
        ),
      ])
    );

    const result = await handleRenewalPaymentFailure({
      userId: USER_ID,
      providerPaymentId: PAYMENT_ID,
    });

    expect(result.handled).toBe(true);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('renewal_attempt_count');
    expect(String(mockedQuery.mock.calls[0]?.[0])).not.toContain('scheduled_plan = NULL');
  });

  test('fourth failure: DUNNING_EXHAUSTED clears scheduled_plan', async () => {
    mockedGetSub.mockResolvedValue(
      activeSub({
        status: 'past_due',
        renewalAttemptCount: 3,
        scheduledPlan: 'explorer',
        firstFailedAt: new Date('2026-08-01T00:00:00.000Z'),
      })
    );
    mockedQuery.mockResolvedValue(
      fakeQueryResult([
        subscriptionRowFrom(
          activeSub({
            status: 'expired',
            renewalAttemptCount: 4,
            scheduledPlan: null,
          })
        ),
      ])
    );

    await handleRenewalPaymentFailure({ userId: USER_ID, providerPaymentId: PAYMENT_ID });

    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('scheduled_plan = NULL');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('next_charge_at = NULL');
  });
});

describe('applySubscriptionPeriodEnded', () => {
  test('cancel_at_period_end → expired, clears scheduled_plan', async () => {
    mockedGetSub.mockResolvedValue(
      activeSub({ status: 'cancel_at_period_end', scheduledPlan: 'explorer' })
    );
    mockedQuery.mockResolvedValue(
      fakeQueryResult([
        subscriptionRowFrom(
          activeSub({ status: 'expired', scheduledPlan: null, nextChargeAt: null })
        ),
      ])
    );

    const result = await applySubscriptionPeriodEnded(SUB_ID, USER_ID);

    expect(result?.status).toBe('expired');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('scheduled_plan = NULL');
  });
});

describe('processRenewalSubscriptionProviderPayment', () => {
  test('routes succeeded renewal through fulfillment', async () => {
    mockedClaimSuccess.mockResolvedValue('claimed');
    mockedIsFulfilled.mockResolvedValue(false);
    mockedGetSub.mockResolvedValue(activeSub({ scheduledPlan: 'explorer' }));
    mockedQuery.mockResolvedValue(
      fakeQueryResult([
        subscriptionRowFrom(activeSub({ plan: 'explorer', slotsLimit: 1, scheduledPlan: null })),
      ])
    );

    const result = await processRenewalSubscriptionProviderPayment(
      {
        id: PAYMENT_ID,
        status: 'succeeded',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'explorer',
          kind: 'renewal',
        },
        paymentMethod: null,
      },
      USER_ID
    );

    expect(result.subscriptionRenewed).toBe(true);
    expect(mockedClaimSuccess).toHaveBeenCalledWith(PAYMENT_ID, USER_ID);
  });

  test('routes canceled renewal through failure handler', async () => {
    mockedClaimCanceled.mockResolvedValue('claimed');
    mockedGetSub.mockResolvedValue(activeSub());
    mockedQuery.mockResolvedValue(
      fakeQueryResult([subscriptionRowFrom(activeSub({ status: 'past_due' }))])
    );

    await processRenewalSubscriptionProviderPayment(
      {
        id: PAYMENT_ID,
        status: 'canceled',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'collector',
          kind: 'renewal',
        },
        paymentMethod: null,
      },
      USER_ID
    );

    expect(mockedClaimCanceled).toHaveBeenCalledWith(PAYMENT_ID, USER_ID);
    expect(mockedQuery).toHaveBeenCalled();
  });
});
