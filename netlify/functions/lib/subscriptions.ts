/**
 * Подписки платформы: premium state, сроки, лимиты слотов.
 * Archive (какие артисты открыты) — отдельная система; здесь только subscription layer.
 */

import { isMissingRelationError, query } from './db';
import { hasPremiumAccess } from './subscription-access';

export const SUBSCRIPTION_STATUSES = [
  'active',
  'cancel_at_period_end',
  'past_due',
  'canceled',
  'expired',
  'trial',
  'paused',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type BillingOrigin = 'production' | 'dev';

export interface Subscription {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  plan: string;
  slotsLimit: number;
  provider: string | null;
  providerSubscriptionId: string | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  /** YooKassa payment_method.id — populated when autoprenew is enabled (PR-1 schema). */
  paymentMethodId?: string | null;
  /** Masked card label for BillingSnapshot (PR-9). */
  paymentMethodTitle?: string | null;
  nextChargeAt?: Date | null;
  renewalAttemptCount?: number;
  scheduledPlan?: string | null;
  firstFailedAt?: Date | null;
  /** Incremented on payment-method unlink; rebind checkout captures at POST. */
  paymentMethodEpoch?: number;
  /** Immutable after first fulfillment — dev vs production billing isolation. */
  billingOrigin?: BillingOrigin;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  plan: string;
  slots_limit: number;
  provider: string | null;
  provider_subscription_id: string | null;
  started_at: Date | null;
  expires_at: Date | null;
  payment_method_id?: string | null;
  payment_method_title?: string | null;
  next_charge_at?: Date | null;
  renewal_attempt_count?: number | null;
  scheduled_plan?: string | null;
  first_failed_at?: Date | null;
  payment_method_epoch?: number | null;
  billing_origin?: BillingOrigin | null;
  created_at: Date;
  updated_at: Date;
}

export function mapSubscriptionRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    plan: row.plan,
    slotsLimit: row.slots_limit,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    paymentMethodId: row.payment_method_id ?? null,
    paymentMethodTitle: row.payment_method_title ?? null,
    nextChargeAt: row.next_charge_at ?? null,
    renewalAttemptCount: row.renewal_attempt_count ?? undefined,
    scheduledPlan: row.scheduled_plan ?? null,
    firstFailedAt: row.first_failed_at ?? null,
    paymentMethodEpoch: row.payment_method_epoch ?? 0,
    billingOrigin: row.billing_origin === 'dev' ? 'dev' : 'production',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Последняя подписка пользователя (по created_at), независимо от статуса.
 */
export async function getViewerSubscription(userId: string): Promise<Subscription | null> {
  if (!userId?.trim()) return null;

  try {
    const r = await query<SubscriptionRow>(
      `SELECT
         id,
         user_id,
         status,
         plan,
         slots_limit,
         provider,
         provider_subscription_id,
         started_at,
         expires_at,
         payment_method_id,
         payment_method_title,
         next_charge_at,
         renewal_attempt_count,
         scheduled_plan,
         first_failed_at,
         payment_method_epoch,
         billing_origin,
         created_at,
         updated_at
       FROM subscriptions
       WHERE user_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    const row = r.rows[0];
    return row ? mapSubscriptionRow(row) : null;
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn('[subscriptions] subscriptions table missing — treating as no subscription');
      return null;
    }
    throw error;
  }
}

/**
 * Legacy premium check — status active + expires_at in the future.
 * Prefer {@link hasPremiumAccess} for runtime entitlement (ADR-003).
 */
export function isSubscriptionActive(subscription: Subscription | null | undefined): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'active') return false;
  if (!subscription.expiresAt) return false;

  const expiresAt =
    subscription.expiresAt instanceof Date
      ? subscription.expiresAt
      : new Date(subscription.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;

  return expiresAt.getTime() > Date.now();
}

/** @deprecated Prefer {@link hasPremiumAccess} via subscription-access (ADR-003). */
export async function viewerHasActiveSubscription(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const subscription = await getViewerSubscription(userId);
  return hasPremiumAccess(subscription);
}
