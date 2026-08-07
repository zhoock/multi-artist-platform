/**
 * Premium subscription renewal fulfillment (PR-7).
 * Only pipeline that applies scheduled_plan and deactivates excess archive artists.
 */

import { deactivateExcessArchiveArtists, extendActiveArchiveLockedUntil } from './archive';
import { query } from './db';
import {
  claimSubscriptionPaymentCanceled,
  claimSubscriptionPaymentSuccess,
  computeSupportExpiresAt,
  getPlanSlotsLimit,
  isSubscriptionFulfilledForProviderPayment,
  normalizeSubscriptionPlanSlug,
  updateSubscriptionPaymentStatus,
  validatePremiumSubscriptionPayment,
  type SubscriptionPlanSlug,
} from './subscription-billing';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import type { SubscriptionProviderPayment } from './subscription-provider-payment';
import { providerPaymentKind } from './subscription-provider-payment';
import {
  computeRenewalRetryChargeAt,
  getNextSubscriptionStatus,
  InvalidSubscriptionTransitionError,
  MAX_RENEWAL_ATTEMPTS,
  toPresenceStatus,
  type SubscriptionEvent,
  type SubscriptionPresenceStatus,
} from './subscription-state';
import { SUBSCRIPTION_PAYMENT_KIND_RENEWAL } from './subscription-yookassa';
import type { Subscription } from './subscriptions';
import { getViewerSubscription, mapSubscriptionRow, type SubscriptionRow } from './subscriptions';
import { amountsEqual, metaString } from './yookassa-webhook-verify';
import {
  emitSubscriptionMetric,
  extendSubscriptionObservability,
  logSubscriptionEvent,
  SUBSCRIPTION_LOG_EVENTS,
  SUBSCRIPTION_METRICS,
} from './subscription-observability';

export interface ProcessRenewalSubscriptionProviderPaymentResult {
  subscriptionRenewed: boolean;
  alreadyFulfilled: boolean;
  planSlug: SubscriptionPlanSlug;
}

export interface ProcessRenewalSubscriptionProviderPaymentOptions {
  /** Pin fulfillment clock (scheduler tick / tests). */
  now?: Date;
}

export function isRenewalSubscriptionPaymentKind(kind: string | null | undefined): boolean {
  return kind?.trim() === SUBSCRIPTION_PAYMENT_KIND_RENEWAL;
}

function resolveRenewalSuccessEvent(presence: SubscriptionPresenceStatus): SubscriptionEvent {
  return presence === 'past_due' ? 'RETRY_SUCCEEDED' : 'AUTO_RENEW_SUCCEEDED';
}

function resolveRenewalFailureEvent(presence: SubscriptionPresenceStatus): SubscriptionEvent {
  return presence === 'past_due' ? 'RETRY_FAILED' : 'RENEWAL_FAILED';
}

/** Idempotent archive side effects after renewal subscription row is updated (PR-7.1). */
export async function applyRenewalArchiveSideEffects(params: {
  userId: string;
  slotsLimit: number;
  expiresAt: Date;
}): Promise<void> {
  await deactivateExcessArchiveArtists(params.userId, params.slotsLimit);
  await extendActiveArchiveLockedUntil(params.userId, params.expiresAt);
}

