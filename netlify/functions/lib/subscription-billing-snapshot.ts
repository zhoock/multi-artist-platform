/**
 * BillingSnapshot DTO for GET /api/my-archive (PR-4).
 * Read-only projection — does not change entitlement or runtime paths.
 */

import {
  deriveAutoRenewEnabled,
  hasPremiumAccess,
  normalizeCanonicalStatus,
  type CanonicalSubscriptionStatus,
} from './subscription-access';
import { toPresenceStatus } from './subscription-state';
import type { Subscription } from './subscriptions';

/** Matches PLAN_CATALOG.archivist.slotsLimit — keep in sync with subscription-billing.ts */
const SUBSCRIPTION_SLOTS_LIMIT_FALLBACK = 100;

export type SubscriptionPlanSlug = 'explorer' | 'collector' | 'archivist';

const SUBSCRIPTION_PLAN_SLUGS: readonly SubscriptionPlanSlug[] = [
  'explorer',
  'collector',
  'archivist',
];

export interface BillingSnapshot {
  /** Canonical lifecycle status; null when user has no subscription row. */
  status: CanonicalSubscriptionStatus | null;
  plan: SubscriptionPlanSlug | null;
  slotsLimit: number;
  expiresAt: string | null;
  autoRenewEnabled: boolean;
  hasPremiumAccess: boolean;
  /** Derived from payment_method_id — independent of masked card title for UI. */
  hasSavedPaymentMethod: boolean;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
  scheduledPlan: SubscriptionPlanSlug | null;
  renewalAttemptCount: number | null;
  firstFailedAt: string | null;
}

function normalizePlanSlug(plan: string | null | undefined): SubscriptionPlanSlug | null {
  if (!plan?.trim()) return null;
  const trimmed = plan.trim();
  if ((SUBSCRIPTION_PLAN_SLUGS as readonly string[]).includes(trimmed)) {
    return trimmed as SubscriptionPlanSlug;
  }
  return null;
}

function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

export function deriveHasSavedPaymentMethod(
  subscription: Subscription | null | undefined
): boolean {
  return Boolean(subscription?.paymentMethodId?.trim());
}

/** Returns masked payment method title when stored; preserves existing title when a new mask is unavailable. */
export function derivePaymentMethodTitle(
  subscription: Subscription | null | undefined,
  candidateTitle?: string | null
): string | null {
  const newTitle = candidateTitle?.trim();
  if (newTitle) return newTitle;

  const existing = subscription?.paymentMethodTitle?.trim();
  if (existing) return existing;

  if (!subscription?.paymentMethodId?.trim()) return null;
  return null;
}

export function buildBillingSnapshot(
  subscription: Subscription | null | undefined,
  options: { slotsLimitFallback?: number; now?: Date } = {}
): BillingSnapshot {
  const now = options.now ?? new Date();
  const slotsLimitFallback = options.slotsLimitFallback ?? SUBSCRIPTION_SLOTS_LIMIT_FALLBACK;

  if (!subscription) {
    return {
      status: null,
      plan: null,
      slotsLimit: slotsLimitFallback,
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
  }

  const presence = toPresenceStatus(subscription);

  return {
    status: presence === 'none' ? null : presence,
    plan: normalizePlanSlug(subscription.plan),
    slotsLimit: subscription.slotsLimit,
    expiresAt: toIso(subscription.expiresAt),
    autoRenewEnabled: deriveAutoRenewEnabled(subscription.status),
    hasPremiumAccess: hasPremiumAccess(subscription, now),
    hasSavedPaymentMethod: deriveHasSavedPaymentMethod(subscription),
    paymentMethodTitle: derivePaymentMethodTitle(subscription),
    nextChargeAt: toIso(subscription.nextChargeAt),
    scheduledPlan: normalizePlanSlug(subscription.scheduledPlan),
    renewalAttemptCount:
      subscription.renewalAttemptCount != null ? subscription.renewalAttemptCount : null,
    firstFailedAt: toIso(subscription.firstFailedAt),
  };
}

/** Exported for tests — maps raw DB status to API billing status. */
export function billingStatusFromSubscription(
  subscription: Subscription | null | undefined
): CanonicalSubscriptionStatus | null {
  if (!subscription) return null;
  const presence = toPresenceStatus(subscription);
  if (presence === 'none') return null;
  return normalizeCanonicalStatus(subscription.status) ?? presence;
}
