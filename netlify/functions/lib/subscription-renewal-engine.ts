/**
 * Premium subscription renewal engine (PR-7): charge creation + period-end expiry.
 */

import { attachDevSucceededSubscriptionCheckout } from './complete-dev-payment';
import { isDevPaymentModeEnabled } from './dev-payment-mode';
import { query, withTransaction } from './db';
import { sqlBillingOriginFilterForRuntime } from './subscription-billing-origin';
import { sqlExcludePr10E2eIntegrationUsersFilter } from './subscription-renewal-scheduler-eligibility';
import { isYooKassaPaymentMethodNotSavedError } from './yookassa-renewal-create-errors';
import {
  attachProviderPaymentId,
  cancelOrphanPendingRenewalPayments,
  cleanupPendingRenewalPaymentWithClient,
  createRenewalAttemptRow,
  findUnresolvedRenewalAttemptForSubscription,
  getPlanAmountRub,
  getPlanDefinition,
  getPlanPriceCurrencyCode,
  getRenewalAttemptPostIdentity,
  hasUnresolvedRenewalPostStartedWithClient,
  resolveRenewalAttemptNo,
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
import { reconcileUnresolvedRenewalAttempts } from './subscription-renewal-reconcile';
import {
  extendSubscriptionObservability,
  logSubscriptionEvent,
  SUBSCRIPTION_LOG_EVENTS,
} from './subscription-observability';
import {
  buildRenewalYookassaCreatePayload,
  renewalPayloadAmountValue,
  renewalPayloadCurrency,
  renewalPayloadPlanSlug,
  type RenewalYookassaCreatePayload,
} from './subscription-renewal-post-payload';
import {
  acquireRenewalAttemptDispatchLease,
  attachRenewalProviderPaymentIdWithFence,
  createRenewalDispatchRunId,
  releaseRenewalAttemptDispatchLease,
} from './subscription-renewal-dispatch-lease';
import { guardedRenewalYooKassaPost } from './subscription-renewal-reconcile';
import { mapSubscriptionRow, type SubscriptionRow } from './subscriptions';

const PRODUCTION_RENEWAL_CLAIM_LOCK_MS = 30 * 60 * 1000;
const DEV_RENEWAL_CLAIM_LOCK_MS = 10 * 60 * 1000;

/** Local dev scheduler ticks every minute — a 30 min claim lock blocks retries for most of a QA session. */
export function resolveRenewalClaimLockMs(now: Date = new Date()): number {
  if (isDevPaymentModeEnabled()) {
    return DEV_RENEWAL_CLAIM_LOCK_MS;
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

export interface RenewalChargeClaimResult {
  row: SubscriptionRow;
  previousNextChargeAt: Date;
  /** `next_charge_at` value written by this claim (claim lock). */
  claimLockUntil: Date;
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
         ${sqlExcludePr10E2eIntegrationUsersFilter()}
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
    claimLockUntil: lockUntil,
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
       ${sqlExcludePr10E2eIntegrationUsersFilter()}
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

type SubscriptionSqlRunner = (
  text: string,
  values?: unknown[]
) => Promise<{ rows: { id?: string }[] }>;

async function restoreSubscriptionNextChargeAt(params: {
  subscriptionId: string;
  userId: string;
  restoreNextChargeAt: Date;
  runQuery: SubscriptionSqlRunner;
}): Promise<void> {
  await params.runQuery(
    `UPDATE subscriptions
     SET next_charge_at = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND user_id = $3::uuid`,
    [params.subscriptionId, params.restoreNextChargeAt, params.userId]
  );
}

async function restoreSubscriptionNextChargeAtIfClaimLockHeld(params: {
  subscriptionId: string;
  userId: string;
  restoreNextChargeAt: Date;
  claimLockUntil: Date;
  runQuery: SubscriptionSqlRunner;
}): Promise<boolean> {
  const updated = await params.runQuery(
    `UPDATE subscriptions
     SET next_charge_at = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND user_id = $3::uuid
       AND next_charge_at = $4
     RETURNING id`,
    [params.subscriptionId, params.restoreNextChargeAt, params.userId, params.claimLockUntil]
  );
  return Boolean(updated.rows[0]?.id);
}

/** Restores scheduler eligibility after a failed charge attempt (PR-7.1). */
export async function rollbackRenewalChargeAttempt(params: {
  subscriptionId: string;
  userId: string;
  restoreNextChargeAt: Date;
  subscriptionPaymentId?: string;
}): Promise<void> {
  if (params.subscriptionPaymentId) {
    await withTransaction(async (client) => {
      await cleanupPendingRenewalPaymentWithClient(
        client,
        params.subscriptionPaymentId!,
        params.userId
      );
      const unresolvedPost = await hasUnresolvedRenewalPostStartedWithClient(
        client,
        params.subscriptionPaymentId!,
        params.userId
      );
      if (unresolvedPost) {
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
          {
            subscriptionId: params.subscriptionId,
            subscriptionPaymentId: params.subscriptionPaymentId,
            outcome: 'skipped',
            reason: 'renewal_post_unresolved_skip_restore',
            phase: 'PRE_PROVIDER',
          },
          'warn'
        );
        return;
      }
      await restoreSubscriptionNextChargeAt({
        subscriptionId: params.subscriptionId,
        userId: params.userId,
        restoreNextChargeAt: params.restoreNextChargeAt,
        runQuery: client.query.bind(client),
      });
    });
    return;
  }

  await restoreSubscriptionNextChargeAt({
    subscriptionId: params.subscriptionId,
    userId: params.userId,
    restoreNextChargeAt: params.restoreNextChargeAt,
    runQuery: query,
  });
}

export type PreProviderQuarantineResult =
  | 'quarantined'
  | 'payment_method_changed'
  | 'payment_method_changed_next_charge_conflict';

/** Atomically clears pending renewal and quarantines an invalid saved PM (PRE_PROVIDER). */
export async function quarantinePreProviderInvalidRenewalPaymentMethod(params: {
  subscriptionId: string;
  userId: string;
  attemptedPaymentMethodId: string;
  subscriptionPaymentId: string;
  restoreNextChargeAtIfPaymentMethodChanged: Date;
  claimLockUntil: Date;
}): Promise<PreProviderQuarantineResult> {
  const attemptedPaymentMethodId = params.attemptedPaymentMethodId.trim();
  return withTransaction(async (client) => {
    await cleanupPendingRenewalPaymentWithClient(
      client,
      params.subscriptionPaymentId,
      params.userId
    );

    const quarantined = await client.query<{ id: string }>(
      `UPDATE subscriptions
       SET payment_method_id = NULL,
           payment_method_title = NULL,
           next_charge_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND payment_method_id = $3
       RETURNING id`,
      [params.subscriptionId, params.userId, attemptedPaymentMethodId]
    );

    if (quarantined.rows[0]?.id) {
      return 'quarantined';
    }

    const restored = await restoreSubscriptionNextChargeAtIfClaimLockHeld({
      subscriptionId: params.subscriptionId,
      userId: params.userId,
      restoreNextChargeAt: params.restoreNextChargeAtIfPaymentMethodChanged,
      claimLockUntil: params.claimLockUntil,
      runQuery: client.query.bind(client),
    });
    return restored ? 'payment_method_changed' : 'payment_method_changed_next_charge_conflict';
  });
}

export async function listChargeReadySubscriptionIds(now: Date = new Date()): Promise<string[]> {
  const r = await query<{ id: string }>(
    `SELECT id
     FROM subscriptions
     WHERE ${CHARGE_DUE_ELIGIBILITY}
       ${sqlBillingOriginFilterForRuntime()}
       ${sqlExcludePr10E2eIntegrationUsersFilter()}
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
  let frozenPostIdentity: Awaited<ReturnType<typeof getRenewalAttemptPostIdentity>> | undefined;

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

    const periodEnd = subscription.expiresAt;
    if (!periodEnd) {
      logSubscriptionEvent(
        SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
        {
          subscriptionId: subscription.id,
          outcome: 'skipped',
          reason: 'missing_period_end',
        },
        'warn'
      );
      await rollbackPreProvider();
      return 'skipped';
    }

    const existingAttempt = await findUnresolvedRenewalAttemptForSubscription(subscription.id);
    if (existingAttempt) {
      subscriptionPaymentId = existingAttempt.id;
    } else {
      let yookassaCreatePayload: RenewalYookassaCreatePayload;
      if (!isDevPaymentModeEnabled()) {
        const customerEmail = (await getUserEmail(subscription.userId))!;
        yookassaCreatePayload = buildRenewalYookassaCreatePayload({
          amountValue: getPlanAmountRub(chargePlanSlug).toFixed(2),
          description: getPlanDefinition(chargePlanSlug).description,
          userId: subscription.userId,
          planSlug: chargePlanSlug,
          customerEmail,
          paymentMethodId,
        });
      } else {
        const devEmail = (await getUserEmail(subscription.userId)) ?? 'dev-renewal@local.test';
        yookassaCreatePayload = buildRenewalYookassaCreatePayload({
          amountValue: getPlanAmountRub(chargePlanSlug).toFixed(2),
          description: getPlanDefinition(chargePlanSlug).description,
          userId: subscription.userId,
          planSlug: chargePlanSlug,
          customerEmail: devEmail,
          paymentMethodId,
        });
      }

      try {
        subscriptionPaymentId = await createRenewalAttemptRow({
          userId: subscription.userId,
          subscriptionId: subscription.id,
          periodEnd,
          attemptNo: resolveRenewalAttemptNo(subscription),
          planSlug: chargePlanSlug,
          yookassaCreatePayload,
        });
      } catch (createError) {
        const conflict = (createError as { renewalAttemptCreateConflict?: string })
          .renewalAttemptCreateConflict;
        if (conflict === 'open_renewal_for_subscription') {
          const raced = await findUnresolvedRenewalAttemptForSubscription(subscription.id);
          if (raced?.id) {
            subscriptionPaymentId = raced.id;
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    }

    frozenPostIdentity = await getRenewalAttemptPostIdentity(
      subscriptionPaymentId,
      subscription.userId
    );
    if (!frozenPostIdentity.ok) {
      logSubscriptionEvent(
        SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
        {
          subscriptionId: subscription.id,
          subscriptionPaymentId,
          phase: 'PRE_PROVIDER',
          reason: 'renewal_post_identity_invalid',
          detail: frozenPostIdentity.reason,
        },
        'error'
      );
      await rollbackPreProvider();
      return 'error';
    }

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

    const postIdentity = frozenPostIdentity!;
    const dispatchRunId = createRenewalDispatchRunId();
    const leaseAcquire = await acquireRenewalAttemptDispatchLease({
      subscriptionPaymentId,
      userId: subscription.userId,
      runId: dispatchRunId,
      now,
    });
    if (!leaseAcquire.ok) {
      logSubscriptionEvent(
        SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
        {
          subscriptionId: subscription.id,
          subscriptionPaymentId,
          outcome: 'skipped',
          reason: 'renewal_dispatch_lease_unavailable',
          detail: leaseAcquire.reason,
          phase: 'PRE_PROVIDER',
        },
        'warn'
      );
      return 'skipped';
    }
    const dispatchLease = leaseAcquire.lease;

    let postResult: Awaited<ReturnType<typeof guardedRenewalYooKassaPost>>;
    try {
      postResult = await guardedRenewalYooKassaPost({
        subscriptionPaymentId,
        userId: subscription.userId,
        now,
        claimFirstPostWhenInitial: true,
        dispatchLease,
      });
    } catch (postError) {
      await releaseRenewalAttemptDispatchLease(dispatchLease, now);
      throw postError;
    }

    if (!postResult.ok) {
      await releaseRenewalAttemptDispatchLease(dispatchLease, now);
      if (postResult.reason === 'needs_review' || postResult.reason === 'invalid_first_post') {
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
          {
            subscriptionId: subscription.id,
            subscriptionPaymentId,
            outcome: 'skipped',
            reason: 'renewal_post_needs_review',
            phase: 'PRE_PROVIDER',
          },
          'warn'
        );
        return 'skipped';
      }
      if (postResult.reason === 'identity_invalid') {
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
          {
            subscriptionId: subscription.id,
            subscriptionPaymentId,
            phase: 'PRE_PROVIDER',
            reason: 'renewal_post_identity_invalid',
            detail: postResult.detail,
          },
          'error'
        );
        await rollbackPreProvider();
        return 'error';
      }
      if (postResult.reason === 'not_found') {
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
          {
            subscriptionId: subscription.id,
            subscriptionPaymentId,
            phase: 'PRE_PROVIDER',
            reason: 'renewal_first_post_claim_not_found',
          },
          'error'
        );
        await rollbackPreProvider();
        return 'error';
      }
      if (postResult.reason === 'provider_id_use_get') {
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
          {
            subscriptionId: subscription.id,
            subscriptionPaymentId,
            outcome: 'skipped',
            reason: 'renewal_post_deferred_to_reconcile',
            phase: 'PRE_PROVIDER',
          },
          'warn'
        );
        return 'skipped';
      }
      await rollbackPreProvider();
      return 'error';
    }

    if (postResult.route === 'repeat_post') {
      logSubscriptionEvent(
        SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
        {
          subscriptionId: subscription.id,
          subscriptionPaymentId,
          outcome: 'resuming',
          reason: 'renewal_first_post_already_set',
          phase: 'PRE_PROVIDER',
        },
        'warn'
      );
    }

    const { paymentId, status } = postResult;

    const attachOutcome = await attachRenewalProviderPaymentIdWithFence(dispatchLease, paymentId);
    if (attachOutcome !== 'attached') {
      await releaseRenewalAttemptDispatchLease(dispatchLease, now);
      logSubscriptionEvent(
        SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
        {
          subscriptionId: subscription.id,
          subscriptionPaymentId,
          outcome: 'skipped',
          reason: 'renewal_provider_attach_fence_rejected',
          phase: 'PRE_PROVIDER',
        },
        'warn'
      );
      return 'skipped';
    }
    phase = 'POST_PROVIDER';

    try {
      if (isInlineSyncRenewalProviderStatus(status)) {
        const amountValue =
          renewalPayloadAmountValue(postIdentity.payload) ??
          getPlanAmountRub(chargePlanSlug).toFixed(2);
        const currency = renewalPayloadCurrency(postIdentity.payload) ?? getPlanPriceCurrencyCode();
        const planFromPayload = renewalPayloadPlanSlug(postIdentity.payload) ?? chargePlanSlug;
        const providerPayment: SubscriptionProviderPayment = {
          id: paymentId,
          status,
          amount: {
            value: amountValue,
            currency,
          },
          metadata: {
            productType: 'premium_subscription',
            userId: subscription.userId,
            plan: planFromPayload,
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
    } finally {
      await releaseRenewalAttemptDispatchLease(dispatchLease, now);
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
      if (isYooKassaPaymentMethodNotSavedError(error)) {
        if (subscriptionPaymentId) {
          const quarantineOutcome = await quarantinePreProviderInvalidRenewalPaymentMethod({
            subscriptionId: subscription.id,
            userId: subscription.userId,
            attemptedPaymentMethodId: paymentMethodId,
            subscriptionPaymentId,
            restoreNextChargeAtIfPaymentMethodChanged: claim.previousNextChargeAt,
            claimLockUntil: claim.claimLockUntil,
          });
          if (quarantineOutcome === 'payment_method_changed_next_charge_conflict') {
            logSubscriptionEvent(
              SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
              {
                subscriptionId: subscription.id,
                subscriptionPaymentId,
                outcome: 'skipped',
                reason: 'renewal_next_charge_restore_skipped',
                phase: 'PRE_PROVIDER',
                claimLockUntil: claim.claimLockUntil.toISOString(),
              },
              'warn'
            );
          }
        } else {
          await rollbackPreProvider();
        }
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
          {
            subscriptionId: subscription.id,
            subscriptionPaymentId,
            outcome: 'skipped',
            reason: 'yookassa_payment_method_not_saved',
            phase: 'PRE_PROVIDER',
          },
          'warn'
        );
        return 'skipped';
      }

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

export type RenewalCyclePreview = {
  autoRenewEnabled: boolean;
  periodsEndedDue: number;
  chargesDue: number;
};

/** Read-only counterpart of runRenewalCycle: no claims, reconciles, payments or status changes. */
export async function previewRenewalCycle(now: Date = new Date()): Promise<RenewalCyclePreview> {
  const [periodEnded, chargeReady] = await Promise.all([
    listPeriodEndedSubscriptionIds(now),
    listChargeReadySubscriptionIds(now),
  ]);
  return {
    autoRenewEnabled: isSubscriptionAutoRenewEnabled(),
    periodsEndedDue: periodEnded.length,
    chargesDue: chargeReady.length,
  };
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
  await reconcileUnresolvedRenewalAttempts(now);

  for (const subscriptionId of await listChargeReadySubscriptionIds(now)) {
    const outcome = await attemptRenewalChargeForSubscription(subscriptionId, now);
    if (outcome === 'attempted') result.chargesAttempted += 1;
    else if (outcome === 'skipped') result.chargesSkipped += 1;
    else result.errors += 1;
  }

  return result;
}
