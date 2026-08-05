/**
 * Premium subscription branch for YooKassa payment-webhook.
 * Album purchases continue through the existing order-based handler.
 */

import type { HandlerEvent } from '@netlify/functions';
import { query } from './db';
import { getYooKassaEnvCredentials } from './yookassa-env';
import {
  amountsEqual,
  expectedStatusForEvent,
  fetchPaymentFromYooKassaApi,
  getClientIpFromEvent,
  isNotificationIpAllowed,
  metaString,
} from './yookassa-webhook-verify';
import { mapYooKassaPaymentToProviderPayment } from './subscription-provider-payment';
import { providerPaymentKind } from './subscription-provider-payment';
import { processSubscriptionProviderPayment } from './subscription-payment-router';
import { isRenewalSubscriptionPaymentKind } from './subscription-renewal-fulfillment';
import { isRebindSubscriptionPaymentKind } from './subscription-rebind-fulfillment';
import {
  PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
  updateSubscriptionPaymentStatus,
  validatePremiumSubscriptionPayment,
  validateRebindSubscriptionPayment,
} from './subscription-billing';

interface PaymentWebhookBody {
  type: string;
  event: string;
  object: {
    id: string;
    status: string;
    amount: { value: string; currency: string };
    metadata?: Record<string, string | undefined>;
  };
}

interface WebhookResponse {
  success: boolean;
  processed?: boolean;
  duplicate?: boolean;
  message?: string;
}

const PROCESSED_EVENTS = new Set([
  'payment.succeeded',
  'payment.canceled',
  'payment.waiting_for_capture',
]);

function jsonResponse(statusCode: number, body: WebhookResponse, headers: Record<string, string>) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function buildSyntheticEventId(data: PaymentWebhookBody): string {
  return `${data.type}-${data.event}-${data.object.id}`;
}

async function reserveWebhookEvent(
  eventId: string,
  eventType: string,
  paymentId: string
): Promise<boolean> {
  const ins = await query<{ id: string }>(
    `INSERT INTO webhook_events (provider, event_id, event_type, payment_id)
     VALUES ('yookassa', $1, $2, $3)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [eventId, eventType, paymentId]
  );
  return ins.rows.length > 0;
}

async function releaseWebhookEvent(eventId: string): Promise<void> {
  await query(`DELETE FROM webhook_events WHERE provider = 'yookassa' AND event_id = $1`, [
    eventId,
  ]);
}

function isPremiumSubscriptionNotification(data: PaymentWebhookBody): boolean {
  return metaString(data.object?.metadata, 'productType') === PREMIUM_SUBSCRIPTION_PRODUCT_TYPE;
}

/**
 * Returns a Netlify response if this notification is handled as Premium subscription;
 * returns null to fall through to album order webhook logic.
 */
export async function handlePremiumSubscriptionWebhookIfApplicable(
  event: HandlerEvent,
  data: PaymentWebhookBody,
  headers: Record<string, string>
): Promise<{ statusCode: number; headers: Record<string, string>; body: string } | null> {
  if (!isPremiumSubscriptionNotification(data)) {
    return null;
  }

  const clientIp = getClientIpFromEvent(event);
  const skipIpCheck = process.env.SKIP_YOOKASSA_WEBHOOK_IP_CHECK === 'true';
  const allowUnknownIp = process.env.NETLIFY_DEV === 'true';

  if (data.type !== 'notification') {
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Ignored: not a notification' },
      headers
    );
  }

  if (!data.object?.id) {
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Ignored: missing payment id' },
      headers
    );
  }

  if (!PROCESSED_EVENTS.has(data.event)) {
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Event type not handled' },
      headers
    );
  }

  if (!isNotificationIpAllowed(clientIp, { skip: skipIpCheck, allowUnknownIp })) {
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: client IP' },
      headers
    );
  }

  const expected = expectedStatusForEvent(data.event);
  if (!expected) {
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'No expected status mapping' },
      headers
    );
  }

  const yookassaCreds = getYooKassaEnvCredentials();
  if (!yookassaCreds) {
    console.error('[subscription-webhook] YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY missing');
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: YooKassa env credentials' },
      headers
    );
  }

  const apiResult = await fetchPaymentFromYooKassaApi(
    data.object.id,
    yookassaCreds.shopId,
    yookassaCreds.secretKey
  );

  if (!apiResult.ok) {
    const retryable = apiResult.status === 0 || apiResult.status >= 500 || apiResult.status === 429;
    return jsonResponse(
      retryable ? 503 : 200,
      {
        success: !retryable,
        processed: false,
        message: retryable ? 'YooKassa API temporarily unavailable' : 'API verification failed',
      },
      headers
    );
  }

  const api = apiResult.payment;

  if (api.status !== expected) {
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: payment status mismatch' },
      headers
    );
  }

  const productType = metaString(api.metadata, 'productType');
  const userId = metaString(api.metadata, 'userId');
  const plan = metaString(api.metadata, 'plan');
  const kind = metaString(api.metadata, 'kind');

  const paymentValidation = isRebindSubscriptionPaymentKind(kind)
    ? validateRebindSubscriptionPayment({
        productType,
        userId,
        kind,
        amountValue: api.amount.value,
        currency: api.amount.currency,
        amountsEqual,
      })
    : validatePremiumSubscriptionPayment({
        productType,
        userId,
        plan,
        amountValue: api.amount.value,
        currency: api.amount.currency,
        amountsEqual,
      });

  if (!paymentValidation.valid) {
    return jsonResponse(
      200,
      {
        success: true,
        processed: false,
        message: `Verification failed: ${paymentValidation.reason}`,
      },
      headers
    );
  }

  const syntheticId = buildSyntheticEventId(data);
  const reserved = await reserveWebhookEvent(syntheticId, data.event, data.object.id);
  if (!reserved) {
    return jsonResponse(
      200,
      { success: true, processed: false, duplicate: true, message: 'Event already processed' },
      headers
    );
  }

  try {
    if (data.event === 'payment.succeeded') {
      const providerPayment = mapYooKassaPaymentToProviderPayment(api);
      if (!providerPayment) {
        return jsonResponse(
          200,
          { success: true, processed: false, message: 'Unsupported payment status' },
          headers
        );
      }
      await processSubscriptionProviderPayment(providerPayment, userId);
    } else if (data.event === 'payment.canceled') {
      const providerPayment = mapYooKassaPaymentToProviderPayment(api);
      if (
        providerPayment &&
        (isRenewalSubscriptionPaymentKind(providerPaymentKind(providerPayment)) ||
          isRebindSubscriptionPaymentKind(providerPaymentKind(providerPayment)))
      ) {
        await processSubscriptionProviderPayment(providerPayment, userId);
      } else {
        await updateSubscriptionPaymentStatus(api.id, 'canceled');
      }
    } else if (data.event === 'payment.waiting_for_capture') {
      await updateSubscriptionPaymentStatus(api.id, 'waiting_for_capture');
    }

    console.log('[subscription-webhook] processed', {
      event: data.event,
      userIdSuffix: `…${userId.slice(-6)}`,
      paymentIdSuffix: `…${api.id.slice(-6)}`,
    });

    return jsonResponse(
      200,
      { success: true, processed: true, message: 'Premium subscription webhook processed' },
      headers
    );
  } catch (error) {
    await releaseWebhookEvent(syntheticId);
    console.error('[subscription-webhook] processing error', error);
    return jsonResponse(
      503,
      { success: false, processed: false, message: 'Processing error; will retry' },
      headers
    );
  }
}
