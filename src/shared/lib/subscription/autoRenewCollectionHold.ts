import type { BillingSnapshot } from '@shared/api/billing';

import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from './renewalCountdown';

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
  billing: Pick<
    BillingSnapshot,
    'autoRenewEnabled' | 'hasSavedPaymentMethod' | 'nextChargeAt' | 'expiresAt'
  >,
  now: Date = new Date()
): boolean {
  if (!billing.autoRenewEnabled || !billing.hasSavedPaymentMethod) {
    return false;
  }

  const targetMs = parseIsoMs(billing.nextChargeAt) ?? parseIsoMs(billing.expiresAt);
  if (targetMs === null) return false;

  const nowMs = now.getTime();
  if (nowMs < targetMs) return false;

  return nowMs < targetMs + RENEWAL_OVERDUE_IN_PROGRESS_MS;
}

/** @deprecated Alias — same window as collection remove hold. */
export function isAutoRenewSettlementPending(
  billing: Pick<
    BillingSnapshot,
    'autoRenewEnabled' | 'hasSavedPaymentMethod' | 'nextChargeAt' | 'expiresAt' | 'status'
  >,
  now: Date = new Date()
): boolean {
  return isAutoRenewCollectionRemoveHold(billing, now);
}