export async function fulfillRenewalSubscriptionPayment(params: {
  userId: string;
  planSlug: SubscriptionPlanSlug;
  providerPaymentId: string;
  /** Scheduler / tests may pin clock; defaults to wall time. */
  now?: Date;
}): Promise<{ subscription: Subscription; fulfilled: boolean; alreadyFulfilled: boolean }> {
  const paymentAlreadyApplied = await isSubscriptionFulfilledForProviderPayment(
    params.userId,
    params.providerPaymentId
  );

  if (paymentAlreadyApplied) {
    const subscription = await getViewerSubscription(params.userId);
    if (!subscription) {
      throw new Error('Subscription row missing after fulfilled renewal payment');
    }
    const expiresAt =
      subscription.expiresAt instanceof Date
        ? subscription.expiresAt
        : subscription.expiresAt
          ? new Date(subscription.expiresAt)
          : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime())) {
      await applyRenewalArchiveSideEffects({
        userId: params.userId,
        slotsLimit: subscription.slotsLimit,
        expiresAt,
      });
    }
    return { subscription, fulfilled: false, alreadyFulfilled: true };
  }

  const existing = await getViewerSubscription(params.userId);
  if (!existing) {
    throw new Error('Subscription not found for renewal fulfillment');
  }

  const presence = toPresenceStatus(existing);
  if (presence !== 'active' && presence !== 'past_due') {
    throw Object.assign(new Error('Renewal fulfillment requires active or past_due subscription'), {
      statusCode: 409,
    });
  }

  const scheduledPlanSlug = normalizeSubscriptionPlanSlug(existing.scheduledPlan);
  const appliedPlanSlug = scheduledPlanSlug ?? params.planSlug;
  const appliedSlotsLimit = getPlanSlotsLimit(appliedPlanSlug);

  let nextStatus;
  try {
    nextStatus = getNextSubscriptionStatus(presence, resolveRenewalSuccessEvent(presence));
  } catch (error) {
    if (error instanceof InvalidSubscriptionTransitionError) {
      throw Object.assign(new Error(error.message), { statusCode: 409 });
    }
    throw error;
  }

  const now = params.now ?? new Date();
  const expiresAt = computeSupportExpiresAt(appliedPlanSlug, now);
  const nextChargeAt =
    isSubscriptionAutoRenewEnabled() && existing.paymentMethodId?.trim() ? expiresAt : null;

  const updated = await query<SubscriptionRow>(
    `UPDATE subscriptions
     SET status = $2,
         plan = $3,
         slots_limit = $4,
         provider = 'yookassa',
         provider_subscription_id = $5,
         expires_at = $6,
         scheduled_plan = NULL,
         renewal_attempt_count = 0,
         first_failed_at = NULL,
         next_charge_at = $7,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND user_id = $8::uuid
       AND provider_subscription_id IS DISTINCT FROM $5
     RETURNING
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
       next_charge_at,
       renewal_attempt_count,
       scheduled_plan,
       first_failed_at,
       created_at,
       updated_at`,
    [
      existing.id,
      nextStatus,
      appliedPlanSlug,
      appliedSlotsLimit,
      params.providerPaymentId,
      expiresAt,
      nextChargeAt,
      params.userId,
    ]
  );

  let subscription: Subscription;

  if (updated.rows[0]) {
    subscription = mapSubscriptionRow(updated.rows[0]);
  } else {
    const reloaded = await getViewerSubscription(params.userId);
    if (!reloaded || reloaded.providerSubscriptionId !== params.providerPaymentId) {
      throw new Error('Failed to apply renewal to subscription');
    }
    subscription = reloaded;
  }

  const sideEffectExpiresAt =
    subscription.expiresAt instanceof Date
      ? subscription.expiresAt
      : subscription.expiresAt
        ? new Date(subscription.expiresAt)
        : expiresAt;

  await applyRenewalArchiveSideEffects({
    userId: params.userId,
    slotsLimit: subscription.slotsLimit,
    expiresAt: sideEffectExpiresAt,
  });

  const wasFirstWriter = Boolean(updated.rows[0]);

  return {
    subscription,
    fulfilled: wasFirstWriter,
    alreadyFulfilled: !wasFirstWriter,
  };
}

