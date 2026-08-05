/**
 * Unit tests for patchSubscriptionAutoRenew (PR-5).
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

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
  mapSubscriptionRow: jest.requireActual('../subscriptions').mapSubscriptionRow,
}));

import { query } from '../db';
import { isSubscriptionAutoRenewEnabled } from '../subscription-feature-flag';
import {
  patchSubscriptionAutoRenew,
  SubscriptionAutoRenewPatchError,
} from '../subscription-auto-renew-patch';
import { getViewerSubscription, type Subscription } from '../subscriptions';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetViewerSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedFlag = isSubscriptionAutoRenewEnabled as jest.MockedFunction<
  typeof isSubscriptionAutoRenewEnabled
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SUB_ID = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EXPIRES = new Date('2026-09-03T00:00:00.000Z');

function fakeQueryResult(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length
): QueryResult<any> {
  return {
    rows,
    rowCount,
    command: '',
    oid: 0,
    fields: [],
  };
}

function activeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: SUB_ID,
    userId: USER_ID,
    status: 'active',
    plan: 'explorer',
    slotsLimit: 1,
    provider: 'yookassa',
    providerSubscriptionId: 'pay-1',
    startedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: EXPIRES,
    paymentMethodId: 'pm-test',
    nextChargeAt: EXPIRES,
    renewalAttemptCount: 0,
    scheduledPlan: null,
    firstFailedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function subscriptionRowFrom(sub: Subscription) {
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
    payment_method_id: sub.paymentMethodId ?? null,
    next_charge_at: sub.nextChargeAt ?? null,
    renewal_attempt_count: sub.renewalAttemptCount ?? null,
    scheduled_plan: sub.scheduledPlan ?? null,
    first_failed_at: sub.firstFailedAt ?? null,
    created_at: sub.createdAt,
    updated_at: sub.updatedAt,
  };
}

describe('patchSubscriptionAutoRenew', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFlag.mockReturnValue(true);
  });

  test('disable: active → cancel_at_period_end, clears next_charge_at', async () => {
    mockedGetViewerSubscription.mockResolvedValue(activeSubscription());

    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([
        subscriptionRowFrom(
          activeSubscription({
            status: 'cancel_at_period_end',
            nextChargeAt: null,
          })
        ),
      ])
    );

    const result = await patchSubscriptionAutoRenew(USER_ID, false);

    expect(result.subscription.status).toBe('cancel_at_period_end');
    expect(result.billing.autoRenewEnabled).toBe(false);
    expect(result.billing.status).toBe('cancel_at_period_end');
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE subscriptions'),
      expect.arrayContaining([SUB_ID, 'cancel_at_period_end', null, USER_ID])
    );
  });

  test('enable: cancel_at_period_end → active, restores next_charge_at', async () => {
    mockedGetViewerSubscription.mockResolvedValue(
      activeSubscription({
        status: 'cancel_at_period_end',
        nextChargeAt: null,
      })
    );

    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([
        subscriptionRowFrom(
          activeSubscription({
            status: 'active',
            nextChargeAt: EXPIRES,
          })
        ),
      ])
    );

    const result = await patchSubscriptionAutoRenew(USER_ID, true);

    expect(result.subscription.status).toBe('active');
    expect(result.billing.autoRenewEnabled).toBe(true);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE subscriptions'),
      expect.arrayContaining([SUB_ID, 'active', EXPIRES, USER_ID])
    );
  });

  test('enable without PM → 409 PAYMENT_METHOD_REQUIRED', async () => {
    mockedGetViewerSubscription.mockResolvedValue(
      activeSubscription({
        status: 'cancel_at_period_end',
        paymentMethodId: null,
        nextChargeAt: null,
      })
    );

    await expect(patchSubscriptionAutoRenew(USER_ID, true)).rejects.toMatchObject({
      code: 'PAYMENT_METHOD_REQUIRED',
      httpStatus: 409,
    });
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test('disable from past_due → cancel_at_period_end', async () => {
    mockedGetViewerSubscription.mockResolvedValue(
      activeSubscription({
        status: 'past_due',
        renewalAttemptCount: +2,
      })
    );

    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([
        subscriptionRowFrom(
          activeSubscription({
            status: 'cancel_at_period_end',
            nextChargeAt: null,
            renewalAttemptCount: 2,
          })
        ),
      ])
    );

    const result = await patchSubscriptionAutoRenew(USER_ID, false);
    expect(result.subscription.status).toBe('cancel_at_period_end');
  });

  test('flag off → FEATURE_DISABLED', async () => {
    mockedFlag.mockReturnValue(false);

    await expect(patchSubscriptionAutoRenew(USER_ID, false)).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
      httpStatus: 503,
    });
  });

  test('no subscription → NO_SUBSCRIPTION', async () => {
    mockedGetViewerSubscription.mockResolvedValue(null);

    await expect(patchSubscriptionAutoRenew(USER_ID, true)).rejects.toBeInstanceOf(
      SubscriptionAutoRenewPatchError
    );
  });
});
