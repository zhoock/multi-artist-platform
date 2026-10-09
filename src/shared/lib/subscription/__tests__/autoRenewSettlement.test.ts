import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from '../renewalCountdown';
import { isAutoRenewSettlementPending } from '../autoRenewSettlement';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const NEXT_CHARGE = '2026-06-01T12:00:00.000Z';

function billing(overrides: Partial<typeof EMPTY_BILLING_SNAPSHOT> = {}) {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    autoRenewEnabled: true,
    hasSavedPaymentMethod: true,
    nextChargeAt: NEXT_CHARGE,
    status: 'active' as const,
    ...overrides,
  };
}

describe('isAutoRenewSettlementPending', () => {
  test('returns false before nextChargeAt', () => {
    expect(isAutoRenewSettlementPending(billing(), new Date('2026-06-01T11:59:00.000Z'))).toBe(
      false
    );
  });

  test('returns true within post-charge settlement window', () => {
    expect(
      isAutoRenewSettlementPending(
        billing(),
        new Date(NOW.getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS - 1000)
      )
    ).toBe(true);
  });

  test('returns false after settlement window elapses', () => {
    expect(
      isAutoRenewSettlementPending(
        billing(),
        new Date(NOW.getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000)
      )
    ).toBe(false);
  });

  test('uses expiresAt when nextChargeAt is missing', () => {
    expect(
      isAutoRenewSettlementPending(
        billing({ nextChargeAt: null, expiresAt: NEXT_CHARGE }),
        new Date(NOW.getTime() + 1000)
      )
    ).toBe(true);
  });

  test('returns false without auto-renew or saved payment method', () => {
    expect(isAutoRenewSettlementPending(billing({ autoRenewEnabled: false }), NOW)).toBe(false);
    expect(isAutoRenewSettlementPending(billing({ hasSavedPaymentMethod: false }), NOW)).toBe(
      false
    );
  });

  test('returns true for past_due or expired while still inside settlement window', () => {
    expect(isAutoRenewSettlementPending(billing({ status: 'past_due' }), NOW)).toBe(true);
    expect(isAutoRenewSettlementPending(billing({ status: 'expired' }), NOW)).toBe(true);
  });

  test('returns false for past_due after settlement window (failed renewal)', () => {
    const afterWindow = new Date(NOW.getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000);
    expect(isAutoRenewSettlementPending(billing({ status: 'past_due' }), afterWindow)).toBe(false);
    expect(isAutoRenewSettlementPending(billing({ status: 'expired' }), afterWindow)).toBe(false);
  });
});
