import type { BillingSnapshot } from '@shared/api/billing';

import type { BillingScreen } from './billingScreen';

/**
 * Maps backend BillingSnapshot → BillingScreen (ADR-002).
 * NONE ⇔ billing.status === null only.
 */
export function resolveCollectionBillingScreen(billing: BillingSnapshot): BillingScreen {
  if (billing.status === null) return 'NONE';

  if (!billing.hasPremiumAccess) return 'EXPIRED';

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