export async function handleRenewalPaymentFailure(params: {
  userId: string;
  providerPaymentId: string;
}): Promise<{ handled: boolean; subscription: Subscription | null }> {
  extendSubscriptionObservability({
    userId: params.userId,
    providerPaymentId: params.providerPaymentId,
    kind: 'renewal',
  });

  const existing = await getViewerSubscription(params.userId);
  if (!existing) {
    return { handled: false, subscription: null };
  }

  const presence = toPresenceStatus(existing);
  if (presence !== 'active' && presence !== 'past_due') {
    return { handled: false, subscription: existing };
  }

  const now = new Date();
  const firstFailedAt = existing.firstFailedAt ?? now;
  const previousAttempts = existing.renewalAttemptCount ?? 0;
  const nextAttemptCount = previousAttempts + 1;
  const attemptsRemaining = MAX_RENEWAL_ATTEMPTS - nextAttemptCount;

  if (nextAttemptCount >= MAX_RENEWAL_ATTEMPTS) {
    let nextStatus;
    try {
      nextStatus = getNextSubscriptionStatus('past_due', 'DUNNING_EXHAUSTED');
    } catch (error) {
      if (error instanceof InvalidSubscriptionTransitionError) {
        return { handled: false, subscription: existing };
      }
      throw error;
    }

    const updated = await query<SubscriptionRow>(
      `UPDATE subscriptions
       SET status = $2,
           renewal_attempt_count = $3,
           first_failed_at = COALESCE(first_failed_at, $4),
           next_charge_at = NULL,
           scheduled_plan = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $5::uuid
       RETURNING
         id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
         started_at, expires_at, payment_method_id, next_charge_at, renewal_attempt_count,
         scheduled_plan, first_failed_at, created_at, updated_at`,
      [existing.id, nextStatus, nextAttemptCount, firstFailedAt, params.userId]
    );

    const nextSubscription = updated.rows[0] ? mapSubscriptionRow(updated.rows[0]) : existing;
    emitSubscriptionMetric(SUBSCRIPTION_METRICS.RENEWAL_EXHAUSTED, { source: 'dunning' });
    emitSubscriptionMetric(SUBSCRIPTION_METRICS.DUNNING_STEP, { outcome: 'exhausted' });
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.RENEWAL_EXHAUSTED, {
      statusBefore: existing.status,
      statusAfter: nextSubscription.status,
      renewalAttemptCount: nextAttemptCount,
    });

    return {
      handled: true,
      subscription: nextSubscription,
    };
  }

  const failureEvent = resolveRenewalFailureEvent(presence);
  let nextStatus;
  try {
    nextStatus = getNextSubscriptionStatus(presence, failureEvent, {
      hasPaymentMethod: Boolean(existing.paymentMethodId?.trim()),
      attemptsRemaining,
    });
  } catch (error) {
    if (error instanceof InvalidSubscriptionTransitionError) {
      return { handled: false, subscription: existing };
    }
    throw error;
  }

  const nextChargeAt = computeRenewalRetryChargeAt(firstFailedAt, nextAttemptCount);

  const updated = await query<SubscriptionRow>(
    `UPDATE subscriptions
     SET status = $2,
         renewal_attempt_count = $3,
         first_failed_at = COALESCE(first_failed_at, $4),
         next_charge_at = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND user_id = $6::uuid
     RETURNING
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, payment_method_id, next_charge_at, renewal_attempt_count,
       scheduled_plan, first_failed_at, created_at, updated_at`,
    [existing.id, nextStatus, nextAttemptCount, firstFailedAt, nextChargeAt, params.userId]
  );

  const nextSubscription = updated.rows[0] ? mapSubscriptionRow(updated.rows[0]) : existing;
  emitSubscriptionMetric(SUBSCRIPTION_METRICS.RENEWAL_FAILED, { source: 'dunning' });
  emitSubscriptionMetric(SUBSCRIPTION_METRICS.DUNNING_STEP, { outcome: 'retry_scheduled' });
  logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.DUNNING_STEP, {
    statusBefore: existing.status,
    statusAfter: nextSubscription.status,
    renewalAttemptCount: nextAttemptCount,
    attemptsRemaining: attemptsRemaining - 1,
  });
  logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.RENEWAL_FAILED, {
    renewalAttemptCount: nextAttemptCount,
  });

  return {
    handled: true,
    subscription: nextSubscription,
  };
}

