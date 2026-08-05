/**
 * Unit tests for subscription-state (PR-2): transitions, invariants, derived rules.
 */

import { describe, expect, test } from '@jest/globals';
import {
  CANONICAL_SUBSCRIPTION_STATUSES,
  InvalidSubscriptionTransitionError,
  MAX_RENEWAL_ATTEMPTS,
  SUBSCRIPTION_EVENTS,
  assertSubscriptionInvariants,
  canCreateRenewalPayment,
  computeRenewalRetryChargeAt,
  deriveAutoRenewEnabled,
  getNextSubscriptionStatus,
  getSubscriptionInvariantViolations,
  isValidSubscriptionTransition,
  normalizeCanonicalStatus,
  toPresenceStatus,
  willScheduleCharge,
} from '../subscription-state';
import type { Subscription } from '../subscriptions';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const FUTURE = new Date('2026-09-03T00:00:00.000Z');
const SOON = new Date('2026-08-05T20:00:00.000Z'); // within 24h of NOW

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    userId: 'user-1',
    status: 'active',
    plan: 'collector',
    slotsLimit: 2,
    provider: 'yookassa',
    providerSubscriptionId: 'pay-1',
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: FUTURE,
    paymentMethodId: 'pm-1',
    nextChargeAt: FUTURE,
    renewalAttemptCount: 0,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('normalizeCanonicalStatus', () => {
  test('maps canonical and legacy statuses', () => {
    expect(normalizeCanonicalStatus('active')).toBe('active');
    expect(normalizeCanonicalStatus('cancel_at_period_end')).toBe('cancel_at_period_end');
    expect(normalizeCanonicalStatus('past_due')).toBe('past_due');
    expect(normalizeCanonicalStatus('expired')).toBe('expired');
    expect(normalizeCanonicalStatus('canceled')).toBe('expired');
    expect(normalizeCanonicalStatus('paused')).toBe('expired');
    expect(normalizeCanonicalStatus('trial')).toBe('active');
    expect(normalizeCanonicalStatus('unknown')).toBeNull();
  });
});

describe('toPresenceStatus', () => {
  test('none when subscription missing', () => {
    expect(toPresenceStatus(null)).toBe('none');
    expect(toPresenceStatus(undefined)).toBe('none');
  });

  test('maps subscription row to presence', () => {
    expect(toPresenceStatus(sub())).toBe('active');
    expect(toPresenceStatus(sub({ status: 'cancel_at_period_end' }))).toBe('cancel_at_period_end');
    expect(toPresenceStatus(sub({ status: 'canceled' }))).toBe('expired');
  });
});

describe('deriveAutoRenewEnabled', () => {
  test('true only for canonical active', () => {
    expect(deriveAutoRenewEnabled('active')).toBe(true);
    expect(deriveAutoRenewEnabled('trial')).toBe(true);
    expect(deriveAutoRenewEnabled('cancel_at_period_end')).toBe(false);
    expect(deriveAutoRenewEnabled('past_due')).toBe(false);
    expect(deriveAutoRenewEnabled('expired')).toBe(false);
  });
});

