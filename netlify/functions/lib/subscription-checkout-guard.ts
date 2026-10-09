/**
 * Checkout guard helpers (I-P6): block duplicate open checkouts, release abandoned rows.
 */

import { isDevMarkedPayment } from './dev-payment-mode';
import {
  claimSubscriptionPaymentCanceled,
  findOpenCheckoutSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
  releaseAbandonedCheckoutPayments,
} from './subscription-billing';
import { processSubscriptionProviderPaymentForRow } from './subscription-payment-router';
import { mapYooKassaPaymentToProviderPayment } from './subscription-provider-payment';
import { getYooKassaEnvCredentials } from './yookassa-env';
import { fetchPaymentFromYooKassaApi } from './yookassa-webhook-verify';

export type OpenCheckoutResolution =
  | { type: 'none' }
  | {
      type: 'in_progress';
      subscriptionPaymentId: string;
      providerPaymentId: string | null;
      confirmationUrl: string | null;
    }
  | {
      type: 'recovered';
      subscriptionPaymentId: string;
      providerPaymentId: string;
      subscriptionActivated: boolean;
    };

/**
 * Release abandoned rows, sync a canceled provider payment, or fulfill a
 * succeeded provider payment that never updated local state.
 * Does not create a new YooKassa payment.
 */
export async function resolveOpenSubscriptionCheckout(
  userId: string
): Promise<OpenCheckoutResolution> {
  await releaseAbandonedCheckoutPayments(userId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const open = await findOpenCheckoutSubscriptionPayment(userId);
    if (!open) return { type: 'none' };

    const row = await getSubscriptionPaymentByInternalId(open.id, userId);
    if (!row) return { type: 'none' };

    const providerPaymentId = row.provider_payment_id?.trim() || null;
    if (!providerPaymentId || isDevMarkedPayment(row.raw_last_event)) {
      return {
        type: 'in_progress',
        subscriptionPaymentId: row.id,
        providerPaymentId,
        confirmationUrl: null,
      };
    }

    const creds = getYooKassaEnvCredentials();
    if (!creds) {
      return {
        type: 'in_progress',
        subscriptionPaymentId: row.id,
        providerPaymentId,
        confirmationUrl: null,
      };
    }

    let api: Awaited<ReturnType<typeof fetchPaymentFromYooKassaApi>>;
    try {
      api = await fetchPaymentFromYooKassaApi(providerPaymentId, creds.shopId, creds.secretKey);
    } catch {
      return {
        type: 'in_progress',
        subscriptionPaymentId: row.id,
        providerPaymentId,
        confirmationUrl: null,
      };
    }

    if (!api.ok) {
      return {
        type: 'in_progress',
        subscriptionPaymentId: row.id,
        providerPaymentId,
        confirmationUrl: null,
      };
    }

    if (api.payment.status === 'canceled') {
      const claim = await claimSubscriptionPaymentCanceled(providerPaymentId, userId);
      if (claim === 'claimed' || claim === 'already_terminal') continue;
      return {
        type: 'in_progress',
        subscriptionPaymentId: row.id,
        providerPaymentId,
        confirmationUrl: null,
      };
    }

    if (api.payment.status === 'succeeded') {
      const providerPayment = mapYooKassaPaymentToProviderPayment(api.payment);
      if (providerPayment) {
        try {
          const result = await processSubscriptionProviderPaymentForRow(
            providerPayment,
            userId,
            row.kind,
            {
              observabilitySource: 'poll',
              subscriptionPaymentId: row.id,
              devMarkedPayment: false,
            }
          );
          if ('subscriptionActivated' in result && result.subscriptionActivated) {
            return {
              type: 'recovered',
              subscriptionPaymentId: row.id,
              providerPaymentId,
              subscriptionActivated: true,
            };
          }
        } catch (error) {
          console.error(
            '[subscription-checkout] succeeded payment recovery failed',
            error instanceof Error ? error.message : 'unknown'
          );
        }
      }
      return {
        type: 'in_progress',
        subscriptionPaymentId: row.id,
        providerPaymentId,
        confirmationUrl: null,
      };
    }

    const confirmation = (
      api.payment as { confirmation?: { confirmation_url?: string } }
    ).confirmation?.confirmation_url?.trim();

    return {
      type: 'in_progress',
      subscriptionPaymentId: row.id,
      providerPaymentId,
      confirmationUrl: confirmation || null,
    };
  }

  return { type: 'none' };
}

/**
 * Returns a blocking open checkout payment, releasing orphan pending rows first.
 * A succeeded provider payment is fulfilled here and does not stay blocking.
 */
export async function findBlockingCheckoutPayment(userId: string): Promise<{ id: string } | null> {
  const resolution = await resolveOpenSubscriptionCheckout(userId);
  if (resolution.type === 'in_progress') {
    return { id: resolution.subscriptionPaymentId };
  }
  return null;
}
