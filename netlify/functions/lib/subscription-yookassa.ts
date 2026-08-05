/**
 * YooKassa payload helpers for Premium subscription checkout (PR-3).
 */

import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';

/** Must match PREMIUM_SUBSCRIPTION_PRODUCT_TYPE in subscription-billing.ts */
const PREMIUM_SUBSCRIPTION_PRODUCT_TYPE = 'premium_subscription';

export const SUBSCRIPTION_PAYMENT_KIND_INITIAL = 'initial';
export const SUBSCRIPTION_PAYMENT_KIND_UPGRADE = 'upgrade';
export const SUBSCRIPTION_PAYMENT_KIND_RENEWAL = 'renewal';
export const SUBSCRIPTION_PAYMENT_KIND_REBIND = 'rebind';

export interface BuildInitialSubscriptionPaymentPayloadParams {
  amountValue: string;
  description: string;
  returnUrl: string;
  userId: string;
  planSlug: string;
  customerEmail: string;
}

export interface YooKassaPaymentMethodShape {
  id?: string;
  saved?: boolean;
  type?: string;
}

export interface YooKassaPaymentWithMethod {
  id: string;
  payment_method?: YooKassaPaymentMethodShape | null;
}

/** Builds POST /v3/payments body for first Premium checkout. */
export function buildInitialSubscriptionPaymentPayload(
  params: BuildInitialSubscriptionPaymentPayloadParams
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    amount: { value: params.amountValue, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description,
    metadata: {
      productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
      userId: params.userId,
      plan: params.planSlug,
      kind: SUBSCRIPTION_PAYMENT_KIND_INITIAL,
    },
    receipt: {
      customer: { email: params.customerEmail },
      items: [
        {
          description: params.description,
          quantity: '1',
          amount: { value: params.amountValue, currency: 'RUB' },
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment',
        },
      ],
    },
  };

  if (isSubscriptionAutoRenewEnabled()) {
    payload.save_payment_method = true;
  }

  return payload;
}

export interface BuildUpgradeSubscriptionPaymentPayloadParams {
  amountValue: string;
  description: string;
  returnUrl: string;
  userId: string;
  planSlug: string;
  customerEmail: string;
}

/** Builds POST /v3/payments body for Premium plan upgrade checkout (PR-6). */
export function buildUpgradeSubscriptionPaymentPayload(
  params: BuildUpgradeSubscriptionPaymentPayloadParams
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    amount: { value: params.amountValue, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description,
    metadata: {
      productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
      userId: params.userId,
      plan: params.planSlug,
      kind: SUBSCRIPTION_PAYMENT_KIND_UPGRADE,
    },
    receipt: {
      customer: { email: params.customerEmail },
      items: [
        {
          description: params.description,
          quantity: '1',
          amount: { value: params.amountValue, currency: 'RUB' },
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment',
        },
      ],
    },
  };

  if (isSubscriptionAutoRenewEnabled()) {
    payload.save_payment_method = true;
  }

  return payload;
}

export interface BuildRebindSubscriptionPaymentPayloadParams {
  amountValue: string;
  description: string;
  returnUrl: string;
  userId: string;
  planSlug: string;
  customerEmail: string;
}

/** Builds POST /v3/payments body for payment-method rebind (PR-9). */
export function buildRebindSubscriptionPaymentPayload(
  params: BuildRebindSubscriptionPaymentPayloadParams
): Record<string, unknown> {
  return {
    amount: { value: params.amountValue, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description,
    save_payment_method: true,
    metadata: {
      productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
      userId: params.userId,
      plan: params.planSlug,
      kind: SUBSCRIPTION_PAYMENT_KIND_REBIND,
    },
    receipt: {
      customer: { email: params.customerEmail },
      items: [
        {
          description: params.description,
          quantity: '1',
          amount: { value: params.amountValue, currency: 'RUB' },
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment',
        },
      ],
    },
  };
}

export interface BuildRenewalSubscriptionPaymentPayloadParams {
  amountValue: string;
  description: string;
  userId: string;
  planSlug: string;
  customerEmail: string;
  paymentMethodId: string;
}

/** Builds POST /v3/payments body for merchant-initiated Premium renewal (PR-7). */
export function buildRenewalSubscriptionPaymentPayload(
  params: BuildRenewalSubscriptionPaymentPayloadParams
): Record<string, unknown> {
  return {
    amount: { value: params.amountValue, currency: 'RUB' },
    capture: true,
    payment_method_id: params.paymentMethodId,
    description: params.description,
    metadata: {
      productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
      userId: params.userId,
      plan: params.planSlug,
      kind: SUBSCRIPTION_PAYMENT_KIND_RENEWAL,
    },
    receipt: {
      customer: { email: params.customerEmail },
      items: [
        {
          description: params.description,
          quantity: '1',
          amount: { value: params.amountValue, currency: 'RUB' },
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment',
        },
      ],
    },
  };
}

/** Returns YooKassa payment_method.id when the method was saved for autopayments. */
export function extractSavedPaymentMethodId(payment: YooKassaPaymentWithMethod): string | null {
  const paymentMethod = payment.payment_method;
  if (!paymentMethod?.id?.trim()) return null;
  if (paymentMethod.saved !== true) return null;
  return paymentMethod.id.trim();
}

/** Stable dev mock PM id when DEV_PAYMENT_MODE skips YooKassa. */
export function devMockPaymentMethodId(providerPaymentId: string): string {
  return `dev-pm-${providerPaymentId}`;
}
