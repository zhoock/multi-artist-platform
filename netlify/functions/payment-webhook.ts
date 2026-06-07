/**
 * Netlify Serverless Function: webhook ЮKassa (multi-tenant).
 *
 * Verification flow (см. «Notification authentication» в документации YooKassa):
 * 1. Принимаем только type=notification, валидный object.id.
 * 2. Опционально проверка IP источника (диапазоны YooMoney), если не включён SKIP_YOOKASSA_WEBHOOK_IP_CHECK.
 * 3. По provider_payment_id (и метаданным) резолвим заказ и seller user_id → креды из БД (Basic Auth только этого магазина).
 * 4. GET /v3/payments/{id}: источник правды — статус, сумма, валюта, metadata заказа; сверка с нашим заказом.
 * 5. После успешной верификации — INSERT idempotency (webhook_events) с ON CONFLICT; при ошибке обработки — DELETE слот и 503 для ретраев.
 *
 * Переменные окружения:
 * - SKIP_YOOKASSA_WEBHOOK_IP_CHECK=true — только отладка/особые прокси (в prod не рекомендуется).
 * - NETLIFY_DEV=true — локально можно разрешить отсутствие client IP (наряду с IP skip при необходимости).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { query } from './lib/db';
import { upsertPurchaseRecord } from './lib/purchases';
import { resolveAlbumByKey } from './lib/resolve-album-key';
import { getDecryptedSecretKey } from './payment-settings';
import {
  amountsEqual,
  expectedStatusForEvent,
  fetchPaymentFromYooKassaApi,
  getClientIpFromEvent,
  isNotificationIpAllowed,
  metaString,
  type YooKassaPaymentApiShape,
} from './lib/yookassa-webhook-verify';
import { handlePremiumSubscriptionWebhookIfApplicable } from './lib/subscription-webhook';

interface PaymentWebhookBody {
  type: string;
  event: string;
  object: {
    id: string;
    status: string;
    amount: {
      value: string;
      currency: string;
    };
    metadata?: Record<string, string | undefined>;
    created_at?: string;
    description?: string;
    paid?: boolean;
    cancelled_at?: string;
    canceled_at?: string;
    captured_at?: string;
  };
}

interface PaymentWebhookResponse {
  success: boolean;
  processed?: boolean;
  duplicate?: boolean;
  message?: string;
}

type OrderCtx = {
  id: string;
  user_id: string;
  album_id: string;
  amount: string;
  currency: string;
  payment_id: string | null;
};

const PROCESSED_EVENTS = new Set([
  'payment.succeeded',
  'payment.canceled',
  'payment.waiting_for_capture',
]);

/** Без последних октетов / короткий префикс для безопасных логов */
function maskClientIp(raw: string | null): string {
  if (!raw) return 'none';
  const ip = raw.trim();
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  const short = ip.replace(/^::ffff:/i, '');
  if (short.length > 24) return `${short.slice(0, 24)}…`;
  return short;
}

function currenciesMatch(api: string, db: string): boolean {
  return api.trim().toUpperCase() === db.trim().toUpperCase();
}

function buildSyntheticEventId(data: PaymentWebhookBody): string {
  return `${data.type}-${data.event}-${data.object.id}`;
}

