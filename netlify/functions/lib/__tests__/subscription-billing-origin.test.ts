/**
 * Unit tests for subscription billing_origin runtime guards.
 */

import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';

import {
  checkBillingMutationAllowed,
  normalizeBillingOrigin,
  resolveBillingOriginForNewSubscription,
  sqlBillingOriginFilterForRuntime,
} from '../subscription-billing-origin';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.NETLIFY_DEV = 'true';
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('normalizeBillingOrigin', () => {
  test('maps dev explicitly', () => {
    expect(normalizeBillingOrigin('dev')).toBe('dev');
  });

  test('defaults unknown values to production', () => {
    expect(normalizeBillingOrigin(null)).toBe('production');
    expect(normalizeBillingOrigin(undefined)).toBe('production');
    expect(normalizeBillingOrigin('staging')).toBe('production');
  });
});

describe('resolveBillingOriginForNewSubscription', () => {
  test('returns dev when dev payment mode is enabled', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    expect(resolveBillingOriginForNewSubscription()).toBe('dev');
  });

  test('returns production when dev payment mode is disabled', () => {
    delete process.env.DEV_PAYMENT_MODE;
    expect(resolveBillingOriginForNewSubscription()).toBe('production');
  });
});

describe('checkBillingMutationAllowed', () => {
  test('allows mutation when subscription is missing (initial create)', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    expect(checkBillingMutationAllowed(null)).toEqual({ allowed: true });
  });

  test('blocks production subscription in dev runtime (production → dev)', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    expect(checkBillingMutationAllowed({ billingOrigin: 'production' })).toEqual({
      allowed: false,
      reason: 'production_subscription_dev_runtime',
    });
  });

  test('blocks dev subscription in production runtime (dev → production)', () => {
    delete process.env.DEV_PAYMENT_MODE;
    expect(checkBillingMutationAllowed({ billingOrigin: 'dev' })).toEqual({
      allowed: false,
      reason: 'dev_subscription_production_runtime',
    });
  });

  test('allows dev subscription in dev runtime', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    expect(checkBillingMutationAllowed({ billingOrigin: 'dev' })).toEqual({ allowed: true });
  });

  test('allows production subscription in production runtime', () => {
    delete process.env.DEV_PAYMENT_MODE;
    expect(checkBillingMutationAllowed({ billingOrigin: 'production' })).toEqual({
      allowed: true,
    });
  });
});

describe('sqlBillingOriginFilterForRuntime', () => {
  test('filters dev rows in dev runtime', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    expect(sqlBillingOriginFilterForRuntime()).toContain("billing_origin = 'dev'");
  });

  test('filters production rows in production runtime', () => {
    delete process.env.DEV_PAYMENT_MODE;
    expect(sqlBillingOriginFilterForRuntime()).toContain("billing_origin = 'production'");
  });
});
