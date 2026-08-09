/**
 * Shared album payment fulfillment after provider reports a terminal status.
 * Used by get-payment-status (YooKassa poll) and dev payment mode (local skip).
 */

import { query } from './db';
import { applyAlbumPaymentSucceededFulfillment } from './fulfill-album-purchase';

export type AlbumPaymentStatusPayload = {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  metadata?: {
    orderId?: string;
    albumId?: string;
    customerEmail?: string;
    [key: string]: string | undefined;
  };
};

/**
 * Updates order + payment rows and runs purchase/email side effects (idempotent).
 */
export async function applyAlbumPaymentSuccess(
  paymentStatus: AlbumPaymentStatusPayload
): Promise<boolean> {
  const orderId = paymentStatus.metadata?.orderId;
  if (!orderId) {
    console.warn('⚠️ No orderId in payment metadata, skipping DB update');
    return false;
  }

  try {
    const isSucceeded = paymentStatus.status === 'succeeded' || paymentStatus.paid;

    if (isSucceeded) {
      await applyAlbumPaymentSucceededFulfillment({
        orderId,
        providerPaymentId: paymentStatus.id,
        paymentStatus: paymentStatus.status,
        amountValue: paymentStatus.amount.value,
        currency: paymentStatus.amount.currency,
        albumKey: paymentStatus.metadata?.albumId,
        customerEmail: paymentStatus.metadata?.customerEmail,
      });

      console.log(
        `✅ Fulfilled paid order ${orderId} and payment ${paymentStatus.id} (transactional)`
      );
      return true;
    }

    let orderStatus: string;
    if (paymentStatus.status === 'canceled') {
      orderStatus = 'canceled';
    } else {
      orderStatus = 'pending_payment';
    }

    await query(
      `UPDATE orders 
       SET status = $1::text, 
           payment_id = $2,
           paid_at = CASE WHEN $1::text = 'paid' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [orderStatus, paymentStatus.id, orderId]
    );

    await query(
      `INSERT INTO payments (
        order_id, provider, provider_payment_id, status, amount, currency
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (provider, provider_payment_id) 
      DO UPDATE SET 
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP`,
      [
        orderId,
        'yookassa',
        paymentStatus.id,
        paymentStatus.status,
        paymentStatus.amount.value,
        paymentStatus.amount.currency,
      ]
    );

    console.log(
      `✅ Updated order ${orderId} and payment ${paymentStatus.id} to status: ${orderStatus}`
    );
    return true;
  } catch (error) {
    console.error('❌ Error updating order and payment status:', error);
    return false;
  }
}
