import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';

import {
  SUBSCRIPTION_GRACE_PERIOD_MS,
  resolveDunningBannerSupplement,
  resolveGraceEnd,
} from '../subscriptionBillingPolicy';

describe('subscriptionBillingPolicy', () => {
  test('SUBSCRIPTION_GRACE_PERIOD_MS is 7 days', () => {
    expect(SUBSCRIPTION_GRACE_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
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
