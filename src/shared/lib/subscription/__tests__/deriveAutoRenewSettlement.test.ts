import { describe, expect, test } from '@jest/globals';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';

import {
  deriveAutoRenewSettlementState,
  resolveRenewalCountdownChargeAt,
  RENEWAL_CLAIM_LOCK_FUTURE_THRESHOLD_MS,
} from '../deriveAutoRenewSettlement';

const PERIOD_END = '2026-08-07T12:05:00.000Z';
const NOW = new Date('2026-08-07T12:06:00.000Z');

function billing(overrides: Record<string, unknown> = {}) {
  return {
    ...EMPTY_BILLING_SNAPSHOT,
    status: 'active' as const,
    autoRenewEnabled: true,
    hasSavedPaymentMethod: true,
    hasPremiumAccess: false,
    expiresAt: PERIOD_END,
    nextChargeAt: PERIOD_END,
    autoRenewSettlementPending: false,
    renewalChargeDueAt: null,
    ...overrides,
  };
}

describe('deriveAutoRenewSettlementState', () => {
  test('pending when charge is due and access lapsed', () => {
    const state = deriveAutoRenewSettlementState(billing(), { now: NOW });
    expect(state.pending).toBe(true);
    expect(state.chargeDueAt).toBe(PERIOD_END);
  });

  test('pending when unresolved renewal exists even if clocks moved', () => {
    const claimLockAt = new Date(
      NOW.getTime() + RENEWAL_CLAIM_LOCK_FUTURE_THRESHOLD_MS + 60_000
    ).toISOString();
    const state = deriveAutoRenewSettlementState(
      billing({ nextChargeAt: claimLockAt, expiresAt: PERIOD_END }),
      { now: NOW, hasUnresolvedRenewal: true }
    );
    expect(state.pending).toBe(true);
    expect(state.chargeDueAt).toBe(PERIOD_END);
  });

  test('pending during claim lock (future nextChargeAt, lapsed period)', () => {
    const claimLockAt = new Date(
      NOW.getTime() + RENEWAL_CLAIM_LOCK_FUTURE_THRESHOLD_MS + 60_000
    ).toISOString();
    const state = deriveAutoRenewSettlementState(billing({ nextChargeAt: claimLockAt }), {
      now: NOW,
    });
    expect(state.pending).toBe(true);
  });

  test('not pending after terminal expired without open renewal', () => {
    const state = deriveAutoRenewSettlementState(
      billing({ status: 'expired', autoRenewEnabled: true }),
      { now: NOW }
    );
    expect(state.pending).toBe(false);
  });

  test('not pending when premium access is active', () => {
    const state = deriveAutoRenewSettlementState(
      billing({
        hasPremiumAccess: true,
        expiresAt: '2026-09-07T12:05:00.000Z',
        nextChargeAt: '2026-09-07T12:05:00.000Z',
      }),
      { now: NOW }
    );
    expect(state.pending).toBe(false);
  });
});

describe('resolveRenewalCountdownChargeAt', () => {
  test('uses renewalChargeDueAt during settlement, not claim-lock nextChargeAt', () => {
    const claimLockAt = new Date(
      NOW.getTime() + RENEWAL_CLAIM_LOCK_FUTURE_THRESHOLD_MS + 60_000
    ).toISOString();
    const anchor = resolveRenewalCountdownChargeAt(
      billing({
        autoRenewSettlementPending: true,
        renewalChargeDueAt: PERIOD_END,
        nextChargeAt: claimLockAt,
      }),
      NOW
    );
    expect(anchor).toBe(PERIOD_END);
  });
});
