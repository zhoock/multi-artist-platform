import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from '@shared/lib/subscription/renewalCountdown';

import { resolveCollectionArtistRemoveButtonMode } from '../collectionArtistRemoveMode';

const PERIOD_END = '2026-06-01T12:00:00.000Z';
const LOCKED_UNTIL = PERIOD_END;

function activeArtist() {
  return { isActive: true as const, lockedUntil: LOCKED_UNTIL };
}

function autorenewBilling(
  overrides: Partial<typeof EMPTY_BILLING_SNAPSHOT> = {}
): typeof EMPTY_BILLING_SNAPSHOT {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    autoRenewEnabled: true,
    hasSavedPaymentMethod: true,
    nextChargeAt: PERIOD_END,
    expiresAt: PERIOD_END,
    ...overrides,
  };
}

describe('resolveCollectionArtistRemoveButtonMode — autorenew period end', () => {
  test('active period with time lock → time-lock', () => {
    expect(
      resolveCollectionArtistRemoveButtonMode({
        artist: activeArtist(),
        hasPremiumAccess: true,
        billing: autorenewBilling({ hasPremiumAccess: true, status: 'active' }),
        now: new Date('2026-06-01T11:59:00.000Z'),
      })
    ).toBe('time-lock');
  });

  test('after lock expiry with stale hasPremiumAccess true → renewal-hold (not active-remove)', () => {
    const now = new Date(new Date(PERIOD_END).getTime() + 500);
    expect(
      resolveCollectionArtistRemoveButtonMode({
        artist: activeArtist(),
        hasPremiumAccess: true,
        billing: autorenewBilling({ hasPremiumAccess: true, status: 'active' }),
        now,
      })
    ).toBe('renewal-hold');
  });

  test('after lock expiry with hasPremiumAccess false in settlement → renewal-hold', () => {
    const now = new Date(new Date(PERIOD_END).getTime() + 500);
    expect(
      resolveCollectionArtistRemoveButtonMode({
        artist: activeArtist(),
        hasPremiumAccess: false,
        billing: autorenewBilling({ hasPremiumAccess: false, status: 'past_due' }),
        now,
      })
    ).toBe('renewal-hold');
  });

  test('no trash modes between lock and successful renewal in hold window', () => {
    const modes: string[] = [];
    const startMs = new Date(PERIOD_END).getTime() - 2000;
    const endMs = new Date(PERIOD_END).getTime() + 30_000;

    for (let t = startMs; t <= endMs; t += 250) {
      const now = new Date(t);
      const hasPremiumAccess = t < new Date(PERIOD_END).getTime() + 5000;
      modes.push(
        resolveCollectionArtistRemoveButtonMode({
          artist: activeArtist(),
          hasPremiumAccess,
          billing: autorenewBilling({
            hasPremiumAccess,
            status: hasPremiumAccess ? 'active' : 'past_due',
          }),
          now,
        })
      );
    }

    expect(modes.every((m) => m === 'time-lock' || m === 'renewal-hold')).toBe(true);
    expect(modes).not.toContain('active-remove');
    expect(modes).not.toContain('subscription-gate');
  });

  test('after hold window with failed renewal → subscription-gate', () => {
    const now = new Date(new Date(PERIOD_END).getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000);
    expect(
      resolveCollectionArtistRemoveButtonMode({
        artist: { isActive: true, lockedUntil: LOCKED_UNTIL },
        hasPremiumAccess: false,
        billing: autorenewBilling({ hasPremiumAccess: false, status: 'expired' }),
        now,
      })
    ).toBe('subscription-gate');
  });

  test('after successful renewal (new period, lock expired) → active-remove', () => {
    expect(
      resolveCollectionArtistRemoveButtonMode({
        artist: { isActive: true, lockedUntil: LOCKED_UNTIL },
        hasPremiumAccess: true,
        billing: autorenewBilling({
          hasPremiumAccess: true,
          status: 'active',
          expiresAt: '2026-07-01T12:00:00.000Z',
          nextChargeAt: '2026-07-01T12:00:00.000Z',
        }),
        now: new Date('2026-06-01T12:01:00.000Z'),
      })
    ).toBe('active-remove');
  });
});
