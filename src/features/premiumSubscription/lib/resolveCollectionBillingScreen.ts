import type { BillingSnapshot } from '@shared/api/billing';
import { isAutoRenewCollectionRemoveHold } from '@shared/lib/subscription/autoRenewCollectionHold';

import type { BillingScreen } from './billingScreen';

/**
 * Autorenew UI grace: between period/charge anchor and settlement window, backend may report
 * hasPremiumAccess=false and status past_due/expired while renewal is in flight.
 * Same window as collection `autorenewCollectionHold` (no expired banner / choose-plan flash).
 */
export function isInAutorenewRenewalGrace(
  billing: BillingSnapshot,
  now: Date = new Date()
): boolean {
  if (billing.status === 'cancel_at_period_end') return false;
  return isAutoRenewCollectionRemoveHold(billing, now);
}

/**
 * Maps backend BillingSnapshot → BillingScreen (ADR-002).
 * NONE ⇔ billing.status === null only.
 */
function isCancelledPeriodEnded(billing: BillingSnapshot, now: Date): boolean {
  if (billing.status !== 'cancel_at_period_end') return false;
  if (!billing.expiresAt?.trim()) return false;

  const expiresMs = new Date(billing.expiresAt).getTime();
  return !Number.isNaN(expiresMs) && expiresMs <= now.getTime();
}

export function resolveCollectionBillingScreen(
  billing: BillingSnapshot,
  now: Date = new Date()
): BillingScreen {
  if (billing.status === null) return 'NONE';

  if (isCancelledPeriodEnded(billing, now)) {
    return 'EXPIRED';
  }

  if (!billing.hasPremiumAccess) {
    if (isInAutorenewRenewalGrace(billing, now)) {
      return 'ACTIVE';
    }
    if (billing.status === 'past_due') {
      return 'PAYMENT_FAILED';
    }
    return 'EXPIRED';
  }

  switch (billing.status) {
    case 'active':
      return 'ACTIVE';
    case 'cancel_at_period_end':
      return 'CANCELLED';
    case 'past_due':
      return 'PAYMENT_FAILED';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'EXPIRED';
  }
}
