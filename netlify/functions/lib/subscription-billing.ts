/**
 * Premium subscription billing (platform YooKassa) — isolated from album purchases.
 */

import {
  comparePlanTiers,
  DEFAULT_SUBSCRIPTION_PLAN,
  formatPlanAmountValue,
  getPlanAmountRub,
  getPlanPriceCurrencyCode,
  getPlanSlotsLimit,
  getPlanSupportPeriodMs,
  isSubscriptionPlanCurrency,
  isSubscriptionPlanSlug,
  normalizeSubscriptionPlanSlug,
  PLAN_TIER_ORDER,
  SUBSCRIPTION_PLAN_CATALOG,
  SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE,
  SUBSCRIPTION_PLAN_PRICE_RUB,
  SUBSCRIPTION_PLAN_SLUGS,
  SUBSCRIPTION_SLOTS_LIMIT_FALLBACK,
  type SubscriptionPlanCatalogEntry,
  type SubscriptionPlanSlug,
} from '../../../src/shared/lib/payment/subscriptionPlanCatalog';

import { isDevPaymentModeEnabled } from './dev-payment-mode';
import { isMissingRelationError, query } from './db';
import type { Subscription } from './subscriptions';
import { mapSubscriptionRow, type SubscriptionRow } from './subscriptions';

export {
  comparePlanTiers,
  DEFAULT_SUBSCRIPTION_PLAN,
  formatPlanAmountValue,
  getPlanAmountRub,
  getPlanPriceCurrencyCode,
  getPlanSlotsLimit,
  getPlanSupportPeriodMs,
  isSubscriptionPlanSlug,
  normalizeSubscriptionPlanSlug,
  PLAN_TIER_ORDER,
  SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE,
  SUBSCRIPTION_PLAN_PRICE_RUB,
  SUBSCRIPTION_PLAN_SLUGS,
  SUBSCRIPTION_SLOTS_LIMIT_FALLBACK,
  type SubscriptionPlanSlug,
};

export const PREMIUM_SUBSCRIPTION_PRODUCT_TYPE = 'premium_subscription';

/** Short support period for DEV_PAYMENT_MODE QA cycles (checkout, renewal, upgrade, resubscribe). */
export const DEV_SUPPORT_PERIOD_MS = 5 * 60 * 1000;

/** @deprecated Alias for DEV_SUPPORT_PERIOD_MS — use resolveSupportPeriodMs(planSlug) in new code. */
export const SUPPORT_PERIOD_MS = DEV_SUPPORT_PERIOD_MS;

const PLAN_DESCRIPTIONS: Record<SubscriptionPlanSlug, string> = {
  explorer: 'Explorer Support',
  collector: 'Collector Support',
  archivist: 'Archivist Support',
};

export interface SubscriptionPlanDefinition extends SubscriptionPlanCatalogEntry {
  description: string;
}

/** Server view: shared catalog + YooKassa descriptions. */
export const PLAN_CATALOG: Record<SubscriptionPlanSlug, SubscriptionPlanDefinition> = {
  explorer: { ...SUBSCRIPTION_PLAN_CATALOG.explorer, description: PLAN_DESCRIPTIONS.explorer },
  collector: { ...SUBSCRIPTION_PLAN_CATALOG.collector, description: PLAN_DESCRIPTIONS.collector },
  archivist: { ...SUBSCRIPTION_PLAN_CATALOG.archivist, description: PLAN_DESCRIPTIONS.archivist },
};

export function getPlanDefinition(planSlug: SubscriptionPlanSlug): SubscriptionPlanDefinition {
  return PLAN_CATALOG[planSlug];
}

/** Minimal verification charge for payment-method rebind (PR-9). */
export function getRebindAmountRub(): number {
  return SUBSCRIPTION_PLAN_PRICE_RUB;
}

export const REBIND_PAYMENT_DESCRIPTION = 'Payment method verification';

/** True when checkout/renewal should use the short QA support window instead of catalog durationDays. */
export function usesDevSupportPeriod(): boolean {
  return isDevPaymentModeEnabled();
}

export function resolveSupportPeriodMs(planSlug: SubscriptionPlanSlug): number {
  if (usesDevSupportPeriod()) {
    return DEV_SUPPORT_PERIOD_MS;
  }
  return getPlanSupportPeriodMs(planSlug);
}

