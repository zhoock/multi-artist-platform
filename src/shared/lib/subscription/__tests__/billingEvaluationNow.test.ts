import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { resolveCollectionBillingScreen } from '@features/premiumSubscription/lib/resolveCollectionBillingScreen';
import { isAutoRenewCollectionRemoveHold } from '@shared/lib/subscription/autoRenewCollectionHold';
import {
  resetRenewalCountdownClockForTests,
  setRenewalCountdownNowForTests,
} from '@shared/lib/subscription/renewalCountdownClock';

import { resolveBillingEvaluationNow } from '../billingEvaluationNow';

const PERIOD_END = '2026-08-07T12:05:00.000Z';

function autorenewBilling() {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    status: 'expired' as const,
    plan: 'explorer' as const,
    autoRenewEnabled: true,
    hasSavedPaymentMethod: true,
    hasPremiumAccess: false,
    nextChargeAt: PERIOD_END,
    expiresAt: PERIOD_END,
  };
}

describe('billingEvaluationNow — expired banner clock skew', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T12:05:02.000Z'));
    resetRenewalCountdownClockForTests();
    setRenewalCountdownNowForTests('2026-08-07T12:04:58.000Z');
  });

  afterEach(() => {
    jest.useRealTimers();
    resetRenewalCountdownClockForTests();
  });

  test('lagging shared clock alone yields EXPIRED; evaluation now matches wall → ACTIVE', () => {
    const billing = autorenewBilling();
    const sharedClock = new Date('2026-08-07T12:04:58.000Z');

    expect(isAutoRenewCollectionRemoveHold(billing, sharedClock)).toBe(false);
    expect(resolveCollectionBillingScreen(billing, sharedClock)).toBe('EXPIRED');

    const evaluationNow = resolveBillingEvaluationNow(sharedClock);
    expect(evaluationNow.getTime()).toBe(Date.now());
    expect(isAutoRenewCollectionRemoveHold(billing, evaluationNow)).toBe(true);
    expect(resolveCollectionBillingScreen(billing, evaluationNow)).toBe('ACTIVE');
  });
});