async function resolveOrderContext(
  providerPaymentId: string,
  metadata: Record<string, unknown> | undefined
): Promise<{ ok: true; order: OrderCtx } | { ok: false; reason: string }> {
  const metaOrderId = metaString(metadata, 'orderId');

  const joined = await query<OrderCtx>(
    `SELECT o.id, o.user_id::text AS user_id, o.album_id, o.amount::text AS amount, o.currency, o.payment_id
     FROM payments p
     INNER JOIN orders o ON o.id = p.order_id
     WHERE p.provider = 'yookassa' AND p.provider_payment_id = $1
     LIMIT 1`,
    [providerPaymentId]
  );

  if (joined.rows.length > 0) {
    const row = joined.rows[0];
    if (!row.user_id) return { ok: false, reason: 'missing_seller_on_order' };
    if (metaOrderId && metaOrderId !== row.id) {
      return { ok: false, reason: 'metadata_order_mismatch_with_payment_row' };
    }
    return { ok: true, order: row };
  }

  if (!metaOrderId) return { ok: false, reason: 'payment_and_order_unknown' };

  const byOrder = await query<OrderCtx>(
    `SELECT id, user_id::text AS user_id, album_id, amount::text AS amount, currency, payment_id
     FROM orders
     WHERE id = $1 AND payment_provider = 'yookassa'`,
    [metaOrderId]
  );

  if (byOrder.rows.length === 0) return { ok: false, reason: 'order_not_found' };
  const o = byOrder.rows[0];
  if (!o.user_id) return { ok: false, reason: 'missing_seller_on_order' };
  if (o.payment_id && o.payment_id !== providerPaymentId) {
    return { ok: false, reason: 'order_payment_id_mismatch' };
  }

  return { ok: true, order: o };
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

function jsonResponse(
  statusCode: number,
  body: PaymentWebhookResponse,
  headers: Record<string, string>
) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (event.httpMethod !== 'POST') {
    return jsonResponse(
      405,
      { success: false, processed: false, message: 'Method not allowed. Use POST.' },
      headers
    );
  }

  let data: PaymentWebhookBody;
  try {
    data = JSON.parse(event.body || '{}') as PaymentWebhookBody;
  } catch {
    return jsonResponse(
      400,
      { success: false, processed: false, message: 'Invalid JSON' },
      headers
    );
  }

  const clientIp = getClientIpFromEvent(event);
  const skipIpCheck = process.env.SKIP_YOOKASSA_WEBHOOK_IP_CHECK === 'true';
  const allowUnknownIp = process.env.NETLIFY_DEV === 'true';

  console.log('yookassa_webhook.received', {
    type: data.type,
    event: data.event,
    paymentIdSuffix: data.object?.id ? `…${String(data.object.id).slice(-6)}` : 'none',
    clientIpMasked: maskClientIp(clientIp),
    ipCheckSkipped: skipIpCheck,
  });

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
    console.log('yookassa_webhook.unhandled_event', { event: data.event });
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Event type not handled' },
      headers
    );
  }

  const premiumHandled = await handlePremiumSubscriptionWebhookIfApplicable(event, data, headers);
  if (premiumHandled !== null) {
    return premiumHandled;
  }

  if (!isNotificationIpAllowed(clientIp, { skip: skipIpCheck, allowUnknownIp })) {
    console.warn('yookassa_webhook.ip_rejected', { clientIpMasked: maskClientIp(clientIp) });
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

  const resolved = await resolveOrderContext(data.object.id, data.object.metadata);
  if (!resolved.ok) {
    console.warn('yookassa_webhook.tenant_resolve_failed', {
      reason: resolved.reason,
      paymentIdSuffix: `…${data.object.id.slice(-6)}`,
    });
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: order resolution' },
      headers
    );
  }

  const { order } = resolved;
  const creds = await getDecryptedSecretKey(order.user_id, 'yookassa');
  if (!creds?.shopId || !creds.secretKey) {
    console.error('yookassa_webhook.missing_seller_credentials', {
      sellerHint: `…${order.user_id.slice(-6)}`,
      orderIdSuffix: `…${order.id.slice(-6)}`,
    });
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: seller credentials' },
      headers
    );
  }

  const apiResult = await fetchPaymentFromYooKassaApi(
    data.object.id,
    creds.shopId,
    creds.secretKey
  );
  if (!apiResult.ok) {
    const retryable = apiResult.status === 0 || apiResult.status >= 500 || apiResult.status === 429;
    console.error('yookassa_webhook.api_fetch_failed', {
      httpStatus: apiResult.status,
      retryable,
      paymentIdSuffix: `…${data.object.id.slice(-6)}`,
    });
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
    console.warn('yookassa_webhook.status_mismatch', {
      event: data.event,
      expected,
      actual: api.status,
      paymentIdSuffix: `…${api.id.slice(-6)}`,
    });
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: payment status mismatch' },
      headers
    );
  }

  const apiOrderId = metaString(api.metadata, 'orderId');
  if (!apiOrderId || apiOrderId !== order.id) {
    console.warn('yookassa_webhook.order_metadata_mismatch', {
      paymentIdSuffix: `…${api.id.slice(-6)}`,
    });
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: metadata orderId' },
      headers
    );
  }

  if (
    !amountsEqual(api.amount.value, order.amount) ||
    !currenciesMatch(api.amount.currency, order.currency)
  ) {
    console.warn('yookassa_webhook.amount_mismatch', {
      paymentIdSuffix: `…${api.id.slice(-6)}`,
    });
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: amount or currency' },
      headers
    );
  }

  const apiAlbum = metaString(api.metadata, 'albumId');
  if (apiAlbum && apiAlbum !== order.album_id) {
    console.warn('yookassa_webhook.album_metadata_mismatch', {
      paymentIdSuffix: `…${api.id.slice(-6)}`,
    });
    return jsonResponse(
      200,
      { success: true, processed: false, message: 'Verification failed: album metadata' },
      headers
    );
  }

  const syntheticId = buildSyntheticEventId(data);
  const reserved = await reserveWebhookEvent(syntheticId, data.event, data.object.id);
  if (!reserved) {
    console.log('yookassa_webhook.duplicate', {
      event: data.event,
      paymentIdSuffix: `…${data.object.id.slice(-6)}`,
    });
    return jsonResponse(
      200,
      { success: true, processed: false, duplicate: true, message: 'Event already processed' },
      headers
    );
  }

  const rawForDb = JSON.stringify(api);

  try {
    if (data.event === 'payment.succeeded') {
      await handlePaymentSucceeded(api, order, rawForDb);
    } else if (data.event === 'payment.canceled') {
      await handlePaymentCanceled(api, order, rawForDb);
    } else if (data.event === 'payment.waiting_for_capture') {
      await handleWaitingForCapture(api, rawForDb);
    }

    console.log('yookassa_webhook.processed', {
      event: data.event,
      orderIdSuffix: `…${order.id.slice(-6)}`,
      paymentIdSuffix: `…${api.id.slice(-6)}`,
    });

    return jsonResponse(
      200,
      { success: true, processed: true, message: 'Webhook processed' },
      headers
    );
  } catch (e) {
    await releaseWebhookEvent(syntheticId);
    console.error('yookassa_webhook.processing_error', {
      event: data.event,
      err: e instanceof Error ? e.message : String(e),
      orderIdSuffix: `…${order.id.slice(-6)}`,
    });
    return jsonResponse(
      503,
      { success: false, processed: false, message: 'Processing error; will retry' },
      headers
    );
  }
};

