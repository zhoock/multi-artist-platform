import type { BillingSnapshot } from '@shared/api/billing';

/** If next_charge_at is this far beyond now while the paid period ended, treat it as scheduler claim lock. */
export const RENEWAL_CLAIM_LOCK_FUTURE_THRESHOLD_MS = 10 * 60 * 1000;

export type AutoRenewSettlementBillingInput = Pick<
  BillingSnapshot,
  | 'status'
  | 'autoRenewEnabled'
  | 'hasSavedPaymentMethod'
  | 'hasPremiumAccess'
  | 'nextChargeAt'
  | 'expiresAt'
>;

export type AutoRenewSettlementState = {
  pending: boolean;
  chargeDueAt: string | null;
};

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Charge anchor for countdown/grace — not the scheduler claim-lock `nextChargeAt`. */
export function deriveRenewalChargeDueAt(
  billing: AutoRenewSettlementBillingInput,
  now: Date = new Date()
): string | null {
  if (!billing.autoRenewEnabled || !billing.hasSavedPaymentMethod) {
    return null;
  }

  const nowMs = now.getTime();
  const expiresMs = parseIsoMs(billing.expiresAt);
  const nextChargeMs = parseIsoMs(billing.nextChargeAt);

  if (billing.hasPremiumAccess) {
    if (nextChargeMs !== null) return billing.nextChargeAt!;
    if (expiresMs !== null) return billing.expiresAt!;
    return null;
  }

  if (expiresMs !== null && expiresMs <= nowMs) {
    return billing.expiresAt!;
  }

  if (nextChargeMs !== null && nextChargeMs <= nowMs) {
    return billing.nextChargeAt!;
  }

  return null;
}

function isClaimLockNextCharge(params: {
  nextChargeMs: number;
  expiresMs: number | null;
  nowMs: number;
}): boolean {
  if (params.expiresMs === null || params.expiresMs > params.nowMs) {
    return false;
  }
  return params.nextChargeMs - params.nowMs >= RENEWAL_CLAIM_LOCK_FUTURE_THRESHOLD_MS;
}

/**
 * True while auto-renew outcome is unknown: charge due, open renewal payment, or claim lock in flight.
 * Terminal `expired` without an open renewal is not pending.
 */
export function deriveAutoRenewSettlementState(
  billing: AutoRenewSettlementBillingInput,
  options: { now?: Date; hasUnresolvedRenewal?: boolean } = {}
): AutoRenewSettlementState {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const chargeDueAt = deriveRenewalChargeDueAt(billing, now);

  if (options.hasUnresolvedRenewal) {
    return { pending: true, chargeDueAt };
  }

  if (!billing.autoRenewEnabled || !billing.hasSavedPaymentMethod) {
    return { pending: false, chargeDueAt: null };
  }

  if (billing.status === 'expired' || billing.status === null) {
    return { pending: false, chargeDueAt: null };
  }

  if (billing.status !== 'active' && billing.status !== 'past_due') {
    return { pending: false, chargeDueAt: null };
  }

  if (billing.hasPremiumAccess) {
    return { pending: false, chargeDueAt: null };
  }

  const expiresMs = parseIsoMs(billing.expiresAt);
  const nextChargeMs = parseIsoMs(billing.nextChargeAt);

  if (
    nextChargeMs !== null &&
    expiresMs !== null &&
    isClaimLockNextCharge({ nextChargeMs, expiresMs, nowMs })
  ) {
    return { pending: true, chargeDueAt: chargeDueAt ?? billing.expiresAt };
  }

  if (chargeDueAt) {
    const dueMs = parseIsoMs(chargeDueAt);
    if (dueMs !== null && dueMs <= nowMs) {
      return { pending: true, chargeDueAt };
    }
  }

  return { pending: false, chargeDueAt: null };
}

/** Countdown anchor — uses renewal charge due time during settlement, not claim-lock nextChargeAt. */
export function resolveRenewalCountdownChargeAt(
  billing: AutoRenewSettlementBillingInput &
    Pick<BillingSnapshot, 'autoRenewSettlementPending' | 'renewalChargeDueAt'>,
  now: Date = new Date()
): string | null {
  const settlement =
    typeof billing.autoRenewSettlementPending === 'boolean'
      ? {
          pending: billing.autoRenewSettlementPending,
          chargeDueAt: billing.renewalChargeDueAt ?? deriveRenewalChargeDueAt(billing, now),
        }
      : deriveAutoRenewSettlementState(billing, { now });

  if (settlement.pending && settlement.chargeDueAt) {
    return settlement.chargeDueAt;
  }

  return billing.nextChargeAt ?? billing.expiresAt;
}
