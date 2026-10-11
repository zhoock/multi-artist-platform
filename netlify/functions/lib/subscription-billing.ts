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

import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { isMissingRelationError, query, withClient, withTransaction } from './db';
import { classifyRenewalAttemptInsertUniqueViolation } from './subscription-renewal-db-integrity';
import {
  embedRenewalSubscriptionPaymentIdInPayload,
  hashRenewalRequestPayload,
  readRenewalYookassaCreatePayload,
  RENEWAL_YOOKASSA_CREATE_PAYLOAD_RAW_KEY,
  verifyRenewalRequestPayloadHash,
  type RenewalYookassaCreatePayload,
} from './subscription-renewal-post-payload';
import { resolveBillingOriginForNewSubscription } from './subscription-billing-origin';
import type { Subscription } from './subscriptions';
import { mapSubscriptionRow, type SubscriptionRow } from './subscriptions';

export {
  comparePlanTiers,
  DEFAULT_SUBSCRIPTION_PLAN,
  formatPlanAmountValue,
  getPlanAmountRub,
  getPlanPriceCurrencyCode,
  getPlanSlotsLimit,
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

/**
 * Support period for every initial, renewed, and upgraded subscription.
 * TEMP (site testing): 5 minutes. Set to 30 * 24 * 60 * 60 * 1000 for launch.
 */
export const SUPPORT_PERIOD_MS = 5 * 60 * 1000;

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

export function computeSupportExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + SUPPORT_PERIOD_MS);
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
  created_at?: Date;
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

export interface UnresolvedRenewalAttemptRow {
  id: string;
  idempotence_key: string | null;
  request_payload_hash: string | null;
  raw_last_event: unknown;
}