async function handlePaymentSucceeded(
  api: YooKassaPaymentApiShape,
  order: OrderCtx,
  rawForDb: string
): Promise<void> {
  const payUp = await query(
    `UPDATE payments
     SET status = 'succeeded',
         updated_at = CURRENT_TIMESTAMP,
         raw_last_event = $1::jsonb
     WHERE provider = 'yookassa' AND provider_payment_id = $2`,
    [rawForDb, api.id]
  );
  if ((payUp.rowCount ?? 0) === 0) {
    throw new Error('payment_row_missing_for_webhook');
  }

  await query(
    `UPDATE orders
     SET status = 'paid',
         paid_at = COALESCE($1::timestamp, CURRENT_TIMESTAMP),
         payment_id = COALESCE(payment_id, $3),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [api.captured_at ?? null, order.id, api.id]
  );

  await tryPurchaseSideEffects(order.id, api);
}

async function handlePaymentCanceled(
  api: YooKassaPaymentApiShape,
  order: OrderCtx,
  rawForDb: string
): Promise<void> {
  const payUp = await query(
    `UPDATE payments
     SET status = 'canceled',
         updated_at = CURRENT_TIMESTAMP,
         raw_last_event = $1::jsonb
     WHERE provider = 'yookassa' AND provider_payment_id = $2`,
    [rawForDb, api.id]
  );
  if ((payUp.rowCount ?? 0) === 0) {
    throw new Error('payment_row_missing_for_webhook');
  }

  await query(
    `UPDATE orders SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [order.id]
  );
}

