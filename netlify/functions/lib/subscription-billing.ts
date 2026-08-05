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

/** Dev/test support period when {@link isPremiumSubscriptionDevTestPricing} is true. */
export const DEV_SUPPORT_PERIOD_HOURS = 1;

export interface SubscriptionPlanDefinition {
  slotsLimit: number;
  durationDays: number;
  priceRubProduction: number;
  description: string;
}

/** Production plan catalog (30-day billing period). Dev pricing/period via env — see .env.example. */
export const PLAN_CATALOG: Record<SubscriptionPlanSlug, SubscriptionPlanDefinition> = {
  explorer: {
    slotsLimit: 20,
    durationDays: 30,
    priceRubProduction: 149,
    description: 'Explorer Support',
  },
  collector: {
    slotsLimit: 60,
    durationDays: 30,
    priceRubProduction: 149,
    description: 'Collector Support',
  },
  archivist: {
    slotsLimit: 100,
    durationDays: 30,
    priceRubProduction: 199,
    description: 'Archivist Support',
  },
};

/** Fallback slots limit when no subscription row exists (top tier). */
export const SUBSCRIPTION_SLOTS_LIMIT_FALLBACK = PLAN_CATALOG.archivist.slotsLimit;

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

/** Minimal verification charge for payment-method rebind (PR-9). */
export function getRebindAmountRub(): number {
  if (isPremiumSubscriptionDevTestPricing()) return 1;
  return 1;
}

export const REBIND_PAYMENT_DESCRIPTION = 'Payment method verification';

export const PLAN_TIER_ORDER: Record<SubscriptionPlanSlug, number> = {
  explorer: 0,
  collector: 1,
  archivist: 2,
};

