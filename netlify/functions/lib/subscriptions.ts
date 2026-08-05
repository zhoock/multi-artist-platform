/**
 * Подписки платформы: premium state, сроки, лимиты слотов.
 * Archive (какие артисты открыты) — отдельная система; здесь только subscription layer.
 */

import { isMissingRelationError, query } from './db';

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
  nextChargeAt?: Date | null;
  renewalAttemptCount?: number;
  scheduledPlan?: string | null;
  firstFailedAt?: Date | null;
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
 * Активна только при status === 'active' и expires_at в будущем.
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

export async function viewerHasActiveSubscription(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const subscription = await getViewerSubscription(userId);
  return isSubscriptionActive(subscription);
}
