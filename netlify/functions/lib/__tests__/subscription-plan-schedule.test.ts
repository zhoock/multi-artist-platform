/**
 * Unit tests for subscription-plan-schedule (PR-6).
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
  assertUpgradeCheckoutAllowed,
  assertUpgradeIntentRequiredForMidCycleUpgrade,
  scheduleSubscriptionDowngrade,
  SubscriptionPlanScheduleError,
} from '../subscription-plan-schedule';
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
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

function activeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: SUB_ID,
    userId: USER_ID,
    status: 'active',
    plan: 'archivist',
    slotsLimit: 3,
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

describe('scheduleSubscriptionDowngrade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFlag.mockReturnValue(true);
  });

  test('sets scheduled_plan for lower tier', async () => {
    mockedGetViewerSubscription.mockResolvedValue(activeSubscription());
    mockedQuery.mockResolvedValueOnce(
      fakeQueryResult([subscriptionRowFrom(activeSubscription({ scheduledPlan: 'explorer' }))])
    );

    const result = await scheduleSubscriptionDowngrade(USER_ID, 'explorer');

    expect(result.billing.scheduledPlan).toBe('explorer');
    expect(result.billing.plan).toBe('archivist');
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('scheduled_plan = $2');
  });

  test('rejects downgrade during past_due', async () => {
    mockedGetViewerSubscription.mockResolvedValue(
      activeSubscription({ status: 'past_due', renewalAttemptCount: 1, firstFailedAt: new Date() })
    );

    await expect(scheduleSubscriptionDowngrade(USER_ID, 'explorer')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      httpStatus: 409,
    });
  });

  test('rejects when target is not lower tier', async () => {
    mockedGetViewerSubscription.mockResolvedValue(activeSubscription());

    await expect(scheduleSubscriptionDowngrade(USER_ID, 'archivist')).rejects.toMatchObject({
      code: 'NOT_A_DOWNGRADE',
    });
  });
});

describe('assertUpgradeCheckoutAllowed', () => {
  test('allows upgrade from past_due', () => {
    expect(() =>
      assertUpgradeCheckoutAllowed(
        activeSubscription({ status: 'past_due', plan: 'explorer', slotsLimit: 1 }),
        'archivist'
      )
    ).not.toThrow();
  });

  test('rejects upgrade from expired', () => {
    expect(() =>
      assertUpgradeCheckoutAllowed(
        activeSubscription({ status: 'expired', plan: 'explorer', slotsLimit: 1 }),
        'archivist'
      )
    ).toThrow(SubscriptionPlanScheduleError);
  });
});

describe('assertUpgradeIntentRequiredForMidCycleUpgrade', () => {
  test('throws UPGRADE_INTENT_REQUIRED for higher tier on active subscription', () => {
    try {
      assertUpgradeIntentRequiredForMidCycleUpgrade(
        activeSubscription({ plan: 'explorer', slotsLimit: 1 }),
        'archivist'
      );
      throw new Error('expected SubscriptionPlanScheduleError');
    } catch (error) {
      expect(error).toBeInstanceOf(SubscriptionPlanScheduleError);
      expect(error).toMatchObject({
        code: 'UPGRADE_INTENT_REQUIRED',
        httpStatus: 409,
      });
    }
  });

  test('allows initial checkout for same tier renewal on active', () => {
    expect(() =>
      assertUpgradeIntentRequiredForMidCycleUpgrade(
        activeSubscription({ plan: 'explorer', slotsLimit: 1 }),
        'explorer'
      )
    ).not.toThrow();
  });

  test('allows initial checkout for resubscribe from expired', () => {
    expect(() =>
      assertUpgradeIntentRequiredForMidCycleUpgrade(
        activeSubscription({ status: 'expired', plan: 'explorer', slotsLimit: 1 }),
        'archivist'
      )
    ).not.toThrow();
  });

  test('allows initial checkout for lower tier (downgrade uses schedule API)', () => {
    expect(() =>
      assertUpgradeIntentRequiredForMidCycleUpgrade(
        activeSubscription({ plan: 'archivist', slotsLimit: 3 }),
        'explorer'
      )
    ).not.toThrow();
  });
});