describe('getNextSubscriptionStatus — valid transitions', () => {
  const cases: Array<{
    from: Parameters<typeof getNextSubscriptionStatus>[0];
    event: Parameters<typeof getNextSubscriptionStatus>[1];
    to: string;
    context?: Parameters<typeof getNextSubscriptionStatus>[2];
  }> = [
    { from: 'none', event: 'INITIAL_PAYMENT_SUCCEEDED', to: 'active' },
    { from: 'active', event: 'AUTO_RENEW_SUCCEEDED', to: 'active' },
    { from: 'past_due', event: 'AUTO_RENEW_SUCCEEDED', to: 'active' },
    { from: 'active', event: 'USER_DISABLE_AUTO_RENEW', to: 'cancel_at_period_end' },
    { from: 'past_due', event: 'USER_DISABLE_AUTO_RENEW', to: 'cancel_at_period_end' },
    {
      from: 'cancel_at_period_end',
      event: 'USER_ENABLE_AUTO_RENEW',
      to: 'active',
      context: { hasPaymentMethod: true },
    },
    {
      from: 'active',
      event: 'RENEWAL_FAILED',
      to: 'past_due',
      context: { attemptsRemaining: 3 },
    },
    {
      from: 'active',
      event: 'RENEWAL_FAILED',
      to: 'expired',
      context: { hasPaymentMethod: false },
    },
    {
      from: 'active',
      event: 'RENEWAL_FAILED',
      to: 'expired',
      context: { attemptsRemaining: 0 },
    },
    {
      from: 'past_due',
      event: 'RETRY_FAILED',
      to: 'past_due',
      context: { attemptsRemaining: 2 },
    },
    { from: 'past_due', event: 'RETRY_SUCCEEDED', to: 'active' },
    { from: 'past_due', event: 'DUNNING_EXHAUSTED', to: 'expired' },
    { from: 'cancel_at_period_end', event: 'PERIOD_ENDED', to: 'expired' },
    { from: 'active', event: 'PERIOD_ENDED', to: 'expired' },
    {
      from: 'active',
      event: 'PAYMENT_METHOD_REVOKED',
      to: 'past_due',
      context: { paymentMethodRevokedWithGrace: true },
    },
    {
      from: 'active',
      event: 'PAYMENT_METHOD_REVOKED',
      to: 'expired',
      context: { paymentMethodRevokedWithGrace: false },
    },
    {
      from: 'past_due',
      event: 'PAYMENT_METHOD_REVOKED',
      to: 'expired',
      context: { paymentMethodRevokedWithGrace: false },
    },
    { from: 'expired', event: 'RESUBSCRIBE_SUCCEEDED', to: 'active' },
    { from: 'active', event: 'PLAN_CHANGE_SUCCEEDED', to: 'active' },
    { from: 'cancel_at_period_end', event: 'PLAN_CHANGE_SUCCEEDED', to: 'active' },
    { from: 'past_due', event: 'PLAN_CHANGE_SUCCEEDED', to: 'active' },
  ];

  test.each(cases)('$event: $from → $to', ({ from, event, to, context }) => {
    expect(getNextSubscriptionStatus(from, event, context)).toBe(to);
    expect(isValidSubscriptionTransition(from, event, context)).toBe(true);
  });
});

describe('getNextSubscriptionStatus — invalid transitions', () => {
  test('throws InvalidSubscriptionTransitionError for disallowed transitions', () => {
    expect(() => getNextSubscriptionStatus('expired', 'USER_DISABLE_AUTO_RENEW')).toThrow(
      InvalidSubscriptionTransitionError
    );
    expect(() => getNextSubscriptionStatus('none', 'AUTO_RENEW_SUCCEEDED')).toThrow(
      InvalidSubscriptionTransitionError
    );
    expect(() => getNextSubscriptionStatus('cancel_at_period_end', 'RENEWAL_FAILED')).toThrow(
      InvalidSubscriptionTransitionError
    );
    expect(() => getNextSubscriptionStatus('expired', 'PLAN_CHANGE_SUCCEEDED')).toThrow(
      InvalidSubscriptionTransitionError
    );
  });

  test('USER_ENABLE_AUTO_RENEW without PM throws', () => {
    expect(() =>
      getNextSubscriptionStatus('cancel_at_period_end', 'USER_ENABLE_AUTO_RENEW', {
        hasPaymentMethod: false,
      })
    ).toThrow(InvalidSubscriptionTransitionError);
    expect(() =>
      getNextSubscriptionStatus('cancel_at_period_end', 'USER_ENABLE_AUTO_RENEW', {})
    ).toThrow(InvalidSubscriptionTransitionError);
    expect(() =>
      getNextSubscriptionStatus('cancel_at_period_end', 'USER_ENABLE_AUTO_RENEW', {
        hasPaymentMethod: undefined,
      })
    ).toThrow(InvalidSubscriptionTransitionError);
  });

  test('RETRY_FAILED with no attempts remaining throws', () => {
    expect(() =>
      getNextSubscriptionStatus('past_due', 'RETRY_FAILED', { attemptsRemaining: 0 })
    ).toThrow(InvalidSubscriptionTransitionError);
  });
});

