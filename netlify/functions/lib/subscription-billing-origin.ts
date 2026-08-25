/**
 * billing_origin runtime guards: dev runtime mutates dev subscriptions only;
 * production runtime mutates production subscriptions only.
 */

import { isDevPaymentModeEnabled } from './dev-payment-mode';
import type { Subscription } from './subscriptions';

export const BILLING_ORIGINS = ['production', 'dev'] as const;
export type BillingOrigin = (typeof BILLING_ORIGINS)[number];

export type BillingOriginGuardReason =
  | 'dev_subscription_production_runtime'
  | 'production_subscription_dev_runtime';

export type BillingOriginGuardResult =
  | { allowed: true }
  | { allowed: false; reason: BillingOriginGuardReason };

export function resolveBillingOriginForNewSubscription(): BillingOrigin {
  return isDevPaymentModeEnabled() ? 'dev' : 'production';
}

export function normalizeBillingOrigin(value: string | null | undefined): BillingOrigin {
  return value === 'dev' ? 'dev' : 'production';
}

export function checkBillingMutationAllowed(
  subscription: Pick<Subscription, 'billingOrigin'> | null | undefined
): BillingOriginGuardResult {
  if (!subscription) {
    return { allowed: true };
  }

  const origin = normalizeBillingOrigin(subscription.billingOrigin);
  const runtimeDev = isDevPaymentModeEnabled();

  if (runtimeDev && origin === 'production') {
    return { allowed: false, reason: 'production_subscription_dev_runtime' };
  }
  if (!runtimeDev && origin === 'dev') {
    return { allowed: false, reason: 'dev_subscription_production_runtime' };
  }
  return { allowed: true };
}

/** SQL fragment appended to scheduler eligibility queries for the active runtime. */
export function sqlBillingOriginFilterForRuntime(): string {
  if (isDevPaymentModeEnabled()) {
    return "AND billing_origin = 'dev'";
  }
  return "AND billing_origin = 'production'";
}