export async function applySubscriptionPeriodEnded(
  subscriptionId: string,
  userId: string
): Promise<Subscription | null> {
  const existing = await getViewerSubscription(userId);
  if (!existing || existing.id !== subscriptionId) return null;

  const presence = toPresenceStatus(existing);
  if (presence !== 'cancel_at_period_end' && presence !== 'active') {
    return existing;
  }

  let nextStatus;
  try {
    nextStatus = getNextSubscriptionStatus(presence, 'PERIOD_ENDED');
  } catch {
    return existing;
  }

  const updated = await query<SubscriptionRow>(
    `UPDATE subscriptions
     SET status = $2,
         next_charge_at = NULL,
         scheduled_plan = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND user_id = $3::uuid
       AND expires_at <= CURRENT_TIMESTAMP
     RETURNING
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, payment_method_id, next_charge_at, renewal_attempt_count,
       scheduled_plan, first_failed_at, created_at, updated_at`,
    [subscriptionId, nextStatus, userId]
  );

  const row = updated.rows[0];
  if (row) {
    const nextSubscription = mapSubscriptionRow(row);
    extendSubscriptionObservability({
      userId,
      subscriptionId,
      kind: 'renewal',
      source: 'scheduler',
    });
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.PERIOD_ENDED, {
      statusBefore: existing.status,
      statusAfter: nextSubscription.status,
    });
    return nextSubscription;
  }
  return null;
}

export async function processRenewalSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessRenewalSubscriptionProviderPaymentOptions = {}
): Promise<ProcessRenewalSubscriptionProviderPaymentResult> {
  const metaUserId = metaString(payment.metadata, 'userId');
  const productType = metaString(payment.metadata, 'productType');
  const plan = metaString(payment.metadata, 'plan');

  const paymentValidation = validatePremiumSubscriptionPayment({
    productType,
    userId: metaUserId,
    plan,
    amountValue: payment.amount.value,
    currency: payment.amount.currency,
    amountsEqual,
  });

  if (!paymentValidation.valid) {
    const message =
      paymentValidation.reason === 'missing userId metadata'
        ? 'Payment does not belong to this user'
        : paymentValidation.reason === 'productType'
          ? 'Not a premium subscription payment'
          : paymentValidation.reason === 'plan metadata'
            ? 'Unexpected subscription plan'
            : 'Payment amount mismatch';
    const statusCode = paymentValidation.reason === 'missing userId metadata' ? 403 : 400;
    throw Object.assign(new Error(message), { statusCode });
  }

  if (metaUserId !== userId) {
    throw Object.assign(new Error('Payment does not belong to this user'), { statusCode: 403 });
  }

  const planSlug = paymentValidation.planSlug;

  if (!isRenewalSubscriptionPaymentKind(providerPaymentKind(payment))) {
    throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
  }

  if (payment.status === 'succeeded') {
    const claim = await claimSubscriptionPaymentSuccess(payment.id, userId);
    if (claim === 'not_found') {
      throw Object.assign(new Error('Subscription payment not found'), { statusCode: 404 });
    }

    if (claim === 'rejected_terminal') {
      const alreadyFulfilled = await isSubscriptionFulfilledForProviderPayment(userId, payment.id);
      return {
        subscriptionRenewed: alreadyFulfilled,
        alreadyFulfilled,
        planSlug,
      };
    }

    const { fulfilled, alreadyFulfilled } = await fulfillRenewalSubscriptionPayment({
      userId,
      planSlug,
      providerPaymentId: payment.id,
      now: options.now,
    });

    return {
      subscriptionRenewed: fulfilled || alreadyFulfilled,
      alreadyFulfilled,
      planSlug,
    };
  }

  if (payment.status === 'canceled') {
    const claim = await claimSubscriptionPaymentCanceled(payment.id, userId);
    if (claim === 'claimed') {
      await handleRenewalPaymentFailure({ userId, providerPaymentId: payment.id });
    } else if (claim === 'not_found') {
      await updateSubscriptionPaymentStatus(payment.id, 'canceled');
    }
  } else if (payment.status === 'waiting_for_capture') {
    await updateSubscriptionPaymentStatus(payment.id, 'waiting_for_capture');
  } else if (payment.status === 'pending') {
    await updateSubscriptionPaymentStatus(payment.id, 'pending');
  }

  return { subscriptionRenewed: false, alreadyFulfilled: false, planSlug };
}