describe('getNextSubscriptionStatus — full event coverage', () => {
  test('every SUBSCRIPTION_EVENT has at least one valid from-state in the design doc', () => {
    const covered = new Set<string>();
    const fromStates: Array<Parameters<typeof getNextSubscriptionStatus>[0]> = [
      'none',
      'active',
      'cancel_at_period_end',
      'past_due',
      'expired',
    ];

    for (const event of SUBSCRIPTION_EVENTS) {
      for (const from of fromStates) {
        const contexts: Array<Parameters<typeof getNextSubscriptionStatus>[2]> = [
          {},
          { hasPaymentMethod: true },
          { hasPaymentMethod: false },
          { attemptsRemaining: 3 },
          { attemptsRemaining: 0 },
          { paymentMethodRevokedWithGrace: true },
          { paymentMethodRevokedWithGrace: false },
        ];
        for (const context of contexts) {
          if (isValidSubscriptionTransition(from, event, context)) {
            covered.add(event);
            break;
          }
        }
        if (covered.has(event)) break;
      }
    }

    for (const event of SUBSCRIPTION_EVENTS) {
      expect(covered.has(event)).toBe(true);
    }
  });
});

describe('willScheduleCharge', () => {
  test('true when active/past_due with PM and due next_charge_at', () => {
    expect(
      willScheduleCharge(
        {
          status: 'active',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: new Date('2026-08-05T11:00:00.000Z'),
        },
        NOW
      )
    ).toBe(true);
    expect(
      willScheduleCharge(
        {
          status: 'past_due',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: NOW,
          renewalAttemptCount: 1,
        },
        NOW
      )
    ).toBe(true);
  });

  test('false for cancel_at_period_end, missing PM, or future next_charge_at', () => {
    expect(
      willScheduleCharge(
        {
          status: 'cancel_at_period_end',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: NOW,
        },
        NOW
      )
    ).toBe(false);
    expect(
      willScheduleCharge(
        {
          status: 'active',
          expiresAt: FUTURE,
          paymentMethodId: null,
          nextChargeAt: NOW,
        },
        NOW
      )
    ).toBe(false);
    expect(
      willScheduleCharge(
        {
          status: 'active',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: FUTURE,
        },
        NOW
      )
    ).toBe(false);
  });
});

describe('canCreateRenewalPayment (I7)', () => {
  test('allowed only for active and past_due', () => {
    expect(canCreateRenewalPayment('active')).toBe(true);
    expect(canCreateRenewalPayment('past_due')).toBe(true);
    expect(canCreateRenewalPayment('cancel_at_period_end')).toBe(false);
    expect(canCreateRenewalPayment('expired')).toBe(false);
    expect(canCreateRenewalPayment('canceled')).toBe(false);
  });
});

