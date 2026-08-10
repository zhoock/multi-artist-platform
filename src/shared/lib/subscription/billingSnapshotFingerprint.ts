import type { BillingSnapshot } from '@shared/api/billing';

/** Stable key for detecting subscription billing changes across archive reloads. */
export function billingSnapshotFingerprint(billing: BillingSnapshot): string {
  return [
    billing.plan ?? '',
    billing.scheduledPlan ?? '',
    billing.slotsLimit,
    billing.status ?? '',
    billing.hasPremiumAccess,
    billing.autoRenewEnabled,
    billing.hasSavedPaymentMethod,
    billing.paymentMethodTitle ?? '',
    billing.nextChargeAt ?? '',
    billing.expiresAt ?? '',
  ].join('|');
}
