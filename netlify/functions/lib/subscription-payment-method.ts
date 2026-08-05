/**
 * Payment method display + persistence (PR-9).
 */

import type { SubscriptionProviderPaymentMethod } from './subscription-provider-payment';

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'MasterCard',
  mir: 'Mir',
  maestro: 'Maestro',
  unionpay: 'UnionPay',
  jcb: 'JCB',
  american_express: 'American Express',
  diners_club: 'Diners Club',
};

export function normalizeCardBrandLabel(cardType: string | null | undefined): string {
  if (!cardType?.trim()) return 'Card';
  const key = cardType.trim().toLowerCase().replace(/\s+/g, '_');
  return CARD_BRAND_LABELS[key] ?? cardType.trim();
}

export function formatPaymentMethodTitleFromCard(params: {
  cardType?: string | null;
  last4?: string | null;
}): string | null {
  const last4 = params.last4?.trim();
  if (!last4 || !/^\d{4}$/.test(last4)) return null;
  const brand = normalizeCardBrandLabel(params.cardType);
  return `${brand} •••• ${last4}`;
}

export function formatPaymentMethodTitle(
  paymentMethod: SubscriptionProviderPaymentMethod | null | undefined
): string | null {
  if (!paymentMethod?.title?.trim()) return null;
  return paymentMethod.title.trim();
}

/** Dev-only stable mask for local rebind flows. */
export function devMockPaymentMethodTitle(providerPaymentId: string): string {
  const suffix = providerPaymentId.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `Visa •••• ${suffix.slice(-4)}`;
}
