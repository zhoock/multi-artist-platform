/**
 * Premium subscription payment fulfillment (PR-3 / PR-3.1): initial checkout only.
 */

import { query } from './db';
import {
  claimSubscriptionPaymentCanceled,
  claimSubscriptionPaymentSuccess,
  fulfillSubscriptionPayment,
  isSubscriptionFulfilledForProviderPayment,
  updateSubscriptionPaymentStatus,
  validatePremiumSubscriptionPayment,
  type SubscriptionPlanSlug,
} from './subscription-billing';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import { devMockPaymentMethodTitle, formatPaymentMethodTitle } from './subscription-payment-method';
import type { SubscriptionProviderPayment } from './subscription-provider-payment';
import { providerPaymentKind } from './subscription-provider-payment';
import type { Subscription } from './subscriptions';
import { getViewerSubscription } from './subscriptions';
import { recordResubscribeCompleted } from './subscription-observability-fulfillment';
import type { SubscriptionObservabilitySource } from './subscription-observability';
import {
  devMockPaymentMethodId,
  extractSavedPaymentMethodId,
  SUBSCRIPTION_PAYMENT_KIND_INITIAL,
} from './subscription-yookassa';
import { amountsEqual, metaString } from './yookassa-webhook-verify';

export interface FulfillInitialSubscriptionPaymentParams {
  userId: string;
  planSlug: SubscriptionPlanSlug;
  providerPaymentId: string;
  paymentMethodId?: string | null;
  paymentMethodTitle?: string | null;
}

export interface ProcessInitialSubscriptionProviderPaymentResult {
  subscriptionActivated: boolean;
  alreadyFulfilled: boolean;
  planSlug: SubscriptionPlanSlug;
}

export interface ProcessInitialSubscriptionProviderPaymentOptions {
  devMode?: boolean;
  observabilitySource?: SubscriptionObservabilitySource;
  subscriptionPaymentId?: string;
}

export function isInitialSubscriptionPaymentKind(kind: string | null | undefined): boolean {
  const normalized = kind?.trim();
  if (!normalized) return true;
  return normalized === SUBSCRIPTION_PAYMENT_KIND_INITIAL;
}