describe('subscription invariants I1–I7', () => {
  test('valid active subscription passes all invariants', () => {
    expect(
      getSubscriptionInvariantViolations(
        {
          status: 'active',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: FUTURE,
          renewalAttemptCount: 0,
        },
        NOW
      )
    ).toEqual([]);
    expect(() =>
      assertSubscriptionInvariants(
        {
          status: 'active',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: FUTURE,
          renewalAttemptCount: 0,
        },
        NOW
      )
    ).not.toThrow();
  });

  test('I1: premium statuses require expires_at', () => {
    expect(
      getSubscriptionInvariantViolations({ status: 'active', expiresAt: null }, NOW)
    ).toContain('I1');
    expect(
      getSubscriptionInvariantViolations({ status: 'past_due', expiresAt: null }, NOW)
    ).toContain('I1');
  });

  test('I2: active requires next_charge_at unless period ends within 24h', () => {
    expect(
      getSubscriptionInvariantViolations(
        { status: 'active', expiresAt: FUTURE, nextChargeAt: null },
        NOW
      )
    ).toContain('I2');
    expect(
      getSubscriptionInvariantViolations(
        { status: 'active', expiresAt: SOON, nextChargeAt: null },
        NOW
      )
    ).not.toContain('I2');
  });

  test('I3: cancel_at_period_end requires next_charge_at null', () => {
    expect(
      getSubscriptionInvariantViolations(
        { status: 'cancel_at_period_end', expiresAt: FUTURE, nextChargeAt: FUTURE },
        NOW
      )
    ).toContain('I3');
  });

  test('I4: expired has no next_charge_at and no premium access', () => {
    expect(
      getSubscriptionInvariantViolations(
        { status: 'expired', expiresAt: FUTURE, nextChargeAt: FUTURE },
        NOW
      )
    ).toContain('I4');
    expect(
      getSubscriptionInvariantViolations(
        { status: 'expired', expiresAt: FUTURE, nextChargeAt: null },
        NOW
      )
    ).not.toContain('I4');
    expect(
      getSubscriptionInvariantViolations(
        { status: 'expired', expiresAt: new Date('2026-01-01'), nextChargeAt: null },
        NOW
      )
    ).not.toContain('I4');
  });

  test('I5: past_due requires renewal_attempt_count >= 1', () => {
    expect(
      getSubscriptionInvariantViolations(
        { status: 'past_due', expiresAt: FUTURE, renewalAttemptCount: 0 },
        NOW
      )
    ).toContain('I5');
    expect(
      getSubscriptionInvariantViolations(
        { status: 'past_due', expiresAt: FUTURE, renewalAttemptCount: 1 },
        NOW
      )
    ).not.toContain('I5');
  });

  test('I6: charge-ready row must have active or past_due status', () => {
    expect(
      getSubscriptionInvariantViolations(
        {
          status: 'cancel_at_period_end',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: NOW,
        },
        NOW
      )
    ).toContain('I6');
    expect(
      getSubscriptionInvariantViolations(
        {
          status: 'expired',
          expiresAt: new Date('2026-01-01'),
          paymentMethodId: 'pm-1',
          nextChargeAt: NOW,
        },
        NOW
      )
    ).toContain('I6');
    expect(
      getSubscriptionInvariantViolations(
        {
          status: 'active',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: NOW,
        },
        NOW
      )
    ).not.toContain('I6');
    expect(
      getSubscriptionInvariantViolations(
        {
          status: 'cancel_at_period_end',
          expiresAt: FUTURE,
          paymentMethodId: 'pm-1',
          nextChargeAt: FUTURE,
        },
        NOW
      )
    ).not.toContain('I6');
  });
});

describe('MAX_RENEWAL_ATTEMPTS', () => {
  test('matches billing policy (4 attempts / 7 days)', () => {
    expect(MAX_RENEWAL_ATTEMPTS).toBe(4);
  });
});

describe('computeRenewalRetryChargeAt', () => {
  const firstFailedAt = new Date('2026-08-05T12:00:00.000Z');

  test('returns +24h after first failure', () => {
    const next = computeRenewalRetryChargeAt(firstFailedAt, 1);
    expect(next?.toISOString()).toBe('2026-08-06T12:00:00.000Z');
  });

  test('returns +72h after second failure', () => {
    const next = computeRenewalRetryChargeAt(firstFailedAt, 2);
    expect(next?.toISOString()).toBe('2026-08-08T12:00:00.000Z');
  });

  test('returns null when attempts exhausted', () => {
    expect(computeRenewalRetryChargeAt(firstFailedAt, MAX_RENEWAL_ATTEMPTS)).toBeNull();
  });
});

describe('CANONICAL_SUBSCRIPTION_STATUSES', () => {
  test('lists all four lifecycle statuses', () => {
    expect(CANONICAL_SUBSCRIPTION_STATUSES).toEqual([
      'active',
      'cancel_at_period_end',
      'past_due',
      'expired',
    ]);
  });
});
