/**
 * Album checkout YooKassa payment helpers: amount checks and stale payment invalidation.
 */

import { query } from './db';
import { orderAmountsEqual } from './sync-pending-order-amount';
import {
  amountsEqual,
  fetchPaymentFromYooKassaApi,
  type YooKassaPaymentApiShape,
} from './yookassa-webhook-verify';

export function isAlbumCheckoutPaymentAmountCurrent(
  paymentAmount: string,
  orderAmount: number
): boolean {
  return amountsEqual(paymentAmount, orderAmount.toFixed(2));
}

export function isReusableAlbumCheckoutPayment(
  payment: YooKassaPaymentApiShape,
  orderAmount: number
): boolean {
  if (payment.status !== 'pending' && payment.status !== 'waiting_for_capture') {
    return false;
  }

  return isAlbumCheckoutPaymentAmountCurrent(payment.amount.value, orderAmount);
}

export async function cancelYooKassaAlbumPayment(
  providerPaymentId: string,
  shopId: string,
  secretKey: string
): Promise<boolean> {
  const base = (process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments').replace(
    /\/$/,
    ''
  );
  const url = `${base}/${providerPaymentId}/cancel`;
  const authHeader = Buffer.from(`${shopId.trim()}:${secretKey.trim()}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
        'Idempotence-Key': `cancel-${providerPaymentId}-${Date.now()}`,
      },
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 404) {
      return false;
    }

    console.warn('⚠️ YooKassa cancel failed for stale album payment:', {
      providerPaymentId,
      status: response.status,
    });
    return false;
  } catch (error) {
    console.warn('⚠️ Error canceling stale album payment:', error);
    return false;
  }
}

export async function markAlbumPaymentCanceled(
  orderId: string,
  providerPaymentId: string
): Promise<void> {
  await query(
    `UPDATE payments
     SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
     WHERE order_id = $1
       AND provider = 'yookassa'
       AND provider_payment_id = $2`,
    [orderId, providerPaymentId]
  );

  await query(
    `UPDATE orders
     SET payment_id = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND payment_id = $2`,
    [orderId, providerPaymentId]
  );
}

export async function invalidateStaleAlbumCheckoutPayment(
  orderId: string,
  providerPaymentId: string,
  orderAmount: number,
  shopId: string,
  secretKey: string
): Promise<'reusable' | 'invalidated' | 'unchanged'> {
  const providerResult = await fetchPaymentFromYooKassaApi(providerPaymentId, shopId, secretKey);
  if (!providerResult.ok) {
    console.warn('⚠️ Could not verify existing album payment amount:', {
      orderId,
      providerPaymentId,
      error: providerResult.error,
    });
    return 'unchanged';
  }

  const payment = providerResult.payment;
  if (isReusableAlbumCheckoutPayment(payment, orderAmount)) {
    return 'reusable';
  }

  if (payment.status === 'pending' || payment.status === 'waiting_for_capture') {
    if (!orderAmountsEqual(parseFloat(payment.amount.value), orderAmount)) {
      await cancelYooKassaAlbumPayment(providerPaymentId, shopId, secretKey);
    }
  }

  await markAlbumPaymentCanceled(orderId, providerPaymentId);
  return 'invalidated';
}
