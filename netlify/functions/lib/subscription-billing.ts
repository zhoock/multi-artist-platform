/**
 * Premium subscription billing (platform YooKassa) — isolated from album purchases.
 */

import { isMissingRelationError, query } from './db';
import type { Subscription } from './subscriptions';
import { mapSubscriptionRow, type SubscriptionRow } from './subscriptions';

export const PREMIUM_SUBSCRIPTION_PRODUCT_TYPE = 'premium_subscription';

export const SUBSCRIPTION_PLAN_SLUGS = ['explorer', 'collector', 'archivist'] as const;
export type SubscriptionPlanSlug = (typeof SUBSCRIPTION_PLAN_SLUGS)[number];

export const DEFAULT_SUBSCRIPTION_PLAN: SubscriptionPlanSlug = 'explorer';

/** @deprecated Legacy plan slug — normalized to explorer at read/validation time. */
export const LEGACY_SUBSCRIPTION_PLAN = 'archive';

export interface SubscriptionPlanDefinition {
  slotsLimit: number;
  /** Dev/test support period. Ignored when durationDays is set. */
  durationHours: number;
  /** Production support period (days). Uncomment before production rollout. */
  durationDays?: number;
  priceRubProduction: number;
  description: string;
}

// DEVELOPMENT VALUES.
// Replace before production:
//
// Explorer:  20 artists / 30 days
// Collector: 60 artists / 30 days
// Archivist: 100 artists / 30 days
export const PLAN_CATALOG: Record<SubscriptionPlanSlug, SubscriptionPlanDefinition> = {
  explorer: {
    slotsLimit: 1,
    durationHours: 1,
    priceRubProduction: 149,
    description: 'Explorer Support',
  },
  collector: {
    slotsLimit: 2,
    durationHours: 1,
    priceRubProduction: 149,
    description: 'Collector Support',
  },
  archivist: {
    slotsLimit: 3,
    durationHours: 1,
    priceRubProduction: 149,
    description: 'Archivist Support',
  },
};

export function isPremiumSubscriptionDevTestPricing(): boolean {
  return (
    process.env.NETLIFY_DEV === 'true' ||
    process.env.NODE_ENV !== 'production' ||
    process.env.YOOKASSA_TEST_MODE === 'true'
  );
}

export function normalizeSubscriptionPlanSlug(
  plan: string | null | undefined
): SubscriptionPlanSlug | null {
  if (!plan?.trim()) return null;
  const trimmed = plan.trim();
  if (trimmed === LEGACY_SUBSCRIPTION_PLAN) return DEFAULT_SUBSCRIPTION_PLAN;
  if ((SUBSCRIPTION_PLAN_SLUGS as readonly string[]).includes(trimmed)) {
    return trimmed as SubscriptionPlanSlug;
  }
  return null;
}

export function isSubscriptionPlanSlug(
  plan: string | null | undefined
): plan is SubscriptionPlanSlug {
  return normalizeSubscriptionPlanSlug(plan) !== null;
}

export function getPlanDefinition(planSlug: SubscriptionPlanSlug): SubscriptionPlanDefinition {
  return PLAN_CATALOG[planSlug];
}

export function getPlanSlotsLimit(planSlug: SubscriptionPlanSlug): number {
  return PLAN_CATALOG[planSlug].slotsLimit;
}

export function getPlanAmountRub(planSlug: SubscriptionPlanSlug): number {
  if (isPremiumSubscriptionDevTestPricing()) return 1;
  return PLAN_CATALOG[planSlug].priceRubProduction;
}

export function computeSupportExpiresAt(
  planSlug: SubscriptionPlanSlug,
  from: Date = new Date()
): Date {
  const plan = PLAN_CATALOG[planSlug];
  const expiresAt = new Date(from);
  if (plan.durationDays != null) {
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
  } else {
    expiresAt.setTime(expiresAt.getTime() + plan.durationHours * 60 * 60 * 1000);
  }
  return expiresAt;
}

export type SubscriptionPaymentValidationResult =
  | { valid: true; planSlug: SubscriptionPlanSlug }
  | { valid: false; reason: string };

export function validatePremiumSubscriptionPayment(params: {
  productType: string | null | undefined;
  userId: string | null | undefined;
  plan: string | null | undefined;
  amountValue: string;
  currency: string;
  amountsEqual: (a: string, b: string) => boolean;
}): SubscriptionPaymentValidationResult {
  const { productType, userId, plan, amountValue, currency, amountsEqual } = params;

  if (productType !== PREMIUM_SUBSCRIPTION_PRODUCT_TYPE) {
    return { valid: false, reason: 'productType' };
  }
  if (!userId) {
    return { valid: false, reason: 'missing userId metadata' };
  }

  const planSlug = normalizeSubscriptionPlanSlug(plan);
  if (!planSlug) {
    return { valid: false, reason: 'plan metadata' };
  }

  const expectedAmount = getPlanAmountRub(planSlug).toFixed(2);
  if (!amountsEqual(amountValue, expectedAmount) || currency.trim().toUpperCase() !== 'RUB') {
    return { valid: false, reason: 'amount or currency' };
  }

  return { valid: true, planSlug };
}