async function handleWaitingForCapture(
  api: YooKassaPaymentApiShape,
  rawForDb: string
): Promise<void> {
  const payUp = await query(
    `UPDATE payments
     SET status = 'waiting_for_capture',
         updated_at = CURRENT_TIMESTAMP,
         raw_last_event = $1::jsonb
     WHERE provider = 'yookassa' AND provider_payment_id = $2`,
    [rawForDb, api.id]
  );
  if ((payUp.rowCount ?? 0) === 0) {
    throw new Error('payment_row_missing_for_webhook');
  }
}

async function tryPurchaseSideEffects(
  orderId: string,
  api: YooKassaPaymentApiShape
): Promise<void> {
  const albumIdMeta = metaString(api.metadata, 'albumId');
  const customerEmailMeta = metaString(api.metadata, 'customerEmail');
  if (!albumIdMeta || !customerEmailMeta) {
    return;
  }

  try {
    const orderResult = await query<{
      album_id: string;
      customer_email: string;
      buyer_display_name: string | null;
    }>(
      `SELECT album_id, customer_email, buyer_display_name
       FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) return;

    const row = orderResult.rows[0];
    const albumKey = row.album_id || albumIdMeta;
    const customerEmail = row.customer_email || customerEmailMeta;

    console.log('yookassa_webhook.purchase_upsert', {
      orderIdSuffix: `…${orderId.slice(-6)}`,
      albumKeySuffix: albumKey.length > 8 ? `…${albumKey.slice(-8)}` : albumKey,
    });

    const purchase = await upsertPurchaseRecord(orderId, customerEmail, albumKey);

    if (!purchase) return;

    const album = await resolveAlbumByKey(albumKey);

    if (!album) {
      console.error('yookassa_webhook.album_missing_for_email', {
        albumKeySuffix: albumKey.slice(-8),
      });
      return;
    }

    try {
      const { sendPurchaseEmail } = await import('./lib/email');
      const { resolveEmailLocaleForAddress } = await import('./lib/user-preferred-language');
      const customerName = row.buyer_display_name?.trim() || undefined;

      const locale = await resolveEmailLocaleForAddress(customerEmail, album.lang);

      const emailResult = await sendPurchaseEmail({
        to: customerEmail,
        customerName,
        albumName: album.album,
        artistName: album.artist,
        orderId,
        albumSlug: album.albumSlug,
        albumCover: album.cover,
        albumUserId: album.userId,
        albumLang: album.lang,
        paymentId: api.id,
        locale,
      });

      if (emailResult.alreadySent) {
        console.log('yookassa_webhook.email_already_sent', {
          orderIdSuffix: `…${orderId.slice(-6)}`,
          paymentIdSuffix: `…${api.id.slice(-6)}`,
        });
      } else if (!emailResult.success) {
        console.error('yookassa_webhook.email_failed', {
          orderIdSuffix: `…${orderId.slice(-6)}`,
          err: emailResult.error,
        });
      }
    } catch (emailErr) {
      console.error('yookassa_webhook.email_exception', {
        orderIdSuffix: `…${orderId.slice(-6)}`,
        err: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }
  } catch (e) {
    console.error('yookassa_webhook.purchase_side_effect_error', {
      orderIdSuffix: `…${orderId.slice(-6)}`,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
