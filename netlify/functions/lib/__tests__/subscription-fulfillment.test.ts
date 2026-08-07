/**
 * Unit tests for subscription-fulfillment (PR-3 / PR-3.1).
 */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscription-billing', () => ({
  fulfillSubscriptionPayment: jest.fn(),
  claimSubscriptionPaymentSuccess: jest.fn(),
  isSubscriptionFulfilledForProviderPayment: jest.fn(),
  updateSubscriptionPaymentStatus: jest.fn(),
  validatePremiumSubscriptionPayment: jest.fn(),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
}));

import { query } from '../db';
import {
  claimSubscriptionPaymentSuccess,
  fulfillSubscriptionPayment,
  isSubscriptionFulfilledForProviderPayment,
  validatePremiumSubscriptionPayment,
} from '../subscription-billing';
import { getViewerSubscription } from '../subscriptions';
import {
  fulfillInitialSubscriptionPayment,
  isInitialSubscriptionPaymentKind,
  processInitialSubscriptionProviderPayment,
  resolvePaymentMethodIdFromProviderPayment,
} from '../subscription-fulfillment';
import type { SubscriptionProviderPayment } from '../subscription-provider-payment';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedFulfill = fulfillSubscriptionPayment as jest.MockedFunction<
  typeof fulfillSubscriptionPayment
>;
const mockedClaim = claimSubscriptionPaymentSuccess as jest.MockedFunction<
  typeof claimSubscriptionPaymentSuccess
>;
const mockedIsFulfilled = isSubscriptionFulfilledForProviderPayment as jest.MockedFunction<
  typeof isSubscriptionFulfilledForProviderPayment
>;
const mockedValidate = validatePremiumSubscriptionPayment as jest.MockedFunction<
  typeof validatePremiumSubscriptionPayment
>;
const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EXPIRES = new Date('2026-09-03T00:00:00.000Z');

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: USER_ID,
    status: 'active' as const,
    plan: 'collector',
    slotsLimit: 2,
    provider: 'yookassa',
    providerSubscriptionId: 'pay-1',
    startedAt: new Date('2026-08-01'),
    expiresAt: EXPIRES,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

function providerPayment(
  overrides: Partial<SubscriptionProviderPayment> = {}
): SubscriptionProviderPayment {
  return {
    id: 'pay-1',
    status: 'succeeded',
    amount: { value: '1.00', currency: 'RUB' },
    metadata: {
      productType: 'premium_subscription',
      userId: USER_ID,
      plan: 'collector',
      kind: 'initial',
    },
    paymentMethod: { id: 'pm-1', saved: true },
    ...overrides,
  };
}

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

describe('isInitialSubscriptionPaymentKind', () => {
  test('treats missing kind as initial (legacy metadata)', () => {
    expect(isInitialSubscriptionPaymentKind(undefined)).toBe(true);
    expect(isInitialSubscriptionPaymentKind('initial')).toBe(true);
    expect(isInitialSubscriptionPaymentKind('renewal')).toBe(false);
  });
});

describe('resolvePaymentMethodIdFromProviderPayment', () => {
  const original = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = original;
  });

  test('flag off: null; flag on: extracts PM from DTO', () => {
    delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    expect(resolvePaymentMethodIdFromProviderPayment(providerPayment())).toBeNull();

    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    expect(resolvePaymentMethodIdFromProviderPayment(providerPayment())).toBe('pm-1');
    expect(resolvePaymentMethodIdFromProviderPayment(providerPayment(), { devMode: true })).toBe(
      'dev-pm-pay-1'
    );
  });
});

