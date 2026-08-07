/**
 * Unit tests for subscription-billing-snapshot (PR-4).
 */

import { describe, expect, test, afterEach } from '@jest/globals';
import type { Subscription } from '../subscriptions';
import {
  buildBillingSnapshot,
  billingStatusFromSubscription,
  deriveHasSavedPaymentMethod,
  derivePaymentMethodTitle,
} from '../subscription-billing-snapshot';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const FUTURE = new Date('2026-09-03T00:00:00.000Z');

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    userId: 'user-1',
    status: 'active',
    plan: 'collector',
    slotsLimit: 2,
    provider: 'yookassa',
    providerSubscriptionId: 'pay-1',
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: FUTURE,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('buildBillingSnapshot', () => {
  const original = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = original;
  });

  test('no subscription row → NONE-shaped snapshot', () => {
    const snapshot = buildBillingSnapshot(null, { now: NOW });
    expect(snapshot).toEqual({
      status: null,
      plan: null,
      slotsLimit: 100,
      expiresAt: null,
      autoRenewEnabled: false,
      hasPremiumAccess: false,
      hasSavedPaymentMethod: false,
      paymentMethodTitle: null,
      nextChargeAt: null,
      scheduledPlan: null,
      renewalAttemptCount: null,
      firstFailedAt: null,
    });
  });

  test('active subscription with flag off mirrors legacy premium', () => {
    delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    const snapshot = buildBillingSnapshot(sub(), { now: NOW });

    expect(snapshot.status).toBe('active');
    expect(snapshot.plan).toBe('collector');
    expect(snapshot.autoRenewEnabled).toBe(true);
    expect(snapshot.hasPremiumAccess).toBe(true);
    expect(snapshot.expiresAt).toBe(FUTURE.toISOString());
  });

  test('flag on: cancel_at_period_end grants hasPremiumAccess', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    const snapshot = buildBillingSnapshot(sub({ status: 'cancel_at_period_end' }), { now: NOW });

    expect(snapshot.status).toBe('cancel_at_period_end');
    expect(snapshot.autoRenewEnabled).toBe(false);
    expect(snapshot.hasPremiumAccess).toBe(true);
  });

  test('flag on: past_due grants hasPremiumAccess during grace', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    const snapshot = buildBillingSnapshot(
      sub({
        status: 'past_due',
        renewalAttemptCount: 2,
        firstFailedAt: new Date('2026-08-04T00:00:00.000Z'),
        nextChargeAt: new Date('2026-08-06T00:00:00.000Z'),
      }),
      { now: NOW }
    );

    expect(snapshot.status).toBe('past_due');
    expect(snapshot.hasPremiumAccess).toBe(true);
    expect(snapshot.renewalAttemptCount).toBe(2);
    expect(snapshot.firstFailedAt).toBe('2026-08-04T00:00:00.000Z');
    expect(snapshot.nextChargeAt).toBe('2026-08-06T00:00:00.000Z');
  });

  test('legacy canceled maps to expired with no access', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    const snapshot = buildBillingSnapshot(sub({ status: 'canceled', expiresAt: FUTURE }), {
      now: NOW,
    });

    expect(snapshot.status).toBe('expired');
    expect(snapshot.hasPremiumAccess).toBe(false);
  });

  test('includes scheduledPlan when set', () => {
    const snapshot = buildBillingSnapshot(
      sub({ scheduledPlan: 'explorer', paymentMethodId: 'pm-1' }),
      { now: NOW }
    );

    expect(snapshot.scheduledPlan).toBe('explorer');
    expect(snapshot.hasSavedPaymentMethod).toBe(true);
    expect(snapshot.paymentMethodTitle).toBeNull();
  });

  test('hasSavedPaymentMethod true when paymentMethodId set without title', () => {
    const snapshot = buildBillingSnapshot(
      sub({ paymentMethodId: 'pm-1', paymentMethodTitle: null }),
      { now: NOW }
    );

    expect(snapshot.hasSavedPaymentMethod).toBe(true);
    expect(snapshot.paymentMethodTitle).toBeNull();
  });

  test('hasSavedPaymentMethod false when no paymentMethodId', () => {
    const snapshot = buildBillingSnapshot(sub(), { now: NOW });
    expect(snapshot.hasSavedPaymentMethod).toBe(false);
  });

  test('includes masked paymentMethodTitle when stored', () => {
    const snapshot = buildBillingSnapshot(
      sub({
        paymentMethodId: 'pm-1',
        paymentMethodTitle: 'Visa •••• 4242',
      }),
      { now: NOW }
    );

    expect(snapshot.paymentMethodTitle).toBe('Visa •••• 4242');
  });
});

describe('deriveHasSavedPaymentMethod', () => {
  test('true when paymentMethodId is stored', () => {
    expect(deriveHasSavedPaymentMethod(sub({ paymentMethodId: 'pm-1' }))).toBe(true);
  });

  test('false when paymentMethodId is missing', () => {
    expect(deriveHasSavedPaymentMethod(sub())).toBe(false);
  });
});

describe('derivePaymentMethodTitle', () => {
  test('prefers candidate mask when available', () => {
    expect(
      derivePaymentMethodTitle(
        sub({ paymentMethodTitle: 'Visa •••• 1111' }),
        'MasterCard •••• 5512'
      )
    ).toBe('MasterCard •••• 5512');
  });

  test('preserves existing title when candidate mask is unavailable', () => {
    expect(
      derivePaymentMethodTitle(
        sub({ paymentMethodTitle: 'Visa •••• 4242', paymentMethodId: 'pm-1' }),
        null
      )
    ).toBe('Visa •••• 4242');
  });

  test('returns null when no candidate and no stored title', () => {
    expect(derivePaymentMethodTitle(sub({ paymentMethodId: 'pm-1' }), null)).toBeNull();
  });
});

describe('billingStatusFromSubscription', () => {
  test('maps legacy trial to active', () => {
    expect(billingStatusFromSubscription(sub({ status: 'trial' }))).toBe('active');
  });
});
