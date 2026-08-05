import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';

import { resolveCollectionBillingScreen } from '../resolveCollectionBillingScreen';

function snap(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return { ...EMPTY_BILLING_SNAPSHOT, ...overrides };
}

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

  test('EXPIRED when active in DB but access lapsed', () => {
    expect(
      resolveCollectionBillingScreen(
        snap({
          status: 'active',
          hasPremiumAccess: false,
        })
      )
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
