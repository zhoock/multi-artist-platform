/**
 * Routes subscription provider payments to initial, upgrade, or renewal processors (PR-6 / PR-7).
 */

import { isInitialSubscriptionPaymentKind } from './subscription-fulfillment';
import type { SubscriptionProviderPayment } from './subscription-provider-payment';
import { providerPaymentKind } from './subscription-provider-payment';
import {
  isRenewalSubscriptionPaymentKind,
  processRenewalSubscriptionProviderPayment,
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

export type ProcessSubscriptionProviderPaymentResult =
  | ProcessInitialSubscriptionProviderPaymentResult
  | ProcessUpgradeSubscriptionProviderPaymentResult
  | ProcessRenewalSubscriptionProviderPaymentResult
  | ProcessRebindSubscriptionProviderPaymentResult;

export type ProcessSubscriptionProviderPaymentOptions =
  ProcessInitialSubscriptionProviderPaymentOptions &
    ProcessUpgradeSubscriptionProviderPaymentOptions;

export async function processSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessSubscriptionProviderPaymentOptions = {}
): Promise<ProcessSubscriptionProviderPaymentResult> {
  const kind = providerPaymentKind(payment);

  if (isRebindSubscriptionPaymentKind(kind)) {
    return processRebindSubscriptionProviderPayment(payment, userId, options);
  }

  if (isRenewalSubscriptionPaymentKind(kind)) {
    return processRenewalSubscriptionProviderPayment(payment, userId);
  }

  if (isUpgradeSubscriptionPaymentKind(kind)) {
    return processUpgradeSubscriptionProviderPayment(payment, userId, options);
  }

  if (isInitialSubscriptionPaymentKind(kind)) {
    return processInitialSubscriptionProviderPayment(payment, userId, options);
  }

  throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
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

  if (isRebindSubscriptionPaymentKind(kind)) {
    return processRebindSubscriptionProviderPayment(payment, userId, options);
  }

  if (isRenewalSubscriptionPaymentKind(kind)) {
    return processRenewalSubscriptionProviderPayment(payment, userId);
  }

  if (isUpgradeSubscriptionPaymentKind(kind)) {
    return processUpgradeSubscriptionProviderPayment(payment, userId, options);
  }

  if (isInitialSubscriptionPaymentKind(kind)) {
    return processInitialSubscriptionProviderPayment(payment, userId, options);
  }

  throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
}
