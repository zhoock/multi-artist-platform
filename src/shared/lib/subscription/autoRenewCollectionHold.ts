import type { BillingSnapshot } from '@shared/api/billing';

import type { AutoRenewSettlementBillingInput } from './deriveAutoRenewSettlement';
import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from './renewalCountdown';
import { resolveAutoRenewSettlement } from './resolveAutoRenewSettlement';

export type AutoRenewCollectionHoldBilling = AutoRenewSettlementBillingInput &
  Partial<Pick<BillingSnapshot, 'autoRenewSettlementPending' | 'renewalChargeDueAt'>>;

export function buildAutoRenewCollectionHoldBilling(params: {
  billing?: Partial<AutoRenewCollectionHoldBilling> | null;
  hasPremiumAccess: boolean;
}): AutoRenewCollectionHoldBilling {
  const { billing, hasPremiumAccess } = params;
  return {
    status: billing?.status ?? null,
    autoRenewEnabled: billing?.autoRenewEnabled ?? false,
    hasSavedPaymentMethod: billing?.hasSavedPaymentMethod ?? false,
    hasPremiumAccess: billing?.hasPremiumAccess ?? hasPremiumAccess,
    nextChargeAt: billing?.nextChargeAt ?? null,
    expiresAt: billing?.expiresAt ?? null,
    autoRenewSettlementPending: billing?.autoRenewSettlementPending,
    renewalChargeDueAt: billing?.renewalChargeDueAt ?? null,
  };
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Auto-renew post-period hold for collection remove UI.
 * Active from charge/period anchor through the settlement window — even when
 * `hasPremiumAccess` is still true on a stale billing snapshot after `lockedUntil` expired.
 */
export function isAutoRenewCollectionRemoveHold(
  billing: AutoRenewCollectionHoldBilling,
  now: Date = new Date()
): boolean {
  const settlement = resolveAutoRenewSettlement(billing as BillingSnapshot, now);
  if (settlement.pending) {
    return true;
  }

  if (!billing.autoRenewEnabled || !billing.hasSavedPaymentMethod) {
    return false;
  }

  const targetMs =
    parseIsoMs(settlement.chargeDueAt) ??
    parseIsoMs(billing.nextChargeAt) ??
    parseIsoMs(billing.expiresAt);
  if (targetMs === null) return false;

  const nowMs = now.getTime();
  if (nowMs < targetMs) return false;

  return nowMs < targetMs + RENEWAL_OVERDUE_IN_PROGRESS_MS;
}

/** @deprecated Alias — same window as collection remove hold. */
export function isAutoRenewSettlementPending(
  billing: AutoRenewCollectionHoldBilling,
  now: Date = new Date()
): boolean {
  return isAutoRenewCollectionRemoveHold(billing, now);
}
