import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';

import {
  PRE_BILLING_WINDOW_MS,
  SUBSCRIPTION_GRACE_PERIOD_MS,
  isWithinPreBillingWindow,
  resolveDunningBannerSupplement,
  resolveGraceEnd,
} from '../subscriptionBillingPolicy';

const NOW = new Date('2026-08-05T12:00:00.000Z');

describe('subscriptionBillingPolicy', () => {
  test('PRE_BILLING_WINDOW_MS is 3 days', () => {
    expect(PRE_BILLING_WINDOW_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  test('SUBSCRIPTION_GRACE_PERIOD_MS is 7 days', () => {
    expect(SUBSCRIPTION_GRACE_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('isWithinPreBillingWindow true inside T-3 window', () => {
    const nextChargeAt = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinPreBillingWindow(nextChargeAt, NOW)).toBe(true);
  });

  test('isWithinPreBillingWindow false outside T-3 window', () => {
    const nextChargeAt = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinPreBillingWindow(nextChargeAt, NOW)).toBe(false);
  });

  test('resolveGraceEnd adds grace period to firstFailedAt', () => {
    const firstFailedAt = '2026-08-05T12:00:00.000Z';
    expect(resolveGraceEnd(firstFailedAt)).toBe('2026-08-12T12:00:00.000Z');
  });

  test('resolveDunningBannerSupplement returns at most two lines', () => {
    const supplements = resolveDunningBannerSupplement({
      ...EMPTY_BILLING_SNAPSHOT,
      nextChargeAt: '2026-08-08T12:00:00.000Z',
      firstFailedAt: '2026-08-05T12:00:00.000Z',
    });

    expect(supplements).toHaveLength(2);
    expect(supplements[0]?.kind).toBe('nextRetry');
    expect(supplements[1]?.kind).toBe('graceEnd');
  });

  test('resolveDunningBannerSupplement omits missing fields', () => {
    expect(
      resolveDunningBannerSupplement({
        ...EMPTY_BILLING_SNAPSHOT,
        nextChargeAt: null,
        firstFailedAt: null,
      })
    ).toEqual([]);
  });
});