describe('fulfillInitialSubscriptionPayment idempotency', () => {
  const original = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  beforeEach(() => {
    mockedFulfill.mockReset();
    mockedIsFulfilled.mockReset();
    mockedQuery.mockReset();
    mockedGetSubscription.mockReset();
    mockedFulfill.mockResolvedValue(subscription());
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = original;
  });

  test('skips fulfillSubscriptionPayment when already fulfilled', async () => {
    delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    mockedIsFulfilled.mockResolvedValue(true);
    mockedGetSubscription.mockResolvedValue(subscription());

    const result = await fulfillInitialSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'collector',
      providerPaymentId: 'pay-1',
      paymentMethodId: 'pm-1',
    });

    expect(mockedFulfill).not.toHaveBeenCalled();
    expect(result.alreadyFulfilled).toBe(true);
    expect(result.fulfilled).toBe(false);
  });

  test('fulfills once when not yet fulfilled', async () => {
    delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    mockedIsFulfilled.mockResolvedValue(false);

    const result = await fulfillInitialSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'collector',
      providerPaymentId: 'pay-1',
    });

    expect(mockedFulfill).toHaveBeenCalledTimes(1);
    expect(result.fulfilled).toBe(true);
    expect(result.alreadyFulfilled).toBe(false);
  });

  test('flag on: backfills PM on already fulfilled payment', async () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    mockedIsFulfilled.mockResolvedValue(true);
    mockedGetSubscription.mockResolvedValue(subscription());
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([]));

    await fulfillInitialSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'collector',
      providerPaymentId: 'pay-1',
      paymentMethodId: 'pm-yk',
    });

    expect(mockedFulfill).not.toHaveBeenCalled();
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('COALESCE(payment_method_id');
  });

  test('flag on: backfills next_charge_at when PM already on subscription row', async () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    mockedIsFulfilled.mockResolvedValue(false);
    mockedFulfill.mockResolvedValue(
      subscription({
        paymentMethodId: 'pm-existing',
        nextChargeAt: null,
      })
    );
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([]));

    const result = await fulfillInitialSubscriptionPayment({
      userId: USER_ID,
      planSlug: 'collector',
      providerPaymentId: 'pay-1',
    });

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain('next_charge_at = COALESCE');
    expect(result.subscription.nextChargeAt).toEqual(EXPIRES);
    expect(result.subscription.paymentMethodId).toBe('pm-existing');
  });
});

describe('processInitialSubscriptionProviderPayment', () => {
  beforeEach(() => {
    mockedValidate.mockReset();
    mockedClaim.mockReset();
    mockedIsFulfilled.mockReset();
    mockedFulfill.mockReset();
    mockedGetSubscription.mockReset();
    mockedValidate.mockReturnValue({ valid: true, planSlug: 'collector' });
    mockedFulfill.mockResolvedValue(subscription({ providerSubscriptionId: 'pay-1' }));
  });

  test('claimed success runs fulfillment once', async () => {
    mockedClaim.mockResolvedValue('claimed');
    mockedIsFulfilled.mockResolvedValue(false);

    const result = await processInitialSubscriptionProviderPayment(providerPayment(), USER_ID);

    expect(result.subscriptionActivated).toBe(true);
    expect(result.alreadyFulfilled).toBe(false);
    expect(mockedFulfill).toHaveBeenCalledTimes(1);
  });

  test('already_succeeded skips second fulfillment', async () => {
    mockedClaim.mockResolvedValue('already_succeeded');
    mockedIsFulfilled.mockResolvedValue(true);
    mockedGetSubscription.mockResolvedValue(subscription({ providerSubscriptionId: 'pay-1' }));

    const result = await processInitialSubscriptionProviderPayment(providerPayment(), USER_ID);

    expect(result.alreadyFulfilled).toBe(true);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  test('webhook and poll share PM extraction from DTO', async () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    mockedClaim.mockResolvedValue('claimed');
    mockedIsFulfilled.mockResolvedValue(false);
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([]));

    await processInitialSubscriptionProviderPayment(providerPayment(), USER_ID);
    expect(mockedFulfill).toHaveBeenCalled();
    expect(String(mockedQuery.mock.calls[0]?.[0] ?? '')).toContain('payment_method_id');
  });
});
