import crypto from 'node:crypto';

import { query } from './db';
import { devPaymentRawMarker, isDevPaymentModeEnabled } from './dev-payment-mode';

export type CompleteDevAlbumPaymentInput = {
  orderId: string;
  amount: number;
};

/**
 * Dev-only: persist a succeeded payment linked to the order (no fulfillment).
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