const SUBSCRIPTION_PAYMENT_STATUSES = [
  'pending',
  'waiting_for_capture',
  'succeeded',
  'canceled',
  'failed',
] as const;

export type SubscriptionPaymentStatus = (typeof SUBSCRIPTION_PAYMENT_STATUSES)[number];

export interface SubscriptionPaymentRow {
  id: string;
  user_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: SubscriptionPaymentStatus;
  amount: string;
  currency: string;
  plan: string;
}

export async function createPendingSubscriptionPayment(
  userId: string,
  planSlug: SubscriptionPlanSlug = DEFAULT_SUBSCRIPTION_PLAN
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO subscription_payments (user_id, provider, status, amount, currency, plan)
     VALUES ($1, 'yookassa', 'pending', $2, 'RUB', $3)
     RETURNING id`,
    [userId, getPlanAmountRub(planSlug), planSlug]
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Failed to create subscription payment row');
  return id;
}

export async function attachProviderPaymentId(
  subscriptionPaymentId: string,
  providerPaymentId: string
): Promise<void> {
  await query(
    `UPDATE subscription_payments
     SET provider_payment_id = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [subscriptionPaymentId, providerPaymentId]
  );
}

export async function updateSubscriptionPaymentStatus(
  providerPaymentId: string,
  status: SubscriptionPaymentStatus
): Promise<void> {
  try {
    await query(
      `UPDATE subscription_payments
       SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE provider = 'yookassa' AND provider_payment_id = $1`,
      [providerPaymentId, status]
    );
  } catch (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
}

export async function getSubscriptionPaymentByProviderId(
  providerPaymentId: string
): Promise<SubscriptionPaymentRow | null> {
  try {
    const r = await query<SubscriptionPaymentRow>(
      `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount, currency, plan
       FROM subscription_payments
       WHERE provider = 'yookassa' AND provider_payment_id = $1
       LIMIT 1`,
      [providerPaymentId]
    );
    return r.rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

export async function getSubscriptionPaymentForUser(
  providerPaymentId: string,
  userId: string
): Promise<SubscriptionPaymentRow | null> {
  const row = await getSubscriptionPaymentByProviderId(providerPaymentId);
  if (!row || row.user_id !== userId) return null;
  return row;
}

export async function getSubscriptionPaymentByInternalId(
  subscriptionPaymentId: string,
  userId: string
): Promise<SubscriptionPaymentRow | null> {
  try {
    const r = await query<SubscriptionPaymentRow>(
      `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount, currency, plan
       FROM subscription_payments
       WHERE id = $1 AND user_id = $2::uuid
       LIMIT 1`,
      [subscriptionPaymentId, userId]
    );
    return r.rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

/**
 * Activate or renew platform Premium subscription after successful YooKassa payment.
 * Plan and slots_limit are taken from PLAN_CATALOG; support period starts from now.
 */
export async function fulfillSubscriptionPayment(params: {
  userId: string;
  planSlug: SubscriptionPlanSlug;
  providerPaymentId?: string | null;
}): Promise<Subscription> {
  const { userId, planSlug, providerPaymentId } = params;
  const plan = getPlanDefinition(planSlug);
  const slotsLimit = plan.slotsLimit;

  const existing = await query<SubscriptionRow>(
    `SELECT
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  const now = new Date();
  const expiresAt = computeSupportExpiresAt(planSlug, now);

  const row = existing.rows[0];

  if (row) {
    const canReuse =
      row.status === 'expired' ||
      row.status === 'canceled' ||
      row.status === 'paused' ||
      row.status === 'trial';

    if (canReuse || row.status === 'active') {
      const updated = await query<SubscriptionRow>(
        `UPDATE subscriptions
         SET status = 'active',
             plan = $2,
             slots_limit = $3,
             provider = 'yookassa',
             provider_subscription_id = COALESCE($4, provider_subscription_id),
             started_at = CASE WHEN $5 THEN $6 ELSE started_at END,
             expires_at = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING
           id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
           started_at, expires_at, created_at, updated_at`,
        [row.id, planSlug, slotsLimit, providerPaymentId ?? null, canReuse, now, expiresAt]
      );
      const next = updated.rows[0];
      if (!next) throw new Error('Failed to update subscription');
      return mapSubscriptionRow(next);
    }
  }

  const inserted = await query<SubscriptionRow>(
    `INSERT INTO subscriptions (
       user_id, status, plan, slots_limit, provider, provider_subscription_id, started_at, expires_at
     ) VALUES ($1::uuid, 'active', $2, $3, 'yookassa', $4, $5, $6)
     RETURNING
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, created_at, updated_at`,
    [userId, planSlug, slotsLimit, providerPaymentId ?? null, now, expiresAt]
  );

  const created = inserted.rows[0];
  if (!created) throw new Error('Failed to create subscription');
  return mapSubscriptionRow(created);
}