export function resolvePaymentMethodIdFromProviderPayment(
  payment: SubscriptionProviderPayment,
  options: ProcessInitialSubscriptionProviderPaymentOptions = {}
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

export function resolvePaymentMethodTitleFromProviderPayment(
  payment: SubscriptionProviderPayment,
  options: ProcessInitialSubscriptionProviderPaymentOptions = {}
): string | null {
  if (!isSubscriptionAutoRenewEnabled()) return null;
  if (options.devMode) return devMockPaymentMethodTitle(payment.id);
  return formatPaymentMethodTitle(payment.paymentMethod);
}

async function persistInitialAutorenewFieldsIfMissing(
  subscriptionId: string,
  paymentMethodId: string,
  paymentMethodTitle: string | null,
  expiresAt: Date | null
): Promise<void> {
  await query(
    `UPDATE subscriptions
     SET payment_method_id = COALESCE(payment_method_id, $2),
         payment_method_title = COALESCE(payment_method_title, $3),
         next_charge_at = COALESCE(next_charge_at, $4),
         renewal_attempt_count = COALESCE(renewal_attempt_count, 0),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [subscriptionId, paymentMethodId, paymentMethodTitle, expiresAt]
  );
}

/**
 * Fulfill first Premium payment. Idempotent per providerPaymentId (PR-3.1).
 */
export async function fulfillInitialSubscriptionPayment(
  params: FulfillInitialSubscriptionPaymentParams
): Promise<{ subscription: Subscription; fulfilled: boolean; alreadyFulfilled: boolean }> {
  const alreadyFulfilled = await isSubscriptionFulfilledForProviderPayment(
    params.userId,
    params.providerPaymentId
  );

  if (alreadyFulfilled) {
    const subscription = await getViewerSubscription(params.userId);
    if (!subscription) {
      throw new Error('Subscription row missing after fulfilled payment');
    }
    await maybePersistPaymentMethod(
      subscription,
      params.paymentMethodId,
      params.paymentMethodTitle
    );
    return { subscription, fulfilled: false, alreadyFulfilled: true };
  }

  const subscription = await fulfillSubscriptionPayment({
    userId: params.userId,
    planSlug: params.planSlug,
    providerPaymentId: params.providerPaymentId,
  });

  await maybePersistPaymentMethod(subscription, params.paymentMethodId, params.paymentMethodTitle);

  return { subscription, fulfilled: true, alreadyFulfilled: false };
}

async function maybePersistPaymentMethod(
  subscription: Subscription,
  paymentMethodId: string | null | undefined,
  paymentMethodTitle: string | null | undefined
): Promise<Subscription> {
  if (!isSubscriptionAutoRenewEnabled()) return subscription;

  const pmId = paymentMethodId?.trim() || null;
  if (!pmId) return subscription;

  if (subscription.paymentMethodId?.trim()) {
    return subscription;
  }

  const title = paymentMethodTitle?.trim() || null;

  await persistInitialAutorenewFieldsIfMissing(
    subscription.id,
    pmId,
    title,
    subscription.expiresAt
  );

  return {
    ...subscription,
    paymentMethodId: pmId,
    paymentMethodTitle: subscription.paymentMethodTitle ?? title,
    nextChargeAt: subscription.nextChargeAt ?? subscription.expiresAt,
    renewalAttemptCount: subscription.renewalAttemptCount ?? 0,
  };
}

/**
 * Single entry point for webhook + polling (PR-3.1).
 */
export async function processInitialSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessInitialSubscriptionProviderPaymentOptions = {}
): Promise<ProcessInitialSubscriptionProviderPaymentResult> {
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

  if (!isInitialSubscriptionPaymentKind(providerPaymentKind(payment))) {
    throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
  }

  const priorSubscription = await getViewerSubscription(userId);
  const isResubscribe =
    priorSubscription != null &&
    (priorSubscription.status === 'expired' ||
      priorSubscription.status === 'canceled' ||
      priorSubscription.status === 'paused' ||
      priorSubscription.status === 'trial' ||
      priorSubscription.status === 'past_due' ||
      priorSubscription.status === 'cancel_at_period_end');

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

    const paymentMethodId = resolvePaymentMethodIdFromProviderPayment(payment, options);
    const paymentMethodTitle = resolvePaymentMethodTitleFromProviderPayment(payment, options);

    if (claim === 'already_succeeded') {
      const alreadyFulfilled = await isSubscriptionFulfilledForProviderPayment(userId, payment.id);
      if (alreadyFulfilled) {
        const subscription = await getViewerSubscription(userId);
        if (subscription) {
          await maybePersistPaymentMethod(subscription, paymentMethodId, paymentMethodTitle);
        }
        return {
          subscriptionActivated: true,
          alreadyFulfilled: true,
          planSlug,
        };
      }
    }

    const { fulfilled, alreadyFulfilled } = await fulfillInitialSubscriptionPayment({
      userId,
      planSlug,
      providerPaymentId: payment.id,
      paymentMethodId,
      paymentMethodTitle,
    });

    if (fulfilled && isResubscribe) {
      recordResubscribeCompleted(options.observabilitySource ?? 'poll');
    }

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

/** @deprecated Use resolvePaymentMethodIdFromProviderPayment */
export function resolveInitialPaymentMethodId(
  payment: { id: string; payment_method?: { id?: string; saved?: boolean } | null },
  options: { devMode?: boolean } = {}
): string | null {
  if (!isSubscriptionAutoRenewEnabled()) return null;
  if (options.devMode) return devMockPaymentMethodId(payment.id);
  return extractSavedPaymentMethodId(payment);
}
