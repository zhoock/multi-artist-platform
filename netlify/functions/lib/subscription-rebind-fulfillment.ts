/**
 * Rebind payment method fulfillment (PR-9).
 * Updates payment_method_id + payment_method_title only — no subscription status mutation.
 */

import { query } from './db';
import { getMyArchiveForUser } from './archive';
import {
  claimSubscriptionPaymentSuccess,
  getRebindAmountRub,
  PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
  updateSubscriptionPaymentStatus,
  validateRebindSubscriptionPayment,
} from './subscription-billing';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import { devMockPaymentMethodTitle, formatPaymentMethodTitle } from './subscription-payment-method';
import type { SubscriptionProviderPayment } from './subscription-provider-payment';
import { providerPaymentKind } from './subscription-provider-payment';
import type { Subscription } from './subscriptions';
import { getViewerSubscription, mapSubscriptionRow, type SubscriptionRow } from './subscriptions';
import { derivePaymentMethodTitle } from './subscription-billing-snapshot';
import {
  devMockPaymentMethodId,
  extractSavedPaymentMethodId,
  SUBSCRIPTION_PAYMENT_KIND_REBIND,
} from './subscription-yookassa';
import { amountsEqual, metaString } from './yookassa-webhook-verify';

export interface ProcessRebindSubscriptionProviderPaymentResult {
  paymentMethodUpdated: boolean;
  alreadyApplied: boolean;
}

export interface ProcessRebindSubscriptionProviderPaymentOptions {
  devMode?: boolean;
}

export function isRebindSubscriptionPaymentKind(kind: string | null | undefined): boolean {
  return kind?.trim() === SUBSCRIPTION_PAYMENT_KIND_REBIND;
}

function resolvePaymentMethodIdFromRebindPayment(
  payment: SubscriptionProviderPayment,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): string | null {
  if (!isSubscriptionAutoRenewEnabled()) return null;
  if (options.devMode) return devMockPaymentMethodId(payment.id);
  if (!payment.paymentMethod?.id) return null;
  return extractSavedPaymentMethodId({
    id: payment.id,
    payment_method: {
      id: payment.paymentMethod.id,
      saved: payment.paymentMethod.saved,
    },
  });
}

function resolvePaymentMethodTitleFromRebindPayment(
  payment: SubscriptionProviderPayment,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): string | null {
  if (options.devMode) return devMockPaymentMethodTitle(payment.id);
  return formatPaymentMethodTitle(payment.paymentMethod);
}

async function applyRebindPaymentMethod(
  userId: string,
  paymentMethodId: string,
  paymentMethodTitle: string | null
): Promise<Subscription | null> {
  const existing = await getViewerSubscription(userId);
  const resolvedTitle = derivePaymentMethodTitle(existing, paymentMethodTitle);

  const updated = await query<SubscriptionRow>(
    `UPDATE subscriptions
     SET payment_method_id = $2,
         payment_method_title = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1::uuid
     RETURNING
       id, user_id, status, plan, slots_limit, provider, provider_subscription_id,
       started_at, expires_at, payment_method_id, payment_method_title,
       next_charge_at, renewal_attempt_count, scheduled_plan, first_failed_at,
       created_at, updated_at`,
    [userId, paymentMethodId, resolvedTitle]
  );

  const row = updated.rows[0];
  return row ? mapSubscriptionRow(row) : null;
}

export async function fulfillRebindSubscriptionPayment(params: {
  userId: string;
  providerPaymentId: string;
  paymentMethodId: string;
  paymentMethodTitle: string | null;
}): Promise<{ subscription: Subscription | null; applied: boolean; alreadyApplied: boolean }> {
  const claim = await claimSubscriptionPaymentSuccess(params.providerPaymentId, params.userId);

  if (claim === 'not_found') {
    throw Object.assign(new Error('Subscription payment not found'), { statusCode: 404 });
  }

  if (claim === 'rejected_terminal') {
    const existing = await getViewerSubscription(params.userId);
    return { subscription: existing, applied: false, alreadyApplied: false };
  }

  const subscription = await applyRebindPaymentMethod(
    params.userId,
    params.paymentMethodId,
    params.paymentMethodTitle
  );

  if (!subscription) {
    throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
  }

  return {
    subscription,
    applied: claim === 'claimed',
    alreadyApplied: claim === 'already_succeeded',
  };
}

export async function processRebindSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): Promise<ProcessRebindSubscriptionProviderPaymentResult> {
  const kind = providerPaymentKind(payment);
  if (!isRebindSubscriptionPaymentKind(kind)) {
    throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
  }

  const validation = validateRebindSubscriptionPayment({
    productType: metaString(payment.metadata, 'productType'),
    userId: metaString(payment.metadata, 'userId'),
    kind,
    amountValue: payment.amount.value,
    currency: payment.amount.currency,
    amountsEqual,
  });

  if (!validation.valid) {
    throw Object.assign(new Error(`Invalid rebind payment: ${validation.reason}`), {
      statusCode: 400,
    });
  }

  if (metaString(payment.metadata, 'userId') !== userId) {
    throw Object.assign(new Error('Payment user mismatch'), { statusCode: 403 });
  }

  const existing = await getViewerSubscription(userId);
  if (!existing) {
    throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
  }

  if (payment.status === 'succeeded') {
    const paymentMethodId = resolvePaymentMethodIdFromRebindPayment(payment, options);
    if (!paymentMethodId) {
      throw Object.assign(new Error('Payment method was not saved'), {
        statusCode: 400,
        code: 'PAYMENT_METHOD_NOT_SAVED',
      });
    }

    const paymentMethodTitle = resolvePaymentMethodTitleFromRebindPayment(payment, options);

    const { applied, alreadyApplied } = await fulfillRebindSubscriptionPayment({
      userId,
      providerPaymentId: payment.id,
      paymentMethodId,
      paymentMethodTitle,
    });

    return {
      paymentMethodUpdated: applied || alreadyApplied,
      alreadyApplied,
    };
  }

  if (payment.status === 'canceled') {
    await updateSubscriptionPaymentStatus(payment.id, 'canceled');
  } else if (payment.status === 'waiting_for_capture') {
    await updateSubscriptionPaymentStatus(payment.id, 'waiting_for_capture');
  } else if (payment.status === 'pending') {
    await updateSubscriptionPaymentStatus(payment.id, 'pending');
  }

  return { paymentMethodUpdated: false, alreadyApplied: false };
}

export async function processRebindSubscriptionProviderPaymentWithArchive(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): Promise<
  ProcessRebindSubscriptionProviderPaymentResult & {
    archive?: Awaited<ReturnType<typeof getMyArchiveForUser>>;
  }
> {
  const result = await processRebindSubscriptionProviderPayment(payment, userId, options);
  if (!result.paymentMethodUpdated) {
    return result;
  }

  const archive = await getMyArchiveForUser(userId);
  return { ...result, archive };
}

export function isPremiumRebindNotification(
  metadata: Record<string, unknown> | undefined
): boolean {
  return (
    metaString(metadata, 'productType') === PREMIUM_SUBSCRIPTION_PRODUCT_TYPE &&
    metaString(metadata, 'kind') === SUBSCRIPTION_PAYMENT_KIND_REBIND
  );
}
