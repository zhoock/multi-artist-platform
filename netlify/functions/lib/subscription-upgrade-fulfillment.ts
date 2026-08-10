/**
 * Premium subscription upgrade fulfillment (PR-6, ADR-005).
 * Separate pipeline from initial/resubscribe checkout.
 */

import { query } from './db';
import {
  claimSubscriptionPaymentCanceled,
  claimSubscriptionPaymentSuccess,
  comparePlanTiers,
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
  getNextSubscriptionStatus,
  InvalidSubscriptionTransitionError,
  toPresenceStatus,
} from './subscription-state';
import type { Subscription } from './subscriptions';
import { getViewerSubscription, mapSubscriptionRow, type SubscriptionRow } from './subscriptions';
import {
  devMockPaymentMethodId,
  extractSavedPaymentMethodId,
  SUBSCRIPTION_PAYMENT_KIND_UPGRADE,
} from './subscription-yookassa';
import { amountsEqual, metaString } from './yookassa-webhook-verify';

export interface FulfillUpgradeSubscriptionPaymentParams {
  userId: string;
  planSlug: SubscriptionPlanSlug;
  providerPaymentId: string;
  paymentMethodId?: string | null;
}

export interface ProcessUpgradeSubscriptionProviderPaymentResult {
  subscriptionActivated: boolean;
  alreadyFulfilled: boolean;
  planSlug: SubscriptionPlanSlug;
}

export interface ProcessUpgradeSubscriptionProviderPaymentOptions {
  devMode?: boolean;
}

export function isUpgradeSubscriptionPaymentKind(kind: string | null | undefined): boolean {
  return kind?.trim() === SUBSCRIPTION_PAYMENT_KIND_UPGRADE;
}

export function resolveUpgradePaymentMethodId(
  payment: SubscriptionProviderPayment,
  options: ProcessUpgradeSubscriptionProviderPaymentOptions = {}
): string | null {
  if (!isSubscriptionAutoRenewEnabled()) return null;
  if (options.devMode) {
    return devMockPaymentMethodId(payment.id);
  }
  if (!payment.paymentMethod?.id) return null;
  return extractSavedPaymentMethodId({
    id: payment.id,
    payment_method: {
      id: payment.paymentMethod.id,
      saved: payment.paymentMethod.saved,
    },
  });
}

/**
 * Apply upgrade after successful payment: new plan, new period, exit dunning, clear scheduled_plan.
 * Never deactivates archive artists (ADR-005 / project rule).
 */
