/**
 * Unit tests for subscription-access (PR-1): legacy parity, canonical mapping, feature flag.
 */

import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import type { Subscription } from '../subscriptions';
import {
  hasPremiumAccess,
  hasPremiumAccessAutorenew,
  hasPremiumAccessLegacy,
} from '../subscription-access';
import { isSubscriptionAutoRenewEnabled } from '../subscription-feature-flag';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const FUTURE = new Date('2026-09-03T00:00:00.000Z');
const PAST = new Date('2026-08-01T00:00:00.000Z');

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

describe('isSubscriptionAutoRenewEnabled', () => {
  const original = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    } else {
      process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = original;
    }
  });

  test('is false when unset or not true', () => {
    delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    expect(isSubscriptionAutoRenewEnabled()).toBe(false);
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'false';
    expect(isSubscriptionAutoRenewEnabled()).toBe(false);
  });

  test('is true for true/1/yes', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    expect(isSubscriptionAutoRenewEnabled()).toBe(true);
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = '1';
    expect(isSubscriptionAutoRenewEnabled()).toBe(true);
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'yes';
    expect(isSubscriptionAutoRenewEnabled()).toBe(true);
  });
});

describe('hasPremiumAccessLegacy', () => {
  test('matches isSubscriptionActive semantics', () => {
    expect(hasPremiumAccessLegacy(sub(), NOW)).toBe(true);
    expect(hasPremiumAccessLegacy(sub({ status: 'canceled' }), NOW)).toBe(false);
    expect(hasPremiumAccessLegacy(sub({ expiresAt: PAST }), NOW)).toBe(false);
    expect(hasPremiumAccessLegacy(null, NOW)).toBe(false);
    expect(hasPremiumAccessLegacy(sub({ status: 'cancel_at_period_end' }), NOW)).toBe(false);
    expect(hasPremiumAccessLegacy(sub({ status: 'past_due' }), NOW)).toBe(false);
  });
});

describe('hasPremiumAccessAutorenew', () => {
  test('grants access for active, cancel_at_period_end, past_due within period', () => {
    expect(hasPremiumAccessAutorenew(sub(), NOW)).toBe(true);
    expect(hasPremiumAccessAutorenew(sub({ status: 'cancel_at_period_end' }), NOW)).toBe(true);
    expect(hasPremiumAccessAutorenew(sub({ status: 'past_due' }), NOW)).toBe(true);
  });

  test('denies access when expired or legacy canceled', () => {
    expect(hasPremiumAccessAutorenew(sub({ status: 'expired' }), NOW)).toBe(false);
    expect(hasPremiumAccessAutorenew(sub({ status: 'canceled' }), NOW)).toBe(false);
    expect(hasPremiumAccessAutorenew(sub({ expiresAt: PAST }), NOW)).toBe(false);
  });

  test('legacy trial with future expires_at has access', () => {
    expect(hasPremiumAccessAutorenew(sub({ status: 'trial' }), NOW)).toBe(true);
  });
});

describe('hasPremiumAccess (feature flag)', () => {
  const original = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  beforeEach(() => {
    delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    } else {
      process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = original;
    }
  });

  test('flag off: legacy path only (cancel_at_period_end and past_due denied)', () => {
    expect(hasPremiumAccess(sub(), NOW)).toBe(true);
    expect(hasPremiumAccess(sub({ status: 'cancel_at_period_end' }), NOW)).toBe(false);
    expect(hasPremiumAccess(sub({ status: 'past_due' }), NOW)).toBe(false);
  });

  test('flag on: autorenew rules apply', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    expect(hasPremiumAccess(sub({ status: 'cancel_at_period_end' }), NOW)).toBe(true);
    expect(hasPremiumAccess(sub({ status: 'past_due' }), NOW)).toBe(true);
  });

  test('existing active subscribers unchanged with flag off', () => {
    const legacyActive = sub({ status: 'active', expiresAt: FUTURE });
    expect(hasPremiumAccess(legacyActive, NOW)).toBe(true);
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    expect(hasPremiumAccess(legacyActive, NOW)).toBe(true);
  });
});
