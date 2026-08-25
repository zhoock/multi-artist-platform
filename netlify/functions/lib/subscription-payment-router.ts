/**
 * Routes subscription provider payments to initial, upgrade, or renewal processors (PR-6 / PR-7).
 * PR-10.3: observability at fulfillment boundary.
 */

import { isInitialSubscriptionPaymentKind } from './subscription-fulfillment';
import type { SubscriptionProviderPayment } from './subscription-provider-payment';
import { providerPaymentKind } from './subscription-provider-payment';
import {
  beginSubscriptionFulfillmentObservability,
  recordSubscriptionFulfillmentError,
  recordSubscriptionFulfillmentOutcome,
} from './subscription-observability-fulfillment';
import { DEFAULT_SUBSCRIPTION_PLAN } from './subscription-billing';
import { checkBillingMutationAllowed } from './subscription-billing-origin';
import { logSubscriptionEvent, SUBSCRIPTION_LOG_EVENTS } from './subscription-observability';
import { getViewerSubscription } from './subscriptions';
import {
  isRenewalSubscriptionPaymentKind,
  processRenewalSubscriptionProviderPayment,
  type ProcessRenewalSubscriptionProviderPaymentOptions,
  type ProcessRenewalSubscriptionProviderPaymentResult,
} from './subscription-renewal-fulfillment';
import {
  isUpgradeSubscriptionPaymentKind,
  processUpgradeSubscriptionProviderPayment,
  type ProcessUpgradeSubscriptionProviderPaymentOptions,
  type ProcessUpgradeSubscriptionProviderPaymentResult,
} from './subscription-upgrade-fulfillment';
import {
  isRebindSubscriptionPaymentKind,
  processRebindSubscriptionProviderPayment,
  type ProcessRebindSubscriptionProviderPaymentResult,
} from './subscription-rebind-fulfillment';
import {
  processInitialSubscriptionProviderPayment,
  type ProcessInitialSubscriptionProviderPaymentOptions,
  type ProcessInitialSubscriptionProviderPaymentResult,
} from './subscription-fulfillment';
import type { SubscriptionObservabilitySource } from './subscription-observability';

export type ProcessSubscriptionProviderPaymentResult =
  | ProcessInitialSubscriptionProviderPaymentResult
  | ProcessUpgradeSubscriptionProviderPaymentResult
  | ProcessRenewalSubscriptionProviderPaymentResult
  | ProcessRebindSubscriptionProviderPaymentResult;

export type ProcessSubscriptionProviderPaymentOptions =
  ProcessInitialSubscriptionProviderPaymentOptions &
    ProcessUpgradeSubscriptionProviderPaymentOptions &
    ProcessRenewalSubscriptionProviderPaymentOptions & {
      observabilitySource?: SubscriptionObservabilitySource;
      subscriptionPaymentId?: string;
    };

async function dispatchSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  kind: string | null | undefined,
  options: ProcessSubscriptionProviderPaymentOptions
): Promise<ProcessSubscriptionProviderPaymentResult> {
  if (isRebindSubscriptionPaymentKind(kind)) {
    return processRebindSubscriptionProviderPayment(payment, userId, options);
  }

  if (isRenewalSubscriptionPaymentKind(kind)) {
    return processRenewalSubscriptionProviderPayment(payment, userId, options);
  }

  if (isUpgradeSubscriptionPaymentKind(kind)) {
    return processUpgradeSubscriptionProviderPayment(payment, userId, options);
  }

  if (isInitialSubscriptionPaymentKind(kind)) {
    return processInitialSubscriptionProviderPayment(payment, userId, options);
  }

  throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
}

function buildBillingOriginSkipResult(
  kind: string | null | undefined,
  planSlug = DEFAULT_SUBSCRIPTION_PLAN
): ProcessSubscriptionProviderPaymentResult {
  if (isRebindSubscriptionPaymentKind(kind)) {
    return { paymentMethodUpdated: false, alreadyApplied: false, staleAfterUnlink: false };
  }
  if (isRenewalSubscriptionPaymentKind(kind)) {
    return { subscriptionRenewed: false, alreadyFulfilled: false, planSlug };
  }
  return { subscriptionActivated: false, alreadyFulfilled: false, planSlug };
}

async function processWithObservability(
  payment: SubscriptionProviderPayment,
  userId: string,
  kind: string | null | undefined,
  options: ProcessSubscriptionProviderPaymentOptions
): Promise<ProcessSubscriptionProviderPaymentResult> {
  const resolvedKind = kind?.trim() || 'initial';
  const source = options.observabilitySource ?? 'poll';

  beginSubscriptionFulfillmentObservability({
    userId,
    kind: resolvedKind,
    source,
    providerPaymentId: payment.id,
    subscriptionPaymentId: options.subscriptionPaymentId,
    paymentStatus: payment.status,
  });

  const subscription = await getViewerSubscription(userId);
  const billingGuard = checkBillingMutationAllowed(subscription);
  if (!billingGuard.allowed) {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_REJECTED,
      {
        kind: resolvedKind,
        source,
        reason: billingGuard.reason,
        billingOrigin: subscription?.billingOrigin ?? null,
      },
      'warn'
    );
    const skipResult = buildBillingOriginSkipResult(
      kind,
      payment.metadata?.plan?.trim() || DEFAULT_SUBSCRIPTION_PLAN
    );
    recordSubscriptionFulfillmentOutcome(resolvedKind, source, skipResult);
    return skipResult;
  }

  try {
    const result = await dispatchSubscriptionProviderPayment(payment, userId, kind, options);
    recordSubscriptionFulfillmentOutcome(resolvedKind, source, result);
    return result;
  } catch (error) {
    recordSubscriptionFulfillmentError(resolvedKind, source, error);
    throw error;
  }
}

export async function processSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessSubscriptionProviderPaymentOptions = {}
): Promise<ProcessSubscriptionProviderPaymentResult> {
  const kind = providerPaymentKind(payment);
  return processWithObservability(payment, userId, kind, options);
}

export function resolveSubscriptionPaymentKindFromRow(
  rowKind: string | null | undefined,
  payment: SubscriptionProviderPayment
): string | null | undefined {
  return rowKind?.trim() || providerPaymentKind(payment);
}

export async function processSubscriptionProviderPaymentForRow(
  payment: SubscriptionProviderPayment,
  userId: string,
  rowKind: string | null | undefined,
  options: ProcessSubscriptionProviderPaymentOptions = {}
): Promise<ProcessSubscriptionProviderPaymentResult> {
  const kind = resolveSubscriptionPaymentKindFromRow(rowKind, payment);
  return processWithObservability(payment, userId, kind, options);
}
