/**
 * BillingSnapshot — mirrors netlify/functions/lib/subscription-billing-snapshot.ts (PR-4).
 * Source of truth for subscription billing fields on GET /api/my-archive.
 */

export type CanonicalSubscriptionStatus =
  | 'active'
  | 'cancel_at_period_end'
  | 'past_due'
  | 'expired';

export type SubscriptionPlanSlug = 'explorer' | 'collector' | 'archivist';

export interface BillingSnapshot {
  status: CanonicalSubscriptionStatus | null;
  plan: SubscriptionPlanSlug | null;
  slotsLimit: number;
  expiresAt: string | null;
  autoRenewEnabled: boolean;
  hasPremiumAccess: boolean;
  /** True when subscription.payment_method_id is stored (renewal can charge). */
  hasSavedPaymentMethod: boolean;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
  scheduledPlan: SubscriptionPlanSlug | null;
  renewalAttemptCount: number | null;
  firstFailedAt: string | null;
}

/** Fallback when context loads without archive data yet. */
export const EMPTY_BILLING_SNAPSHOT: BillingSnapshot = {
  status: null,
  plan: null,
  slotsLimit: 3,
  expiresAt: null,
  autoRenewEnabled: false,
  hasPremiumAccess: false,
  hasSavedPaymentMethod: false,
  paymentMethodTitle: null,
  nextChargeAt: null,
  scheduledPlan: null,
  renewalAttemptCount: null,
  firstFailedAt: null,
};
