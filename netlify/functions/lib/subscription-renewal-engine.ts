/**
 * Premium subscription renewal engine (PR-7): charge creation + period-end expiry.
 */

import { attachDevSucceededSubscriptionCheckout } from './complete-dev-payment';
import { isDevPaymentModeEnabled } from './dev-payment-mode';
import { query } from './db';
import { sqlBillingOriginFilterForRuntime } from './subscription-billing-origin';
import {
  attachProviderPaymentId,
  cancelOrphanPendingRenewalPayments,
  cleanupPendingRenewalPayment,
  createPendingSubscriptionPayment,
  DEV_SUPPORT_PERIOD_MS,
  getPlanAmountRub,
  getPlanDefinition,
  getPlanPriceCurrencyCode,
  resolveRenewalChargePlanSlug,
} from './subscription-billing';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import {
  mapDevSubscriptionPaymentToProviderPayment,
  type SubscriptionProviderPayment,
  type SubscriptionProviderPaymentStatus,
} from './subscription-provider-payment';
import { processSubscriptionProviderPayment } from './subscription-payment-router';
import { applySubscriptionPeriodEnded } from './subscription-renewal-fulfillment';
import {
  extendSubscriptionObservability,
  logSubscriptionEvent,
  SUBSCRIPTION_LOG_EVENTS,
} from './subscription-observability';
import { buildRenewalSubscriptionPaymentPayload } from './subscription-yookassa';
import { mapSubscriptionRow, type SubscriptionRow } from './subscriptions';
import { getYooKassaEnvCredentials } from './yookassa-env';

const PRODUCTION_RENEWAL_CLAIM_LOCK_MS = 30 * 60 * 1000;

/** Dev QA periods are 5 min — a 30 min claim lock blocks retries for most of a test cycle. */
export function resolveRenewalClaimLockMs(now: Date = new Date()): number {
  if (isDevPaymentModeEnabled()) {
    return Math.max(DEV_SUPPORT_PERIOD_MS * 2, 2 * 60 * 1000);
  }
  void now;
  return PRODUCTION_RENEWAL_CLAIM_LOCK_MS;
}

const CHARGE_DUE_ELIGIBILITY = `
       status IN ('active', 'past_due')
       AND payment_method_id IS NOT NULL
       AND (
         (next_charge_at IS NOT NULL AND next_charge_at <= $1)
         OR (next_charge_at IS NULL AND expires_at IS NOT NULL AND expires_at <= $1)
       )`;

const CHARGE_READY_PENDING_RENEWAL_GUARD = `
  AND NOT EXISTS (
    SELECT 1
    FROM subscription_payments sp
    WHERE sp.user_id = subscriptions.user_id
      AND sp.kind = 'renewal'
      AND sp.status IN ('pending', 'waiting_for_capture')
  )`;

interface YooKassaCreateResponse {
  id: string;
  status: string;
}

export interface RenewalChargeClaimResult {
  row: SubscriptionRow;
  previousNextChargeAt: Date;
}

export interface RenewalCycleResult {
  chargesAttempted: number;
  chargesSkipped: number;
  periodsEnded: number;
  errors: number;
}

function subscriptionSelectFields(alias = 's'): string {
  return `
    ${alias}.id, ${alias}.user_id, ${alias}.status, ${alias}.plan, ${alias}.slots_limit,
    ${alias}.provider, ${alias}.provider_subscription_id, ${alias}.started_at, ${alias}.expires_at,
    ${alias}.payment_method_id, ${alias}.next_charge_at, ${alias}.renewal_attempt_count,
    ${alias}.scheduled_plan, ${alias}.first_failed_at, ${alias}.billing_origin,
    ${alias}.created_at, ${alias}.updated_at`;
}

