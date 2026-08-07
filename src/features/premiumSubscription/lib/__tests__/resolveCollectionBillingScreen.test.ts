import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';
import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from '@shared/lib/subscription/renewalCountdown';

import {
  isInAutorenewRenewalGrace,
  resolveCollectionBillingScreen,
} from '../resolveCollectionBillingScreen';

function snap(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return { ...EMPTY_BILLING_SNAPSHOT, ...overrides };
}

const CHARGE_AT = new Date('2026-08-07T12:05:00.000Z');
const IN_GRACE_NOW = new Date('2026-08-07T12:06:00.000Z');

function graceEligible(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return snap({
    status: 'active',
    hasPremiumAccess: false,
    autoRenewEnabled: true,
    hasSavedPaymentMethod: true,
    nextChargeAt: CHARGE_AT.toISOString(),
    paymentMethodTitle: null,
    ...overrides,
  });
}

describe('isInAutorenewRenewalGrace', () => {
  test('true only for active autorenew with PM in overdue poll window', () => {
    expect(isInAutorenewRenewalGrace(graceEligible(), IN_GRACE_NOW)).toBe(true);
  });

  test('false before nextChargeAt', () => {
    expect(isInAutorenewRenewalGrace(graceEligible(), new Date('2026-08-07T12:04:00.000Z'))).toBe(
      false
    );
  });

  test('false after grace window', () => {
    expect(
      isInAutorenewRenewalGrace(
        graceEligible(),
        new Date(CHARGE_AT.getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000)
      )
    ).toBe(false);
  });

  test('false without saved payment method', () => {
    expect(
      isInAutorenewRenewalGrace(graceEligible({ hasSavedPaymentMethod: false }), IN_GRACE_NOW)
    ).toBe(false);
  });

  test('true when PM id present but title not loaded yet', () => {
    expect(
      isInAutorenewRenewalGrace(
        graceEligible({ hasSavedPaymentMethod: true, paymentMethodTitle: null }),
        IN_GRACE_NOW
      )
    ).toBe(true);
  });

  test('false when autoRenewEnabled is off', () => {
    expect(
      isInAutorenewRenewalGrace(graceEligible({ autoRenewEnabled: false }), IN_GRACE_NOW)
    ).toBe(false);
  });

  test('false without nextChargeAt', () => {
    expect(isInAutorenewRenewalGrace(graceEligible({ nextChargeAt: null }), IN_GRACE_NOW)).toBe(
      false
    );
  });

  test('false for cancel_at_period_end even with autorenew fields', () => {
    expect(
      isInAutorenewRenewalGrace(
        graceEligible({ status: 'cancel_at_period_end', autoRenewEnabled: true }),
        IN_GRACE_NOW
      )
    ).toBe(false);
  });

  test('false for expired status', () => {
    expect(isInAutorenewRenewalGrace(graceEligible({ status: 'expired' }), IN_GRACE_NOW)).toBe(
      false
    );
  });

  test('false for past_due — grace must not mask payment failure', () => {
    expect(isInAutorenewRenewalGrace(graceEligible({ status: 'past_due' }), IN_GRACE_NOW)).toBe(
      false
    );
  });
});

describe('resolveCollectionBillingScreen', () => {
  test('NONE only when status is null', () => {
    expect(resolveCollectionBillingScreen(snap({ status: null }))).toBe('NONE');
  });

  test('ACTIVE when active with premium access', () => {
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'active',
          hasPremiumAccess: true,
          plan: 'collector',
        })
      )
    ).toBe('ACTIVE');
  });

  test('CANCELLED when cancel_at_period_end with access', () => {
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'cancel_at_period_end',
          hasPremiumAccess: true,
        })
      )
    ).toBe('CANCELLED');
  });

  test('PAYMENT_FAILED when past_due with access', () => {
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'past_due',
          hasPremiumAccess: true,
        })
      )
    ).toBe('PAYMENT_FAILED');
  });

  test('EXPIRED when status expired without access', () => {
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'expired',
          hasPremiumAccess: false,
          plan: 'explorer',
        })
      )
    ).toBe('EXPIRED');
  });

  test('EXPIRED when active in DB but access lapsed without renewal setup', () => {
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'active',
          hasPremiumAccess: false,
        })
      )
    ).toBe('EXPIRED');
  });

  test('ACTIVE during autorenew grace after nextChargeAt without premium access', () => {
    expect(resolveCollectionBillingScreen(graceEligible(), IN_GRACE_NOW)).toBe('ACTIVE');
  });

  test('EXPIRED after autorenew grace window elapsed', () => {
    const now = new Date(CHARGE_AT.getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000);
    expect(resolveCollectionBillingScreen(graceEligible(), now)).toBe('EXPIRED');
  });

  test('EXPIRED for cancel_at_period_end after access lapsed — not grace', () => {
    expect(
      resolveCollectionBillingScreen(
        graceEligible({
          status: 'cancel_at_period_end',
          hasPremiumAccess: false,
          autoRenewEnabled: true,
        }),
        IN_GRACE_NOW
      )
    ).toBe('EXPIRED');
  });

  test('EXPIRED when cancel_at_period_end period ended on client clock', () => {
    const expiresAt = new Date('2026-08-07T12:00:00.000Z');
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'cancel_at_period_end',
          hasPremiumAccess: true,
          expiresAt: expiresAt.toISOString(),
        }),
        new Date('2026-08-07T12:01:00.000Z')
      )
    ).toBe('EXPIRED');
  });

  test('EXPIRED for expired status in grace window — not grace', () => {
    expect(resolveCollectionBillingScreen(graceEligible({ status: 'expired' }), IN_GRACE_NOW)).toBe(
      'EXPIRED'
    );
  });

  test('PAYMENT_FAILED for past_due without access — not grace ACTIVE', () => {
    expect(
      resolveCollectionBillingScreen(graceEligible({ status: 'past_due' }), IN_GRACE_NOW)
    ).toBe('PAYMENT_FAILED');
  });

  test('EXPIRED when active overdue but no saved payment method', () => {
    expect(
      resolveCollectionBillingScreen(graceEligible({ hasSavedPaymentMethod: false }), IN_GRACE_NOW)
    ).toBe('EXPIRED');
  });

  test('ACTIVE during grace when PM saved but title not yet loaded', () => {
    expect(
      resolveCollectionBillingScreen(
        graceEligible({ hasSavedPaymentMethod: true, paymentMethodTitle: null }),
        IN_GRACE_NOW
      )
    ).toBe('ACTIVE');
  });

  test('EXPIRED when autoRenewEnabled off despite nextChargeAt and PM', () => {
    expect(
      resolveCollectionBillingScreen(graceEligible({ autoRenewEnabled: false }), IN_GRACE_NOW)
    ).toBe('EXPIRED');
  });

  test('does not infer NONE from missing plan', () => {
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'expired',
          hasPremiumAccess: false,
          plan: null,
        })
      )
    ).toBe('EXPIRED');
  });
});