/** Open renewal attempt for a subscription whose outcome is not yet terminal (PR-3a). */
export async function findUnresolvedRenewalAttemptForSubscription(
  subscriptionId: string
): Promise<UnresolvedRenewalAttemptRow | null> {
  try {
    const result = await query<UnresolvedRenewalAttemptRow>(
      `SELECT sp.id, sp.idempotence_key, sp.request_payload_hash, sp.raw_last_event
       FROM subscription_payments sp
       WHERE sp.kind = 'renewal'
         AND sp.status = ANY($2::text[])
         AND sp.subscription_id = $1::uuid
       ORDER BY sp.created_at DESC
       LIMIT 1`,
      [subscriptionId, OPEN_SUBSCRIPTION_PAYMENT_STATUSES]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

export function resolveRenewalAttemptNo(
  subscription: Pick<Subscription, 'status' | 'renewalAttemptCount'>
): number {
  if (subscription.status === 'past_due') {
    return (subscription.renewalAttemptCount ?? 0) + 1;
  }
  return 1;
}

export interface CreateRenewalAttemptRowParams {
  userId: string;
  subscriptionId: string;
  periodEnd: Date;
  attemptNo: number;
  planSlug: SubscriptionPlanSlug;
  yookassaCreatePayload: RenewalYookassaCreatePayload;
}

/** Creates a renewal attempt row with frozen YooKassa POST identity (PR-3a). */
export async function createRenewalAttemptRow(
  params: CreateRenewalAttemptRowParams
): Promise<string> {
  const subscriptionPaymentId = randomUUID();
  const yookassaCreatePayload = embedRenewalSubscriptionPaymentIdInPayload(
    params.yookassaCreatePayload,
    subscriptionPaymentId
  );
  const requestPayloadHash = hashRenewalRequestPayload(yookassaCreatePayload);
  const rawLastEvent = {
    [RENEWAL_YOOKASSA_CREATE_PAYLOAD_RAW_KEY]: yookassaCreatePayload,
  };
  const amount = getPlanAmountRub(params.planSlug);
  const idempotenceKey = `renewal-${subscriptionPaymentId}`;

  try {
    return await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO subscription_payments (
         id, user_id, provider, status, amount, currency, plan, kind,
         subscription_id, period_end, attempt_no, request_payload_hash,
         dispatch_phase, idempotence_key, raw_last_event
       )
       VALUES (
         $1::uuid, $2::uuid, 'yookassa', 'pending', $3, $4, $5, 'renewal',
         $6::uuid, $7, $8, $9, 'created', $10, $11::jsonb
       )
       RETURNING id`,
        [
          subscriptionPaymentId,
          params.userId,
          amount,
          SUBSCRIPTION_PLAN_PRICE_CURRENCY_CODE,
          params.planSlug,
          params.subscriptionId,
          params.periodEnd,
          params.attemptNo,
          requestPayloadHash,
          idempotenceKey,
          JSON.stringify(rawLastEvent),
        ]
      );
      const id = inserted.rows[0]?.id;
      if (!id) {
        throw new Error('Failed to create renewal attempt row');
      }
      return id;
    });
  } catch (error) {
    const conflict = classifyRenewalAttemptInsertUniqueViolation(error);
    if (conflict) {
      throw Object.assign(new Error('renewal_attempt_create_conflict'), {
        renewalAttemptCreateConflict: conflict,
      });
    }
    throw error;
  }
}

export type RenewalAttemptPostIdentityResult =
  | { ok: true; idempotenceKey: string; payload: RenewalYookassaCreatePayload }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'missing_idempotence_key'
        | 'missing_payload'
        | 'missing_hash'
        | 'hash_mismatch';
    };

/** Loads stored idempotence key and frozen POST body; verifies hash before any YooKassa POST. */
export async function getRenewalAttemptPostIdentity(
  subscriptionPaymentId: string,
  userId: string
): Promise<RenewalAttemptPostIdentityResult> {
  try {
    const result = await query<{
      idempotence_key: string | null;
      request_payload_hash: string | null;
      raw_last_event: unknown;
    }>(
      `SELECT idempotence_key, request_payload_hash, raw_last_event
       FROM subscription_payments
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
       LIMIT 1`,
      [subscriptionPaymentId, userId]
    );
    const row = result.rows[0];
    if (!row) {
      return { ok: false, reason: 'not_found' };
    }

    const idempotenceKey = row.idempotence_key?.trim();
    if (!idempotenceKey) {
      return { ok: false, reason: 'missing_idempotence_key' };
    }

    const payload = readRenewalYookassaCreatePayload(row.raw_last_event);
    if (!payload) {
      return { ok: false, reason: 'missing_payload' };
    }

    const hashCheck = verifyRenewalRequestPayloadHash(payload, row.request_payload_hash);
    if (hashCheck === 'missing_hash') {
      return { ok: false, reason: 'missing_hash' };
    }
    if (hashCheck === 'mismatch') {
      return { ok: false, reason: 'hash_mismatch' };
    }

    return { ok: true, idempotenceKey, payload };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return { ok: false, reason: 'not_found' };
    }
    throw error;
  }
}

export interface RenewalAttemptDispatchState {
  id: string;
  user_id: string;
  subscription_id: string | null;
  provider_payment_id: string | null;
  first_post_at: Date | null;
  status: string;
  dispatch_phase: string | null;
}

export type RenewalAttemptReconcileRow = RenewalAttemptDispatchState;

export async function getRenewalAttemptDispatchState(
  subscriptionPaymentId: string,
  userId: string
): Promise<RenewalAttemptDispatchState | null> {
  try {
    const result = await query<RenewalAttemptDispatchState>(
      `SELECT id, user_id, subscription_id, provider_payment_id, first_post_at, status, dispatch_phase
       FROM subscription_payments
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
       LIMIT 1`,
      [subscriptionPaymentId, userId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

/** Open renewal rows eligible for PR-3b reconciliation (includes needs_review — handled as no-op POST). */
export async function listRenewalAttemptsForReconciliation(
  limit = 100
): Promise<RenewalAttemptReconcileRow[]> {
  try {
    const result = await query<RenewalAttemptReconcileRow>(
      `SELECT id, user_id, subscription_id, provider_payment_id, first_post_at, status, dispatch_phase
       FROM subscription_payments
       WHERE kind = 'renewal'
         AND status IN ('pending', 'waiting_for_capture')
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

export async function markRenewalAttemptNeedsReview(
  subscriptionPaymentId: string,
  userId: string
): Promise<void> {
  try {
    await query(
      `UPDATE subscription_payments
       SET dispatch_phase = 'needs_review',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'`,
      [subscriptionPaymentId, userId]
    );
  } catch (error) {
    if (isMissingRelationError(error)) return;
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
 * Cancels legacy orphan pending renewal rows (no subscription link, no provider_payment_id yet).
 * PR-2: skips rows with first_post_at set (YooKassa POST may have started).
 * PR-4+: skips protocol attempts linked via subscription_id.
 */
export async function cancelOrphanPendingRenewalPayments(userId: string): Promise<void> {
  try {
    await query(
      `UPDATE subscription_payments
       SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1::uuid
         AND kind = 'renewal'
         AND subscription_id IS NULL
         AND status IN ('pending', 'waiting_for_capture')
         AND provider_payment_id IS NULL
         AND first_post_at IS NULL`,
      [userId]
    );
  } catch (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
}

export async function cleanupPendingRenewalPaymentWithClient(
  client: PoolClient,
  subscriptionPaymentId: string,
  userId: string
): Promise<void> {
  try {
    const deleted = await client.query<{ id: string }>(
      `DELETE FROM subscription_payments
       WHERE id = $1
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND status = 'pending'
         AND provider_payment_id IS NULL
         AND first_post_at IS NULL
       RETURNING id`,
      [subscriptionPaymentId, userId]
    );
    if (deleted.rows[0]?.id) return;

    await client.query(
      `UPDATE subscription_payments
       SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND status = 'pending'
         AND provider_payment_id IS NULL
         AND first_post_at IS NULL`,
      [subscriptionPaymentId, userId]
    );
  } catch (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
}

export type ClaimRenewalFirstPostAtResult = 'claimed' | 'already_started' | 'not_found';

/** Marks the first YooKassa POST intent for a renewal row (PR-2). */
export async function claimRenewalFirstPostAt(
  subscriptionPaymentId: string,
  userId: string,
  firstPostAt: Date = new Date()
): Promise<ClaimRenewalFirstPostAtResult> {
  try {
    const claimed = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET first_post_at = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND first_post_at IS NULL
       RETURNING id`,
      [subscriptionPaymentId, userId, firstPostAt]
    );
    if (claimed.rows[0]?.id) return 'claimed';

    const existing = await query<{ first_post_at: Date | null }>(
      `SELECT first_post_at
       FROM subscription_payments
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
       LIMIT 1`,
      [subscriptionPaymentId, userId]
    );
    const row = existing.rows[0];
    if (!row) return 'not_found';
    if (row.first_post_at != null) return 'already_started';
    return 'not_found';
  } catch (error) {
    if (isMissingRelationError(error)) return 'not_found';
    throw error;
  }
}

/** True when YooKassa POST may have been sent but provider id is not stored yet (PR-2). */
export async function hasUnresolvedRenewalPostStartedWithClient(
  client: PoolClient,
  subscriptionPaymentId: string,
  userId: string
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM subscription_payments
     WHERE id = $1::uuid
       AND user_id = $2::uuid
       AND kind = 'renewal'
       AND first_post_at IS NOT NULL
       AND provider_payment_id IS NULL
     LIMIT 1`,
    [subscriptionPaymentId, userId]
  );
  return Boolean(result.rows[0]?.id);
}

export async function cleanupPendingRenewalPayment(
  subscriptionPaymentId: string,
  userId: string
): Promise<void> {
  await withClient((client) =>
    cleanupPendingRenewalPaymentWithClient(client, subscriptionPaymentId, userId)
  );
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

export async function markSubscriptionRebindResumeAutoRenewIntent(
  subscriptionPaymentId: string
): Promise<void> {
  await query(
    `UPDATE subscription_payments
     SET raw_last_event = COALESCE(raw_last_event, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [subscriptionPaymentId, JSON.stringify({ resumeAutoRenew: true })]
  );
}

export const REBIND_OUTCOME_STALE_AFTER_UNLINK = 'stale_after_unlink';
export const REBIND_OUTCOME_APPLIED = 'applied';

export function readPaymentMethodEpoch(rawLastEvent: unknown): number {
  if (rawLastEvent == null || typeof rawLastEvent !== 'object') return 0;
  const epoch = (rawLastEvent as Record<string, unknown>).paymentMethodEpoch;
  if (typeof epoch === 'number' && Number.isFinite(epoch)) return epoch;
  if (typeof epoch === 'string') {
    const parsed = Number(epoch);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function readRebindOutcome(rawLastEvent: unknown): string | null {
  if (rawLastEvent == null || typeof rawLastEvent !== 'object') return null;
  const outcome = (rawLastEvent as Record<string, unknown>).rebindOutcome;
  return typeof outcome === 'string' && outcome.trim() ? outcome.trim() : null;
}

/** Snapshot current subscription epoch into the rebind payment row at POST. */
export async function markSubscriptionRebindPaymentMethodEpoch(
  subscriptionPaymentId: string,
  userId: string
): Promise<void> {
  const epochResult = await query<{ payment_method_epoch: number }>(
    `SELECT payment_method_epoch
     FROM subscriptions
     WHERE user_id = $1::uuid
     LIMIT 1`,
    [userId]
  );
  const epoch = epochResult.rows[0]?.payment_method_epoch ?? 0;
  await query(
    `UPDATE subscription_payments
     SET raw_last_event = COALESCE(raw_last_event, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [subscriptionPaymentId, JSON.stringify({ paymentMethodEpoch: epoch })]
  );
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

export type LinkProviderPaymentIdResult =
  | 'attached'
  | 'already_linked'
  | 'provider_id_claimed_by_other_row'
  | 'row_provider_mismatch'
  | 'not_found';

/** PR-4 — link YooKassa payment id without overwriting an existing different provider id. */
export async function linkProviderPaymentIdToSubscriptionPaymentRow(params: {
  subscriptionPaymentId: string;
  userId: string;
  providerPaymentId: string;
}): Promise<LinkProviderPaymentIdResult> {
  const subscriptionPaymentId = params.subscriptionPaymentId.trim();
  const userId = params.userId.trim();
  const providerPaymentId = params.providerPaymentId.trim();

  try {
    const other = await query<{ id: string }>(
      `SELECT id FROM subscription_payments
       WHERE provider = 'yookassa'
         AND provider_payment_id = $1
         AND id <> $2::uuid
       LIMIT 1`,
      [providerPaymentId, subscriptionPaymentId]
    );
    if (other.rows[0]?.id) {
      return 'provider_id_claimed_by_other_row';
    }

    const existing = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, userId);
    if (!existing) {
      return 'not_found';
    }
    const prior = existing.provider_payment_id?.trim();
    if (prior && prior !== providerPaymentId) {
      return 'row_provider_mismatch';
    }
    if (prior === providerPaymentId) {
      return 'already_linked';
    }

    const updated = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET provider_payment_id = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND provider_payment_id IS NULL
       RETURNING id`,
      [subscriptionPaymentId, userId, providerPaymentId]
    );

    if (updated.rows[0]?.id) {
      return 'attached';
    }

    return 'row_provider_mismatch';
  } catch (error) {
    if (isMissingRelationError(error)) return 'not_found';
    throw error;
  }
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
       started_at, expires_at, billing_origin, created_at, updated_at
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
      `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount, currency, plan, kind, raw_last_event, created_at
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
      `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount, currency, plan, kind, raw_last_event, created_at
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
       started_at, expires_at, billing_origin, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1::uuid
     LIMIT 1`,
    [userId]
  );

  const now = new Date();
  const expiresAt = computeSupportExpiresAt(now);
  const providerId = providerPaymentId?.trim() || null;
  const billingOrigin = resolveBillingOriginForNewSubscription();

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
             billing_origin = CASE WHEN $5 THEN $8 ELSE billing_origin END,
             next_charge_at = CASE
               WHEN $5 THEN NULL::timestamptz
               ELSE $7::timestamptz
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND ($4::text IS NULL OR provider_subscription_id IS DISTINCT FROM $4::text)
         RETURNING
           id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
           started_at, expires_at, billing_origin, created_at, updated_at`,
        [row.id, planSlug, slotsLimit, providerId, canReuse, now, expiresAt, billingOrigin]
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
       user_id, status, plan, slots_limit, provider, provider_subscription_id, started_at, expires_at, billing_origin
     ) VALUES ($1::uuid, 'active', $2, $3, 'yookassa', $4, $5, $6, $7)
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
       started_at, expires_at, billing_origin, created_at, updated_at`,
    [userId, planSlug, slotsLimit, providerId, now, expiresAt, billingOrigin]
  );

  const created = inserted.rows[0];
  if (created) return mapSubscriptionRow(created);

  if (providerId) {
    const reloaded = await loadSubscriptionByUserAndProviderPaymentId(userId, providerId);
    if (reloaded) return reloaded;
  }

  throw new Error('Failed to create subscription');
}