export async function claimSubscriptionForRenewalCharge(
  subscriptionId: string,
  now: Date = new Date()
): Promise<RenewalChargeClaimResult | null> {
  const lockUntil = new Date(now.getTime() + resolveRenewalClaimLockMs(now));

  const claimed = await query<SubscriptionRow & { previous_next_charge_at: Date }>(
    `WITH candidate AS (
       SELECT id, COALESCE(next_charge_at, expires_at) AS previous_next_charge_at
       FROM subscriptions
       WHERE id = $1::uuid
         AND status IN ('active', 'past_due')
         AND payment_method_id IS NOT NULL
         AND (
           (next_charge_at IS NOT NULL AND next_charge_at <= $2)
           OR (next_charge_at IS NULL AND expires_at IS NOT NULL AND expires_at <= $2)
         )
         ${sqlBillingOriginFilterForRuntime()}
         ${CHARGE_READY_PENDING_RENEWAL_GUARD}
     )
     UPDATE subscriptions s
     SET next_charge_at = $3,
         updated_at = CURRENT_TIMESTAMP
     FROM candidate c
     WHERE s.id = c.id
     RETURNING ${subscriptionSelectFields('s')}, c.previous_next_charge_at`,
    [subscriptionId, now, lockUntil]
  );

  const row = claimed.rows[0];
  if (!row) return null;

  const { previous_next_charge_at, ...subscriptionRow } = row;
  return {
    row: subscriptionRow,
    previousNextChargeAt: previous_next_charge_at,
  };
}

/** Clears orphan pending renewal rows that block scheduler claim (PR-7.1 / dev sidecar races). */
export async function reconcileRenewalClaimBlockers(subscriptionId: string): Promise<void> {
  const owner = await query<{ user_id: string }>(
    `SELECT user_id FROM subscriptions WHERE id = $1::uuid LIMIT 1`,
    [subscriptionId]
  );
  const userId = owner.rows[0]?.user_id;
  if (!userId) return;
  await cancelOrphanPendingRenewalPayments(userId);
}

/** Charge-due subs regardless of pending renewal guard — used only for orphan cleanup before selection. */
export async function listChargeDueSubscriptionIds(now: Date = new Date()): Promise<string[]> {
  const r = await query<{ id: string }>(
    `SELECT id
     FROM subscriptions
     WHERE ${CHARGE_DUE_ELIGIBILITY}
       ${sqlBillingOriginFilterForRuntime()}
     ORDER BY COALESCE(next_charge_at, expires_at) ASC
     LIMIT 100`,
    [now]
  );
  return r.rows.map((row) => row.id);
}

/** Reconcile orphan pending renewals for charge-due subs before NOT EXISTS pending filters them out. */
export async function reconcileOrphanPendingRenewalsBeforeChargeSelection(
  now: Date = new Date()
): Promise<void> {
  for (const subscriptionId of await listChargeDueSubscriptionIds(now)) {
    await reconcileRenewalClaimBlockers(subscriptionId);
  }
}

/** Restores scheduler eligibility after a failed charge attempt (PR-7.1). */
export async function rollbackRenewalChargeAttempt(params: {
  subscriptionId: string;
  userId: string;
  restoreNextChargeAt: Date;
  subscriptionPaymentId?: string;
}): Promise<void> {
  if (params.subscriptionPaymentId) {
    await cleanupPendingRenewalPayment(params.subscriptionPaymentId, params.userId);
  }

  await query(
    `UPDATE subscriptions
     SET next_charge_at = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND user_id = $3::uuid`,
    [params.subscriptionId, params.restoreNextChargeAt, params.userId]
  );
}

export async function listChargeReadySubscriptionIds(now: Date = new Date()): Promise<string[]> {
  const r = await query<{ id: string }>(
    `SELECT id
     FROM subscriptions
     WHERE ${CHARGE_DUE_ELIGIBILITY}
       ${sqlBillingOriginFilterForRuntime()}
       ${CHARGE_READY_PENDING_RENEWAL_GUARD}
     ORDER BY COALESCE(next_charge_at, expires_at) ASC
     LIMIT 100`,
    [now]
  );
  return r.rows.map((row) => row.id);
}

