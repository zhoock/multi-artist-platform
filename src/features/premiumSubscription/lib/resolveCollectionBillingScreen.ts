import type { BillingSnapshot } from '@shared/api/billing';
import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from '@shared/lib/subscription/renewalCountdown';

import type { BillingScreen } from './billingScreen';

/**
 * Autorenew UI grace: between nextChargeAt and poll/scheduler renewal, backend may still
 * report hasPremiumAccess=false. Keep billing card ACTIVE (no «Поддержка завершена» flash).
 *
 * Narrow on purpose — only when renewal is actually expected:
 * - status `active` (not cancel_at_period_end, expired, past_due)
 * - autoRenewEnabled
 * - nextChargeAt due (overdue, within poll window)
 * - saved payment method (hasSavedPaymentMethod from payment_method_id)
 */
export function isInAutorenewRenewalGrace(
  billing: BillingSnapshot,
  now: Date = new Date()
): boolean {
  if (billing.status !== 'active') return false;
  if (!billing.autoRenewEnabled) return false;
  if (!billing.hasSavedPaymentMethod) return false;
  if (!billing.nextChargeAt?.trim()) return false;

  const chargeMs = new Date(billing.nextChargeAt).getTime();
  if (Number.isNaN(chargeMs)) return false;

  const overdueMs = now.getTime() - chargeMs;
  return overdueMs >= 0 && overdueMs <= RENEWAL_OVERDUE_IN_PROGRESS_MS;
}

/**
 * Maps backend BillingSnapshot → BillingScreen (ADR-002).
 * NONE ⇔ billing.status === null only.
 */
export function resolveCollectionBillingScreen(
  billing: BillingSnapshot,
  now: Date = new Date()
): BillingScreen {
  if (billing.status === null) return 'NONE';

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
