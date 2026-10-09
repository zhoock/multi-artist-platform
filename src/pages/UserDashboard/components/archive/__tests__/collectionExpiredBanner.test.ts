import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { resolveCollectionBillingScreen } from '@features/premiumSubscription/lib/resolveCollectionBillingScreen';
import { isAutoRenewCollectionRemoveHold } from '@shared/lib/subscription/autoRenewCollectionHold';
import { resolveBillingEvaluationNow } from '@shared/lib/subscription/billingEvaluationNow';
import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from '@shared/lib/subscription/renewalCountdown';

const PERIOD_END = '2026-08-07T12:05:00.000Z';
const IN_SETTLEMENT = new Date('2026-08-07T12:06:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(IN_SETTLEMENT);
});

afterEach(() => {
  jest.useRealTimers();
});

function autorenewBilling(overrides: Partial<typeof EMPTY_BILLING_SNAPSHOT> = {}) {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    autoRenewEnabled: true,
    hasSavedPaymentMethod: true,
    nextChargeAt: PERIOD_END,
    expiresAt: PERIOD_END,
    hasPremiumAccess: false,
    plan: 'explorer' as const,
    ...overrides,
  };
}

/** Mirrors MyArchiveContent expired banner gate. */
function shouldShowCollectionExpiredBanner(
  billing: typeof EMPTY_BILLING_SNAPSHOT,
  sharedClock: Date,
  artistCount: number
): boolean {
  const evaluationNow = resolveBillingEvaluationNow(sharedClock);
  const hold = isAutoRenewCollectionRemoveHold(billing, evaluationNow);
  const screen = resolveCollectionBillingScreen(billing, evaluationNow);
  return screen === 'EXPIRED' && !hold && artistCount > 0;
}

describe('collection expired choose-plan banner', () => {
  test('hidden while autorenew settlement is pending (past_due)', () => {
    const billing = autorenewBilling({ status: 'past_due' });
    expect(shouldShowCollectionExpiredBanner(billing, IN_SETTLEMENT, 1)).toBe(false);
  });

  test('hidden while autorenew settlement is pending (expired status)', () => {
    const billing = autorenewBilling({ status: 'expired' });
    expect(shouldShowCollectionExpiredBanner(billing, IN_SETTLEMENT, 1)).toBe(false);
  });

  test('hidden after successful renewal (active with access)', () => {
    const billing = autorenewBilling({
      status: 'active',
      hasPremiumAccess: true,
      expiresAt: '2026-09-07T12:05:00.000Z',
      nextChargeAt: '2026-09-07T12:05:00.000Z',
    });
    expect(shouldShowCollectionExpiredBanner(billing, IN_SETTLEMENT, 1)).toBe(false);
  });

  test('shown after settlement window when renewal failed', () => {
    const afterWindow = new Date(
      new Date(PERIOD_END).getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000
    );
    const billing = autorenewBilling({ status: 'expired' });
    expect(shouldShowCollectionExpiredBanner(billing, afterWindow, 1)).toBe(true);
  });

  test('stale active status with lapsed access outside hold still shows banner', () => {
    const billing = autorenewBilling({
      status: 'active',
      autoRenewEnabled: false,
      hasSavedPaymentMethod: false,
    });
    const afterWindow = new Date(
      new Date(PERIOD_END).getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000
    );
    expect(shouldShowCollectionExpiredBanner(billing, afterWindow, 1)).toBe(true);
  });
});
