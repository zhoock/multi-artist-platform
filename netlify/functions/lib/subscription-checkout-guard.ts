/**
 * Checkout guard helpers (I-P6): block duplicate open checkouts, release abandoned rows.
 */

import { isDevPaymentModeEnabled } from './dev-payment-mode';
import {
  claimSubscriptionPaymentCanceled,
  findOpenCheckoutSubscriptionPayment,
  getSubscriptionPaymentByInternalId,
  releaseAbandonedCheckoutPayments,
} from './subscription-billing';
import { getYooKassaEnvCredentials } from './yookassa-env';
import { fetchPaymentFromYooKassaApi } from './yookassa-webhook-verify';

/**
 * Returns a blocking open checkout payment, releasing orphan pending rows first.
 * Optionally syncs a canceled YooKassa payment so the user can start a new checkout.
 */
export async function findBlockingCheckoutPayment(userId: string): Promise<{ id: string } | null> {
  await releaseAbandonedCheckoutPayments(userId);

  let open = await findOpenCheckoutSubscriptionPayment(userId);
  if (!open) return null;

  const released = await reconcileCanceledCheckoutPaymentWithProvider(userId, open.id);
  if (released) {
    open = await findOpenCheckoutSubscriptionPayment(userId);
  }

  return open;
}

async function reconcileCanceledCheckoutPaymentWithProvider(
  userId: string,
  subscriptionPaymentId: string
): Promise<boolean> {
  if (isDevPaymentModeEnabled()) return false;

  const row = await getSubscriptionPaymentByInternalId(subscriptionPaymentId, userId);
  const providerPaymentId = row?.provider_payment_id?.trim();
  if (!providerPaymentId) return false;

  const creds = getYooKassaEnvCredentials();
  if (!creds) return false;

  try {
    const api = await fetchPaymentFromYooKassaApi(providerPaymentId, creds);
    if (api.status !== 'canceled') return false;
    const claim = await claimSubscriptionPaymentCanceled(providerPaymentId, userId);
    return claim === 'claimed' || claim === 'already_terminal';
  } catch {
    return false;
  }
}