export async function fulfillUpgradeSubscriptionPayment(
  params: FulfillUpgradeSubscriptionPaymentParams
): Promise<{ subscription: Subscription; fulfilled: boolean; alreadyFulfilled: boolean }> {
  const alreadyFulfilled = await isSubscriptionFulfilledForProviderPayment(
    params.userId,
    params.providerPaymentId
  );

  if (alreadyFulfilled) {
    const subscription = await getViewerSubscription(params.userId);
    if (!subscription) {
      throw new Error('Subscription row missing after fulfilled upgrade payment');
    }
    await maybePersistUpgradePaymentMethod(subscription, params.paymentMethodId);
    return { subscription, fulfilled: false, alreadyFulfilled: true };
  }

  const existing = await getViewerSubscription(params.userId);
  if (!existing) {
    throw new Error('Subscription not found for upgrade fulfillment');
  }

  const currentPlanSlug = normalizeSubscriptionPlanSlug(existing.plan);
  if (!currentPlanSlug) {
    throw new Error('Current subscription plan is invalid');
  }

  if (comparePlanTiers(params.planSlug, currentPlanSlug) <= 0) {
    throw new Error('Upgrade target plan must be higher than current plan');
  }

  const presence = toPresenceStatus(existing);
  let nextStatus;
  try {
    nextStatus = getNextSubscriptionStatus(presence, 'PLAN_CHANGE_SUCCEEDED');
  } catch (error) {
    if (error instanceof InvalidSubscriptionTransitionError) {
      throw Object.assign(new Error(error.message), { statusCode: 409 });
    }
    throw error;
  }

  const now = new Date();
  const expiresAt = computeSupportExpiresAt(params.planSlug, now);
  const slotsLimit = getPlanSlotsLimit(params.planSlug);
  const nextChargeAt = existing.paymentMethodId?.trim() ? expiresAt : null;

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
      params.planSlug,
      slotsLimit,
      params.providerPaymentId,
      expiresAt,
      nextChargeAt,
      params.userId,
    ]
  );

  const row = updated.rows[0];
  if (!row) {
    const reloaded = await getViewerSubscription(params.userId);
    if (reloaded?.providerSubscriptionId === params.providerPaymentId) {
      let subscription = reloaded;
      subscription = await maybePersistUpgradePaymentMethod(subscription, params.paymentMethodId);
      return { subscription, fulfilled: false, alreadyFulfilled: true };
    }
    throw new Error('Failed to apply upgrade to subscription');
  }

  let subscription = mapSubscriptionRow(row);
  subscription = await maybePersistUpgradePaymentMethod(subscription, params.paymentMethodId, {
    allowBindWhenEmpty: true,
  });

  if (subscription.paymentMethodId?.trim() && subscription.expiresAt) {
    await query(
      `UPDATE subscriptions
       SET next_charge_at = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [subscription.id, subscription.expiresAt]
    );
    subscription = { ...subscription, nextChargeAt: subscription.expiresAt };
  }

  return { subscription, fulfilled: true, alreadyFulfilled: false };
}

async function maybePersistUpgradePaymentMethod(
  subscription: Subscription,
  paymentMethodId: string | null | undefined,
  options: { allowBindWhenEmpty?: boolean } = {}
): Promise<Subscription> {
  if (!isSubscriptionAutoRenewEnabled()) return subscription;

  const pmId = paymentMethodId?.trim() || null;
  if (!pmId) return subscription;

  const existingPm = subscription.paymentMethodId?.trim();
  if (!existingPm && !options.allowBindWhenEmpty) {
    return subscription;
  }

  const expiresAt = subscription.expiresAt;
  await query(
    `UPDATE subscriptions
     SET payment_method_id = COALESCE(payment_method_id, $2),
         next_charge_at = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [subscription.id, pmId, subscription.expiresAt]
  );

  return {
    ...subscription,
    paymentMethodId: subscription.paymentMethodId?.trim() ? subscription.paymentMethodId : pmId,
    nextChargeAt: subscription.expiresAt,
  };
}

export async function processUpgradeSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessUpgradeSubscriptionProviderPaymentOptions = {}
): Promise<ProcessUpgradeSubscriptionProviderPaymentResult> {
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

  if (!isUpgradeSubscriptionPaymentKind(providerPaymentKind(payment))) {
    throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
  }

  if (payment.status === 'succeeded') {
    const claim = await claimSubscriptionPaymentSuccess(payment.id, userId);
    if (claim === 'not_found') {
      throw Object.assign(new Error('Subscription payment not found'), { statusCode: 404 });
    }

    if (claim === 'rejected_terminal') {
      return {
        subscriptionActivated: false,
        alreadyFulfilled: false,
        planSlug,
      };
    }

    const paymentMethodId = resolveUpgradePaymentMethodId(payment, options);

    if (claim === 'already_succeeded') {
      const alreadyFulfilled = await isSubscriptionFulfilledForProviderPayment(userId, payment.id);
      if (alreadyFulfilled) {
        const subscription = await getViewerSubscription(userId);
        if (subscription) {
          await maybePersistUpgradePaymentMethod(subscription, paymentMethodId);
        }
        return {
          subscriptionActivated: true,
          alreadyFulfilled: true,
          planSlug,
        };
      }
    }

    const { fulfilled, alreadyFulfilled } = await fulfillUpgradeSubscriptionPayment({
      userId,
      planSlug,
      providerPaymentId: payment.id,
      paymentMethodId,
    });

    return {
      subscriptionActivated: fulfilled || alreadyFulfilled,
      alreadyFulfilled,
      planSlug,
    };
  }

  if (payment.status === 'canceled') {
    await claimSubscriptionPaymentCanceled(payment.id, userId);
  } else if (payment.status === 'waiting_for_capture') {
    await updateSubscriptionPaymentStatus(payment.id, 'waiting_for_capture');
  } else if (payment.status === 'pending') {
    await updateSubscriptionPaymentStatus(payment.id, 'pending');
  }

  return { subscriptionActivated: false, alreadyFulfilled: false, planSlug };
}