export function comparePlanTiers(a: SubscriptionPlanSlug, b: SubscriptionPlanSlug): -1 | 0 | 1 {
  const diff = PLAN_TIER_ORDER[a] - PLAN_TIER_ORDER[b];
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

export function computeSupportExpiresAt(
  planSlug: SubscriptionPlanSlug,
  from: Date = new Date()
): Date {
  const plan = PLAN_CATALOG[planSlug];
  const expiresAt = new Date(from);
  if (isPremiumSubscriptionDevTestPricing()) {
    expiresAt.setTime(expiresAt.getTime() + DEV_SUPPORT_PERIOD_HOURS * 60 * 60 * 1000);
  } else {
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
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

export function validateRebindSubscriptionPayment(params: {
  productType: string | null | undefined;
  userId: string | null | undefined;
  kind: string | null | undefined;
  amountValue: string;
  currency: string;
  amountsEqual: (a: string, b: string) => boolean;
}): { valid: true } | { valid: false; reason: string } {
  const { productType, userId, kind, amountValue, currency, amountsEqual } = params;

  if (productType !== PREMIUM_SUBSCRIPTION_PRODUCT_TYPE) {
    return { valid: false, reason: 'productType' };
  }
  if (!userId) {
    return { valid: false, reason: 'missing userId metadata' };
  }
  if (kind !== 'rebind') {
    return { valid: false, reason: 'kind metadata' };
  }

  const expectedAmount = getRebindAmountRub().toFixed(2);
  if (!amountsEqual(amountValue, expectedAmount) || currency.trim().toUpperCase() !== 'RUB') {
    return { valid: false, reason: 'amount or currency' };
  }

  return { valid: true };
}

const SUBSCRIPTION_PAYMENT_STATUSES = [
  'pending',
  'waiting_for_capture',
  'succeeded',
  'canceled',
  'failed',
] as const;

export type SubscriptionPaymentStatus = (typeof SUBSCRIPTION_PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_PAYMENT_KINDS = [
  'initial',
  'renewal',
  'upgrade',
  'rebind',
  'plan_change',
] as const;

export type SubscriptionPaymentKind = (typeof SUBSCRIPTION_PAYMENT_KINDS)[number];

export interface SubscriptionPaymentRow {
  id: string;
  user_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: SubscriptionPaymentStatus;
  amount: string;
  currency: string;
  plan: string;
  kind?: SubscriptionPaymentKind;
  raw_last_event?: unknown;
}

const OPEN_SUBSCRIPTION_PAYMENT_STATUSES = ['pending', 'waiting_for_capture'] as const;

export async function findOpenSubscriptionPayment(userId: string): Promise<{ id: string } | null> {
  try {
    const result = await query<{ id: string }>(
      `SELECT id
       FROM subscription_payments
       WHERE user_id = $1::uuid
         AND status = ANY($2::text[])
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, OPEN_SUBSCRIPTION_PAYMENT_STATUSES]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

export async function findOpenRenewalPayment(userId: string): Promise<{ id: string } | null> {
  try {
    const result = await query<{ id: string }>(
      `SELECT id
       FROM subscription_payments
       WHERE user_id = $1::uuid
         AND kind = 'renewal'
         AND status = ANY($2::text[])
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, OPEN_SUBSCRIPTION_PAYMENT_STATUSES]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

export type ClaimSubscriptionPaymentCanceledResult = 'claimed' | 'already_terminal' | 'not_found';

/** Atomically mark renewal/checkout payment canceled. Returns `claimed` only on first transition. */
export async function claimSubscriptionPaymentCanceled(
  providerPaymentId: string,
  userId: string
): Promise<ClaimSubscriptionPaymentCanceledResult> {
  try {
    const claimed = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
       WHERE provider = 'yookassa'
         AND provider_payment_id = $1
         AND user_id = $2::uuid
         AND status NOT IN ('canceled', 'succeeded')
       RETURNING id`,
      [providerPaymentId, userId]
    );
    if (claimed.rows[0]?.id) return 'claimed';

    const existing = await getSubscriptionPaymentForUser(providerPaymentId, userId);
    if (!existing) return 'not_found';
    return 'already_terminal';
  } catch (error) {
    if (isMissingRelationError(error)) return 'not_found';
    throw error;
  }
}

export function resolveRenewalChargePlanSlug(
  subscription: Pick<Subscription, 'plan' | 'scheduledPlan'>
): SubscriptionPlanSlug {
  const scheduled = normalizeSubscriptionPlanSlug(subscription.scheduledPlan);
  if (scheduled) return scheduled;
  return normalizeSubscriptionPlanSlug(subscription.plan) ?? DEFAULT_SUBSCRIPTION_PLAN;
}

/**
 * Removes an orphan pending renewal row (PR-7.1) or marks it canceled when a provider id exists.
 */
export async function cleanupPendingRenewalPayment(
  subscriptionPaymentId: string,
  userId: string
): Promise<void> {
  try {
    const deleted = await query<{ id: string }>(
      `DELETE FROM subscription_payments
       WHERE id = $1
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND status = 'pending'
         AND provider_payment_id IS NULL
       RETURNING id`,
      [subscriptionPaymentId, userId]
    );
    if (deleted.rows[0]?.id) return;

    await query(
      `UPDATE subscription_payments
       SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND status = 'pending'`,
      [subscriptionPaymentId, userId]
    );
  } catch (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
}

export async function createPendingSubscriptionPayment(
  userId: string,
  planSlug: SubscriptionPlanSlug = DEFAULT_SUBSCRIPTION_PLAN,
  kind: SubscriptionPaymentKind = 'initial'
): Promise<string> {
  const amount = kind === 'rebind' ? getRebindAmountRub() : getPlanAmountRub(planSlug);
  const result = await query<{ id: string }>(
    `INSERT INTO subscription_payments (user_id, provider, status, amount, currency, plan, kind)
     VALUES ($1, 'yookassa', 'pending', $2, 'RUB', $3, $4)
     RETURNING id`,
    [userId, amount, planSlug, kind]
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

export type ClaimSubscriptionPaymentSuccessResult = 'claimed' | 'already_succeeded' | 'not_found';

/**
 * Atomically mark subscription payment succeeded. Returns `claimed` only for the first transition.
 */
export async function claimSubscriptionPaymentSuccess(
  providerPaymentId: string,
  userId: string
): Promise<ClaimSubscriptionPaymentSuccessResult> {
  try {
    const claimed = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET status = 'succeeded', updated_at = CURRENT_TIMESTAMP
       WHERE provider = 'yookassa'
         AND provider_payment_id = $1
         AND user_id = $2::uuid
         AND status <> 'succeeded'
       RETURNING id`,
      [providerPaymentId, userId]
    );
    if (claimed.rows[0]?.id) return 'claimed';

    const existing = await getSubscriptionPaymentForUser(providerPaymentId, userId);
    if (!existing) return 'not_found';
    if (existing.status === 'succeeded') return 'already_succeeded';

    await updateSubscriptionPaymentStatus(providerPaymentId, 'succeeded');
    return 'claimed';
  } catch (error) {
    if (isMissingRelationError(error)) return 'not_found';
    throw error;
  }
}

export async function isSubscriptionFulfilledForProviderPayment(
  userId: string,
  providerPaymentId: string
): Promise<boolean> {
  const payment = await getSubscriptionPaymentForUser(providerPaymentId, userId);
  if (!payment || payment.status !== 'succeeded') return false;

  const r = await query<{ provider_subscription_id: string | null }>(
    `SELECT provider_subscription_id
     FROM subscriptions
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.provider_subscription_id === providerPaymentId;
}

export async function getSubscriptionPaymentByProviderId(
  providerPaymentId: string
): Promise<SubscriptionPaymentRow | null> {
  try {
    const r = await query<SubscriptionPaymentRow>(
      `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount, currency, plan, kind, raw_last_event
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
      `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount, currency, plan, kind
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
      row.status === 'trial' ||
      row.status === 'past_due' ||
      row.status === 'cancel_at_period_end';

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
             scheduled_plan = CASE WHEN $5 THEN NULL ELSE scheduled_plan END,
             renewal_attempt_count = CASE WHEN $5 THEN 0 ELSE renewal_attempt_count END,
             first_failed_at = CASE WHEN $5 THEN NULL ELSE first_failed_at END,
             next_charge_at = CASE WHEN $5 THEN NULL ELSE next_charge_at END,
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
