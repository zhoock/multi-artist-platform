import crypto from 'node:crypto';

import { query } from './db';
import { devPaymentRawMarker, isDevPaymentModeEnabled } from './dev-payment-mode';

export type CompleteDevAlbumPaymentInput = {
  orderId: string;
  amount: number;
};

export type AttachDevSucceededSubscriptionCheckoutInput = {
  subscriptionPaymentId: string;
};

/**
 * Dev-only: persist a succeeded album payment linked to the order (no fulfillment).
 * Fulfillment runs in get-payment-status via applyAlbumPaymentSuccess — same as production.
 */
export async function completeDevAlbumPayment(
  input: CompleteDevAlbumPaymentInput
): Promise<{ paymentId: string }> {
  if (!isDevPaymentModeEnabled()) {
    throw new Error('completeDevAlbumPayment called while dev payment mode is disabled');
  }

  const paymentId = crypto.randomUUID();
  const amountStr = input.amount.toFixed(2);
  const rawDevMarker = JSON.stringify(devPaymentRawMarker());

  await query(
    `INSERT INTO payments (
      order_id, provider, provider_payment_id, status, amount, currency, raw_last_event
    ) VALUES ($1, 'yookassa', $2, 'succeeded', $3, 'RUB', $4::jsonb)
    ON CONFLICT (provider, provider_payment_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      raw_last_event = EXCLUDED.raw_last_event,
      updated_at = CURRENT_TIMESTAMP`,
    [input.orderId, paymentId, amountStr, rawDevMarker]
  );

  await query(
    `UPDATE orders
     SET payment_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [paymentId, input.orderId]
  );

  return { paymentId };
}

/**
 * Dev-only: mark subscription checkout payment succeeded (no fulfillment).
 * Fulfillment runs in get-subscription-payment-status via fulfillSubscriptionPayment.
 */
export async function attachDevSucceededSubscriptionCheckout(
  input: AttachDevSucceededSubscriptionCheckoutInput
): Promise<{ paymentId: string }> {
  if (!isDevPaymentModeEnabled()) {
    throw new Error(
      'attachDevSucceededSubscriptionCheckout called while dev payment mode is disabled'
    );
  }

  const paymentId = crypto.randomUUID();
  const rawDevMarker = JSON.stringify(devPaymentRawMarker());

  const updated = await query<{ id: string }>(
    `UPDATE subscription_payments
     SET provider_payment_id = $2,
         status = 'succeeded',
         raw_last_event = COALESCE(raw_last_event, '{}'::jsonb) || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id`,
    [input.subscriptionPaymentId, paymentId, rawDevMarker]
  );

  if (!updated.rows[0]?.id) {
    throw new Error('Subscription payment row not found');
  }

  return { paymentId };
}