export async function listPeriodEndedSubscriptionIds(
  now: Date = new Date()
): Promise<{ id: string; user_id: string }[]> {
  const r = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id
     FROM subscriptions
     WHERE status = 'cancel_at_period_end'
       AND expires_at IS NOT NULL
       AND expires_at <= $1
       ${sqlBillingOriginFilterForRuntime()}
     ORDER BY expires_at ASC
     LIMIT 100`,
    [now]
  );
  return r.rows;
}

async function getUserEmail(userId: string): Promise<string | null> {
  const r = await query<{ email: string }>(`SELECT email FROM users WHERE id = $1::uuid LIMIT 1`, [
    userId,
  ]);
  return r.rows[0]?.email?.trim() ?? null;
}

async function createYooKassaRenewalPayment(params: {
  subscriptionPaymentId: string;
  userId: string;
  planSlug: string;
  paymentMethodId: string;
  customerEmail: string;
}): Promise<{ paymentId: string; status: string }> {
  const yookassaCreds = getYooKassaEnvCredentials();
  if (!yookassaCreds) {
    throw new Error('YooKassa is not configured');
  }

  const planDefinition = getPlanDefinition(params.planSlug);
  const amountValue = getPlanAmountRub(params.planSlug).toFixed(2);
  const payload = buildRenewalSubscriptionPaymentPayload({
    amountValue,
    description: planDefinition.description,
    userId: params.userId,
    planSlug: params.planSlug,
    customerEmail: params.customerEmail,
    paymentMethodId: params.paymentMethodId,
  });

  const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';
  const authHeader = Buffer.from(`${yookassaCreds.shopId}:${yookassaCreds.secretKey}`).toString(
    'base64'
  );
  const idempotenceKey = `renewal-${params.subscriptionPaymentId}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authHeader}`,
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `YooKassa renewal create failed: ${response.status} ${errorText.slice(0, 200)}`
    );
  }

  const paymentData = (await response.json()) as YooKassaCreateResponse;
  if (!paymentData.id) {
    throw new Error('Invalid YooKassa renewal response');
  }

  return { paymentId: paymentData.id, status: paymentData.status };
}

async function processRenewalProviderPaymentInline(
  userId: string,
  providerPayment: SubscriptionProviderPayment,
  subscriptionPaymentId: string,
  now: Date
): Promise<void> {
  await processSubscriptionProviderPayment(providerPayment, userId, {
    observabilitySource: 'scheduler',
    subscriptionPaymentId,
    now,
  });
}

function isInlineSyncRenewalProviderStatus(
  status: string
): status is SubscriptionProviderPaymentStatus {
  return status === 'succeeded' || status === 'pending' || status === 'canceled';
}

type RenewalChargePhase = 'PRE_PROVIDER' | 'POST_PROVIDER';

function logPostProviderFulfillmentFailure(params: {
  subscriptionId: string;
  userId: string;
  subscriptionPaymentId?: string;
  error: unknown;
}): void {
  logSubscriptionEvent(
    SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
    {
      subscriptionId: params.subscriptionId,
      subscriptionPaymentId: params.subscriptionPaymentId,
      phase: 'POST_PROVIDER',
      error: params.error instanceof Error ? params.error.message : String(params.error),
    },
    'error'
  );
}

export async function attemptRenewalChargeForSubscription(
  subscriptionId: string,
  now: Date = new Date()
): Promise<'attempted' | 'skipped' | 'error'> {
  if (!isSubscriptionAutoRenewEnabled()) return 'skipped';

  extendSubscriptionObservability({
    subscriptionId,
    kind: 'renewal',
    source: 'scheduler',
    correlationId: subscriptionId,
  });

  const claim = await claimSubscriptionForRenewalCharge(subscriptionId, now).then(
    async (firstClaim) => {
      if (firstClaim) return firstClaim;
      await reconcileRenewalClaimBlockers(subscriptionId);
      return claimSubscriptionForRenewalCharge(subscriptionId, now);
    }
  );
  if (!claim) {
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE, {
      subscriptionId,
      outcome: 'skipped',
      reason: 'claim_failed',
    });
    return 'skipped';
  }

  const subscription = mapSubscriptionRow(claim.row);
  extendSubscriptionObservability({ userId: subscription.userId, subscriptionId: subscription.id });

  const paymentMethodId = subscription.paymentMethodId?.trim();
  if (!paymentMethodId) {
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE, {
      subscriptionId,
      outcome: 'skipped',
      reason: 'missing_payment_method',
    });
    return 'skipped';
  }

  const chargePlanSlug = resolveRenewalChargePlanSlug(subscription);
  let subscriptionPaymentId: string | undefined;
  let phase: RenewalChargePhase = 'PRE_PROVIDER';

  const rollbackPreProvider = async () => {
    await rollbackRenewalChargeAttempt({
      subscriptionId: subscription.id,
      userId: subscription.userId,
      restoreNextChargeAt: claim.previousNextChargeAt,
      subscriptionPaymentId,
    });
  };

  try {
    if (!isDevPaymentModeEnabled()) {
      const customerEmail = await getUserEmail(subscription.userId);
      if (!customerEmail) {
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
          { reason: 'missing_user_email' },
          'error'
        );
        await rollbackPreProvider();
        return 'error';
      }
    }

    subscriptionPaymentId = await createPendingSubscriptionPayment(
      subscription.userId,
      chargePlanSlug,
      'renewal'
    );

    if (isDevPaymentModeEnabled()) {
      const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });
      await attachProviderPaymentId(subscriptionPaymentId, paymentId);
      phase = 'POST_PROVIDER';

      const row = await query<{
        id: string;
        user_id: string;
        provider: string;
        provider_payment_id: string | null;
        status: string;
        amount: string;
        currency: string;
        plan: string;
        kind?: string;
      }>(
        `SELECT id, user_id, provider, provider_payment_id, status, amount::text AS amount, currency, plan, kind
         FROM subscription_payments WHERE id = $1`,
        [subscriptionPaymentId]
      );

      const paymentRow = row.rows[0];
      if (!paymentRow?.provider_payment_id) {
        logPostProviderFulfillmentFailure({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          subscriptionPaymentId,
          error: new Error('provider_payment_id missing after attach'),
        });
        return 'error';
      }

      const providerPayment = mapDevSubscriptionPaymentToProviderPayment(
        paymentRow,
        paymentRow.provider_payment_id,
        { devMode: true }
      );
      if (!providerPayment) {
        logPostProviderFulfillmentFailure({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          subscriptionPaymentId,
          error: new Error('Failed to map dev provider payment'),
        });
        return 'error';
      }

      await processRenewalProviderPaymentInline(
        subscription.userId,
        providerPayment,
        subscriptionPaymentId,
        now
      );
      return 'attempted';
    }

    const customerEmail = (await getUserEmail(subscription.userId))!;
    const { paymentId, status } = await createYooKassaRenewalPayment({
      subscriptionPaymentId,
      userId: subscription.userId,
      planSlug: chargePlanSlug,
      paymentMethodId,
      customerEmail,
    });

    await attachProviderPaymentId(subscriptionPaymentId, paymentId);
    phase = 'POST_PROVIDER';

    if (isInlineSyncRenewalProviderStatus(status)) {
      const providerPayment: SubscriptionProviderPayment = {
        id: paymentId,
        status,
        amount: {
          value: getPlanAmountRub(chargePlanSlug).toFixed(2),
          currency: getPlanPriceCurrencyCode(),
        },
        metadata: {
          productType: 'premium_subscription',
          userId: subscription.userId,
          plan: chargePlanSlug,
          kind: 'renewal',
        },
        paymentMethod: { id: paymentMethodId, saved: true },
      };
      await processRenewalProviderPaymentInline(
        subscription.userId,
        providerPayment,
        subscriptionPaymentId,
        now
      );
    }

    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE, {
      subscriptionId: subscription.id,
      subscriptionPaymentId,
      outcome: 'attempted',
      phase,
    });

    return 'attempted';
  } catch (error) {
    if (phase === 'PRE_PROVIDER') {
      logSubscriptionEvent(
        SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
        {
          subscriptionId: subscription.id,
          subscriptionPaymentId,
          phase,
          error: error instanceof Error ? error.message : String(error),
        },
        'error'
      );
      await rollbackPreProvider();
      return 'error';
    }

    logPostProviderFulfillmentFailure({
      subscriptionId: subscription.id,
      userId: subscription.userId,
      subscriptionPaymentId,
      error,
    });
    return 'error';
  }
}

export async function runRenewalCycle(now: Date = new Date()): Promise<RenewalCycleResult> {
  const result: RenewalCycleResult = {
    chargesAttempted: 0,
    chargesSkipped: 0,
    periodsEnded: 0,
    errors: 0,
  };

  if (!isSubscriptionAutoRenewEnabled()) {
    return result;
  }

  for (const { id, user_id } of await listPeriodEndedSubscriptionIds(now)) {
    const ended = await applySubscriptionPeriodEnded(id, user_id);
    if (ended) result.periodsEnded += 1;
  }

  await reconcileOrphanPendingRenewalsBeforeChargeSelection(now);

  for (const subscriptionId of await listChargeReadySubscriptionIds(now)) {
    const outcome = await attemptRenewalChargeForSubscription(subscriptionId, now);
    if (outcome === 'attempted') result.chargesAttempted += 1;
    else if (outcome === 'skipped') result.chargesSkipped += 1;
    else result.errors += 1;
  }

  return result;
}
