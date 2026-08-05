import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';

import { BILLING_OVERLAY } from '../billingOverlay';
import { resolveCollectionBillingOverlays } from '../resolveCollectionBillingOverlays';

const NOW = new Date('2026-08-05T12:00:00.000Z');

function snap(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return { ...EMPTY_BILLING_SNAPSHOT, ...overrides };
}

function chargeInDays(days: number): string {
  const date = new Date(NOW);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

describe('resolveCollectionBillingOverlays', () => {
  test.each([
    {
      label: 'ACTIVE + T-2 pre-billing only',
      billing: snap({
        status: 'active',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: null,
        nextChargeAt: chargeInDays(2),
      }),
      billingScreen: 'ACTIVE' as const,
      slotsUsed: 1,
      expected: [BILLING_OVERLAY.PRE_BILLING],
    },
    {
      label: 'ACTIVE + scheduled downgrade + pre-billing (both overlays)',
      billing: snap({
        status: 'active',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: 'explorer',
        nextChargeAt: chargeInDays(2),
      }),
      billingScreen: 'ACTIVE' as const,
      slotsUsed: 25,
      expected: [BILLING_OVERLAY.DOWNGRADE_SLOTS, BILLING_OVERLAY.PRE_BILLING],
    },
    {
      label: 'ACTIVE outside pre-billing window',
      billing: snap({
        status: 'active',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: null,
        nextChargeAt: chargeInDays(5),
      }),
      billingScreen: 'ACTIVE' as const,
      slotsUsed: 1,
      expected: [],
    },
    {
      label: 'ACTIVE scheduled plan without excess slots',
      billing: snap({
        status: 'active',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: 'explorer',
        nextChargeAt: chargeInDays(2),
      }),
      billingScreen: 'ACTIVE' as const,
      slotsUsed: 1,
      expected: [BILLING_OVERLAY.PRE_BILLING],
    },
    {
      label: 'CANCELLED + downgrade only',
      billing: snap({
        status: 'cancel_at_period_end',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: 'explorer',
        nextChargeAt: null,
        expiresAt: chargeInDays(10),
      }),
      billingScreen: 'CANCELLED' as const,
      slotsUsed: 25,
      expected: [BILLING_OVERLAY.DOWNGRADE_SLOTS],
    },
    {
      label: 'CANCELLED without scheduled plan',
      billing: snap({
        status: 'cancel_at_period_end',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: null,
        nextChargeAt: null,
      }),
      billingScreen: 'CANCELLED' as const,
      slotsUsed: 1,
      expected: [],
    },
    {
      label: 'PAYMENT_FAILED never shows overlays',
      billing: snap({
        status: 'past_due',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: 'explorer',
        nextChargeAt: chargeInDays(1),
        firstFailedAt: NOW.toISOString(),
      }),
      billingScreen: 'PAYMENT_FAILED' as const,
      slotsUsed: 3,
      expected: [],
    },
    {
      label: 'EXPIRED never shows overlays',
      billing: snap({
        status: 'expired',
        hasPremiumAccess: false,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: 'explorer',
        nextChargeAt: chargeInDays(1),
      }),
      billingScreen: 'EXPIRED' as const,
      slotsUsed: 3,
      expected: [],
    },
    {
      label: 'NONE never shows overlays',
      billing: snap({ status: null }),
      billingScreen: 'NONE' as const,
      slotsUsed: 0,
      expected: [],
    },
  ])('$label', ({ billing, billingScreen, slotsUsed, expected }) => {
    const overlays = resolveCollectionBillingOverlays({
      billing,
      billingScreen,
      slotsUsed,
      now: NOW,
    });

    expect(overlays).toEqual(expected);
  });

  test('does not return duplicate overlays', () => {
    const overlays = resolveCollectionBillingOverlays({
      billing: snap({
        status: 'active',
        hasPremiumAccess: true,
        plan: 'collector',
        slotsLimit: 60,
        scheduledPlan: 'explorer',
        nextChargeAt: chargeInDays(2),
      }),
      billingScreen: 'ACTIVE',
      slotsUsed: 25,
      now: NOW,
    });

    expect(new Set(overlays).size).toBe(overlays.length);
  });

  test('pre-billing hidden when charge time has passed', () => {
    const overlays = resolveCollectionBillingOverlays({
      billing: snap({
        status: 'active',
        hasPremiumAccess: true,
        plan: 'collector',
        nextChargeAt: new Date('2026-08-05T11:00:00.000Z').toISOString(),
      }),
      billingScreen: 'ACTIVE',
      slotsUsed: 1,
      now: NOW,
    });

    expect(overlays).toEqual([]);
  });
});
