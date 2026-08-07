/**
 * Unified provider payment DTO for Premium subscription webhook + polling (PR-3.1).
 */

import type { YooKassaPaymentApiShape } from './yookassa-webhook-verify';
import { metaString } from './yookassa-webhook-verify';
import {
  devMockPaymentMethodId,
  SUBSCRIPTION_PAYMENT_KIND_INITIAL,
  SUBSCRIPTION_PAYMENT_KIND_REBIND,
} from './subscription-yookassa';
import {
  devMockPaymentMethodTitle,
  formatPaymentMethodTitleFromCard,
} from './subscription-payment-method';
import { getPlanPriceCurrencyCode } from '../../../src/shared/lib/payment/subscriptionPlanCatalog';

const PREMIUM_SUBSCRIPTION_PRODUCT_TYPE = 'premium_subscription';

export interface SubscriptionPaymentRow {
  id: string;
  user_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount: string;
  currency: string;
  plan: string;
  kind?: string;
  raw_last_event?: unknown;
}

export type SubscriptionProviderPaymentStatus =
  | 'pending'
  | 'waiting_for_capture'
  | 'succeeded'
  | 'canceled';

export interface SubscriptionProviderPaymentMethod {
  id: string;
  saved: boolean;
  title: string | null;
}

/** Normalized YooKassa payment for subscription initial checkout. */
export interface SubscriptionProviderPayment {
  id: string;
  status: SubscriptionProviderPaymentStatus;
  amount: { value: string; currency: string };
  metadata: Record<string, string | undefined>;
  paymentMethod: SubscriptionProviderPaymentMethod | null;
  confirmationUrl?: string;
}

function normalizeProviderStatus(status: string): SubscriptionProviderPaymentStatus | null {
  switch (status) {
    case 'pending':
    case 'waiting_for_capture':
    case 'succeeded':
    case 'canceled':
      return status;
    default:
      return null;
  }
}

function mapPaymentMethod(
  raw: YooKassaPaymentApiShape['payment_method']
): SubscriptionProviderPaymentMethod | null {
  if (!raw?.id?.trim()) return null;
  const title = formatPaymentMethodTitleFromCard({
    cardType: raw.card?.card_type,
    last4: raw.card?.last4,
  });
  return {
    id: raw.id.trim(),
    saved: raw.saved === true,
    title,
  };
}

export function mapYooKassaPaymentToProviderPayment(
  api: YooKassaPaymentApiShape
): SubscriptionProviderPayment | null {
  const status = normalizeProviderStatus(api.status);
  if (!status) return null;

  const metadata: Record<string, string | undefined> = {};
  if (api.metadata && typeof api.metadata === 'object') {
    for (const [key, value] of Object.entries(api.metadata)) {
      metadata[key] = typeof value === 'string' ? value : value != null ? String(value) : undefined;
    }
  }

  const confirmation = (api as { confirmation?: { confirmation_url?: string } }).confirmation;

  return {
    id: api.id,
    status,
    amount: api.amount,
    metadata,
    paymentMethod: mapPaymentMethod(api.payment_method),
    confirmationUrl: confirmation?.confirmation_url,
  };
}

export function mapDevSubscriptionPaymentToProviderPayment(
  row: SubscriptionPaymentRow,
  providerPaymentId: string,
  options: { devMode?: boolean } = {}
): SubscriptionProviderPayment | null {
  if (!row.provider_payment_id) return null;

  const status = normalizeProviderStatus(row.status);
  if (!status) return null;

  const kind = row.kind?.trim() || SUBSCRIPTION_PAYMENT_KIND_INITIAL;
  const devPaymentMethod = options.devMode
    ? {
        id: devMockPaymentMethodId(providerPaymentId),
        saved: true,
        title: devMockPaymentMethodTitle(providerPaymentId),
      }
    : null;

  return {
    id: providerPaymentId,
    status,
    amount: {
      value: String(row.amount),
      currency: row.currency || getPlanPriceCurrencyCode(),
    },
    metadata: {
      productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
      userId: row.user_id,
      plan: row.plan,
      kind,
    },
    paymentMethod: devPaymentMethod,
  };
}

export function providerPaymentKind(payment: SubscriptionProviderPayment): string | undefined {
  return metaString(payment.metadata, 'kind');
}
