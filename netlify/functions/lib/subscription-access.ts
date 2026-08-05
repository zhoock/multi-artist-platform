/**
 * Single access layer for Premium subscription entitlement (PR-1).
 * When SUBSCRIPTION_AUTO_RENEW_ENABLED is off, mirrors legacy isSubscriptionActive().
 */

import type { Subscription } from './subscriptions';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import {
  type CanonicalSubscriptionStatus,
  CANONICAL_SUBSCRIPTION_STATUSES,
  deriveAutoRenewEnabled,
  normalizeCanonicalStatus,
} from './subscription-state';

export { CANONICAL_SUBSCRIPTION_STATUSES, deriveAutoRenewEnabled, normalizeCanonicalStatus };
export type { CanonicalSubscriptionStatus };

const PREMIUM_ACCESS_STATUSES = new Set<CanonicalSubscriptionStatus>([
  'active',
  'cancel_at_period_end',
  'past_due',
]);

function expiresAtMs(subscription: Subscription, now: Date): number | null {
  if (!subscription.expiresAt) return null;
  const expiresAt =
    subscription.expiresAt instanceof Date
      ? subscription.expiresAt
      : new Date(subscription.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;
  return expiresAt.getTime();
}

/** Legacy premium check — status active + expires_at in the future. */
export function hasPremiumAccessLegacy(
  subscription: Subscription | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'active') return false;
  const ms = expiresAtMs(subscription, now);
  if (ms === null) return false;
  return ms > now.getTime();
}

/** Autorenew-aware premium check (ADR-003, ADR-007). */
export function hasPremiumAccessAutorenew(
  subscription: Subscription | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;

  const canonical = normalizeCanonicalStatus(subscription.status);
  if (!canonical || !PREMIUM_ACCESS_STATUSES.has(canonical)) return false;

  const ms = expiresAtMs(subscription, now);
  if (ms === null) return false;

  return ms > now.getTime();
}

/**
 * Entry point for Premium entitlement.
 * Flag off → identical to legacy. Flag on → canonical status rules.
 */
export function hasPremiumAccess(
  subscription: Subscription | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isSubscriptionAutoRenewEnabled()) {
    return hasPremiumAccessLegacy(subscription, now);
  }
  return hasPremiumAccessAutorenew(subscription, now);
}

export async function viewerHasPremiumAccess(
  userId: string | null,
  loadSubscription: (id: string) => Promise<Subscription | null>,
  now: Date = new Date()
): Promise<boolean> {
  if (!userId?.trim()) return false;
  const subscription = await loadSubscription(userId);
  return hasPremiumAccess(subscription, now);
}
