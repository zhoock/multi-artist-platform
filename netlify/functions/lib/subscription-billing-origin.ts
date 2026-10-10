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

/** Production runtime may disable auto-renew on dev-origin rows (shared DB); enable stays guarded. */
export function isAutoRenewPatchBillingMutationAllowed(
  subscription: Pick<Subscription, 'billingOrigin'>,
  autoRenewEnabled: boolean
): boolean {
  const guard = checkBillingMutationAllowed(subscription);
  if (guard.allowed) return true;
  return !autoRenewEnabled && !isDevPaymentModeEnabled();
}

export function resolveAutoRenewPatchOriginErrorCode(
  subscription: Pick<Subscription, 'billingOrigin'>,
  autoRenewEnabled: boolean
): 'DEV_SUBSCRIPTION_RESUME_BLOCKED' | 'BILLING_ORIGIN_MISMATCH' {
  if (
    autoRenewEnabled &&
    normalizeBillingOrigin(subscription.billingOrigin) === 'dev' &&
    !isDevPaymentModeEnabled()
  ) {
    return 'DEV_SUBSCRIPTION_RESUME_BLOCKED';
  }
  return 'BILLING_ORIGIN_MISMATCH';
}

function isInitialCheckoutKind(kind: string | null | undefined): boolean {
  const normalized = kind?.trim();
  return !normalized || normalized === 'initial';
}

function isRebindCheckoutKind(kind: string | null | undefined): boolean {
  return kind?.trim() === 'rebind';
}

function paidPeriodHasEnded(subscription: Pick<Subscription, 'status'>): boolean {
  return subscription.status === 'expired' || subscription.status === 'canceled';
}

/**
 * Production initial checkout may fulfill an ended dev-origin subscription.
 * The new period is stamped production. Dev-marked payments, live periods,
 * and renewal/upgrade stay on the normal origin guard.
 */
export function allowsProductionResubscribeOfEndedDevSubscription(params: {
  subscription: Pick<Subscription, 'billingOrigin' | 'status'> | null | undefined;
  paymentKind: string | null | undefined;
  devMarkedPayment: boolean;
}): boolean {
  if (params.devMarkedPayment || isDevPaymentModeEnabled()) return false;
  if (!isInitialCheckoutKind(params.paymentKind)) return false;
  if (!params.subscription) return false;
  if (normalizeBillingOrigin(params.subscription.billingOrigin) !== 'dev') return false;
  const guard = checkBillingMutationAllowed(params.subscription);
  if (guard.allowed || guard.reason !== 'dev_subscription_production_runtime') return false;
  return paidPeriodHasEnded(params.subscription);
}

/**
 * Production may apply a rebind on a dev-origin subscription: only payment_method_id/title
 * change, no period extension and no billing_origin rewrite.
 */
export function allowsProductionRebindOfDevSubscription(params: {
  subscription: Pick<Subscription, 'billingOrigin'> | null | undefined;
  paymentKind: string | null | undefined;
}): boolean {
  if (isDevPaymentModeEnabled()) return false;
  if (!isRebindCheckoutKind(params.paymentKind)) return false;
  if (!params.subscription) return false;
  if (normalizeBillingOrigin(params.subscription.billingOrigin) !== 'dev') return false;
  const guard = checkBillingMutationAllowed(params.subscription);
  return !guard.allowed && guard.reason === 'dev_subscription_production_runtime';
}

function isTestFulfillmentPaymentKind(kind: string | null | undefined): boolean {
  const normalized = kind?.trim();
  if (!normalized || normalized === 'initial') return true;
  return normalized === 'renewal' || normalized === 'upgrade';
}

/**
 * Production may fulfill a confirmed YooKassa test payment even when billing_origin
 * would normally block (shared DB QA). Does not apply to dev-marked synthetic payments.
 */
export function allowsProductionYooKassaTestPaymentFulfillment(params: {
  paymentKind: string | null | undefined;
  devMarkedPayment: boolean;
  providerTestPayment: boolean;
  providerPaymentSucceeded: boolean;
}): boolean {
  if (params.devMarkedPayment || isDevPaymentModeEnabled()) return false;
  if (!params.providerTestPayment || !params.providerPaymentSucceeded) return false;
  if (!isTestFulfillmentPaymentKind(params.paymentKind)) return false;
  return true;
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

/** Whether poll/webhook may run subscription payment fulfillment for this row. */
export function allowsProductionBillingFulfillmentDespiteOriginGuard(params: {
  subscription: Pick<Subscription, 'billingOrigin' | 'status'> | null | undefined;
  paymentKind: string | null | undefined;
  devMarkedPayment: boolean;
  providerTestPayment?: boolean;
  providerPaymentSucceeded?: boolean;
}): boolean {
  if (checkBillingMutationAllowed(params.subscription).allowed) return true;
  return (
    allowsProductionResubscribeOfEndedDevSubscription(params) ||
    allowsProductionRebindOfDevSubscription(params) ||
    allowsProductionYooKassaTestPaymentFulfillment({
      paymentKind: params.paymentKind,
      devMarkedPayment: params.devMarkedPayment,
      providerTestPayment: params.providerTestPayment === true,
      providerPaymentSucceeded: params.providerPaymentSucceeded === true,
    })
  );
}

/** SQL fragment appended to scheduler eligibility queries for the active runtime. */
export function sqlBillingOriginFilterForRuntime(): string {
  if (isDevPaymentModeEnabled()) {
    return "AND billing_origin = 'dev'";
  }
  return "AND billing_origin = 'production'";
}