export function computeSupportExpiresAt(
  planSlug: SubscriptionPlanSlug,
  from: Date = new Date()
): Date {
  const expiresAt = new Date(from);
  expiresAt.setTime(expiresAt.getTime() + resolveSupportPeriodMs(planSlug));
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
  if (!amountsEqual(amountValue, expectedAmount) || !isSubscriptionPlanCurrency(currency)) {
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
  if (!amountsEqual(amountValue, expectedAmount) || !isSubscriptionPlanCurrency(currency)) {
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

const CHECKOUT_SUBSCRIPTION_PAYMENT_KINDS = ['initial', 'upgrade', 'rebind'] as const;

/** Cancel checkout rows that never reached YooKassa (failed bootstrap / closed tab before attach). */
export async function releaseAbandonedCheckoutPayments(userId: string): Promise<number> {
  try {
    const released = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1::uuid
         AND status = 'pending'
         AND provider_payment_id IS NULL
         AND kind = ANY($2::text[])
       RETURNING id`,
      [userId, CHECKOUT_SUBSCRIPTION_PAYMENT_KINDS]
    );
    return released.rowCount ?? 0;
  } catch (error) {
    if (isMissingRelationError(error)) return 0;
    throw error;
  }
}

export async function findOpenCheckoutSubscriptionPayment(
  userId: string
): Promise<{ id: string } | null> {
  try {
    const result = await query<{ id: string }>(
      `SELECT id
       FROM subscription_payments
       WHERE user_id = $1::uuid
         AND kind = ANY($3::text[])
         AND status = ANY($2::text[])
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, OPEN_SUBSCRIPTION_PAYMENT_STATUSES, CHECKOUT_SUBSCRIPTION_PAYMENT_KINDS]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

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
 * Removes an orphan pending renewal row (PR-7.1).
 * PR-10.1: never mutates rows that already have provider_payment_id (POST_PROVIDER safety).
 */
/**
 * Cancels orphan pending renewal rows for a user (no provider_payment_id yet).
 * Safe on unlink: YooKassa was never contacted for these rows.
 */
export async function cancelOrphanPendingRenewalPayments(userId: string): Promise<void> {
  try {
    await query(
      `UPDATE subscription_payments
       SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1::uuid
         AND kind = 'renewal'
         AND status IN ('pending', 'waiting_for_capture')
         AND provider_payment_id IS NULL`,
      [userId]
    );
  } catch (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
}

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
         AND status = 'pending'
         AND provider_payment_id IS NULL`,
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
     VALUES ($1, 'yookassa', 'pending', $2, $5, $3, $4)
     RETURNING id`,
    [userId, amount, planSlug, kind, SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE]
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

export type ClaimSubscriptionPaymentSuccessResult =
  | 'claimed'
  | 'already_succeeded'
  | 'not_found'
  | 'rejected_terminal';

/** Statuses eligible for a first-time transition to succeeded (PR-10.2). */
export const CLAIMABLE_SUBSCRIPTION_PAYMENT_SUCCESS_STATUSES = [
  'pending',
  'waiting_for_capture',
] as const;

/**
 * Atomically mark subscription payment succeeded. Returns `claimed` only for the first transition
 * from pending/waiting_for_capture. Terminal states (canceled, failed) cannot be resurrected.
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
         AND status = ANY($3::text[])
       RETURNING id`,
      [providerPaymentId, userId, CLAIMABLE_SUBSCRIPTION_PAYMENT_SUCCESS_STATUSES]
    );
    if (claimed.rows[0]?.id) return 'claimed';

    const existing = await getSubscriptionPaymentForUser(providerPaymentId, userId);
    if (!existing) return 'not_found';
    if (existing.status === 'succeeded') return 'already_succeeded';
    return 'rejected_terminal';
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
     LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.provider_subscription_id === providerPaymentId;
}

async function loadSubscriptionByUserAndProviderPaymentId(
  userId: string,
  providerPaymentId: string
): Promise<Subscription | null> {
  const r = await query<SubscriptionRow>(
    `SELECT
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1::uuid
       AND provider_subscription_id = $2
     LIMIT 1`,
    [userId, providerPaymentId]
  );
  const row = r.rows[0];
  return row ? mapSubscriptionRow(row) : null;
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
     LIMIT 1`,
    [userId]
  );

  const now = new Date();
  const expiresAt = computeSupportExpiresAt(planSlug, now);
  const providerId = providerPaymentId?.trim() || null;

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
           AND ($4::text IS NULL OR provider_subscription_id IS DISTINCT FROM $4::text)
         RETURNING
           id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
           started_at, expires_at, created_at, updated_at`,
        [row.id, planSlug, slotsLimit, providerId, canReuse, now, expiresAt]
      );
      const next = updated.rows[0];
      if (next) return mapSubscriptionRow(next);

      if (providerId) {
        const reloaded = await loadSubscriptionByUserAndProviderPaymentId(userId, providerId);
        if (reloaded) return reloaded;
      }

      throw new Error('Failed to update subscription');
    }
  }

  const inserted = await query<SubscriptionRow>(
    `INSERT INTO subscriptions (
       user_id, status, plan, slots_limit, provider, provider_subscription_id, started_at, expires_at
     ) VALUES ($1::uuid, 'active', $2, $3, 'yookassa', $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       status = 'active',
       plan = EXCLUDED.plan,
       slots_limit = EXCLUDED.slots_limit,
       provider = 'yookassa',
       provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id),
       started_at = EXCLUDED.started_at,
       expires_at = EXCLUDED.expires_at,
       scheduled_plan = NULL,
       renewal_attempt_count = 0,
       first_failed_at = NULL,
       next_charge_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE EXCLUDED.provider_subscription_id IS NULL
        OR subscriptions.provider_subscription_id IS DISTINCT FROM EXCLUDED.provider_subscription_id
     RETURNING
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, created_at, updated_at`,
    [userId, planSlug, slotsLimit, providerId, now, expiresAt]
  );

  const created = inserted.rows[0];
  if (created) return mapSubscriptionRow(created);

  if (providerId) {
    const reloaded = await loadSubscriptionByUserAndProviderPaymentId(userId, providerId);
    if (reloaded) return reloaded;
  }

  throw new Error('Failed to create subscription');
}
